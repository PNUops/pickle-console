import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteDomain,
  fetchDomains,
  fetchGroup,
  publishVm,
  unpublishVm,
  updatePublication,
  verifyDomain,
  type DomainDetail,
  type DomainVerification,
  type PublicationView,
  type RouteView,
  type VmDetail,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatDateTime } from '../lib/format'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CertificateStatusBadge,
  ConfirmNameModal,
  DomainKindBadge,
  DomainStatusBadge,
  FormField,
  Input,
  RouteStatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from './ui'
import { CERTIFICATE_KIND_LABELS } from '../lib/status'
import {
  CUSTOM_DOMAIN_FORMAT_MESSAGE,
  HOSTNAME_RE,
  normalizeCustomDomain,
} from '../lib/validation'

/** 이 상태에서만 공개(publish) 접수가 가능하다 (계약: 그 외 409 VM_INVALID_STATE). */
const PUBLISHABLE_STATUSES: VmDetail['status'][] = ['RUNNING', 'STOPPED']

/** 요약 Alert에서 필드 키 대신 보여줄 이름. */
const FIELD_LABELS: Record<string, string> = {
  port: '공개 포트',
  subdomain: '서브도메인',
  customDomain: '커스텀 도메인',
  rootDomain: '루트 도메인',
}

/**
 * 폼 오류 요약 Alert. 폼에 표시 자리가 있는 필드 오류(slots)는 해당 필드 밑에
 * 이미 보이므로 요약을 숨기고, 자리가 없는 키(예: 변경 폼의 subdomain)는 목록으로
 * 함께 노출해 서버가 준 메시지가 조용히 사라지지 않게 한다.
 */
function ErrorSummary({
  error,
  fieldErrors,
  slots,
}: {
  error: string | null
  fieldErrors: Record<string, string>
  slots: string[]
}) {
  if (!error) return null
  const unslotted = Object.entries(fieldErrors).filter(([field]) => !slots.includes(field))
  const hasSlotted = slots.some((key) => fieldErrors[key] != null)
  if (unslotted.length === 0 && hasSlotted) return null

  return (
    <Alert variant="danger" title={error}>
      {unslotted.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4">
          {unslotted.map(([field, message]) => (
            <li key={field}>
              {FIELD_LABELS[field] ?? field}: {message}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  )
}

/**
 * 클라이언트 측 포트 사전 검증 (서버 422 규칙과 동일: 1–65535, SSH 22 금지).
 * 통과하면 null, 아니면 필드 오류 메시지를 돌려준다.
 */
function portFieldError(raw: string): string | null {
  if (!/^\d+$/.test(raw.trim())) return '포트 번호를 입력해 주세요.'
  const port = Number(raw.trim())
  if (port < 1 || port > 65535) return '포트는 1–65535 범위여야 합니다.'
  if (port === 22) return 'VM의 SSH 포트(22)는 공개할 수 없습니다.'
  return null
}

/**
 * VM HTTP 공개 섹션. 소유 그룹의 OWNER/EDITOR만 공개·변경·해제할 수 있고
 * (그룹 myRole로 판정), VIEWER 이상은 현재 상태를 읽기 전용으로 본다.
 */
export function VmPublishSection({ vm }: { vm: VmDetail }) {
  // 그룹 myRole로 변경 권한을 판정한다 (계약 §2.4: 도메인·포트 설정은 OWNER/EDITOR).
  const group = useQuery({
    queryKey: ['groups', vm.groupId],
    queryFn: () => fetchGroup(vm.groupId),
  })
  const canMutate = group.data?.myRole === 'OWNER' || group.data?.myRole === 'EDITOR'

  // 권한 조회 실패는 "권한 없음"과 다르다 — 읽기 전용 안내 대신 오류·재시도를 보여준다.
  const roleFallback = group.isError ? (
    <RoleLoadError retrying={group.isFetching} onRetry={() => void group.refetch()} />
  ) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>HTTP 서비스 공개</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {vm.publication == null ? (
          (roleFallback ?? <PublishForm vm={vm} canMutate={canMutate} />)
        ) : (
          <PublicationDetail
            vm={vm}
            publication={vm.publication}
            canMutate={canMutate}
            mutateFallback={roleFallback}
          />
        )}
        <LeftoverDomainList
          vm={vm}
          activeDomainId={vm.publication?.domain?.id ?? null}
          canMutate={canMutate}
        />
      </CardContent>
    </Card>
  )
}

/** GET /groups/{id} 실패 시의 안내 — 역할이 낮은 것이 아니라 조회가 실패한 것. */
function RoleLoadError({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <Alert variant="warning" title="권한 정보를 불러오지 못했습니다">
      <div className="space-y-2">
        <p>공개 설정 권한을 확인하지 못해 변경 기능을 잠시 숨겼습니다.</p>
        <Button size="sm" variant="secondary" loading={retrying} onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    </Alert>
  )
}

/* ─── 처음 공개 폼 ─── */

function PublishForm({ vm, canMutate }: { vm: VmDetail; canMutate: boolean }) {
  const queryClient = useQueryClient()
  const [port, setPort] = useState('80')
  // 신청 때 선지정한 서브도메인이 있으면 채워 두고, 없으면 여기서 직접 정한다.
  const [subdomain, setSubdomain] = useState(vm.requestedSubdomain ?? '')
  const [customDomain, setCustomDomain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const publishable = PUBLISHABLE_STATUSES.includes(vm.status)
  const usingCustomDomain = normalizeCustomDomain(customDomain) !== ''
  // 플랫폼 서브도메인으로 공개하려면 이름이 있어야 한다 (서버는 없으면 422).
  const missingSubdomain = !usingCustomDomain && subdomain.trim() === ''

  const publish = useMutation({
    mutationFn: () => {
      // 신청서와 같은 규칙: trim+lowercase 정규화한 값을 전송한다.
      const domain = normalizeCustomDomain(customDomain)
      // 커스텀 도메인과 서브도메인은 함께 보낼 수 없다 (서버 422).
      if (domain !== '') {
        return publishVm(vm.id, { port: Number(port), customDomain: domain })
      }
      return publishVm(vm.id, {
        port: Number(port),
        customDomain: null,
        subdomain: subdomain.trim(),
        ...(vm.requestedRootDomain ? { rootDomain: vm.requestedRootDomain } : {}),
      })
    },
    onSuccess: async () => {
      setError(null)
      setFieldErrors({})
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (err) => {
      const apiError = toApiError(err, 'HTTP 서비스 공개를 접수하지 못했습니다.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setError(apiError.message)
    },
  })

  if (!canMutate) {
    return (
      <p className="text-sm text-neutral-500">
        이 VM은 아직 HTTP 서비스가 공개되어 있지 않습니다. 공개는 그룹의 소유자·편집자만
        설정할 수 있습니다.
      </p>
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    const portError = portFieldError(port)
    if (portError) {
      setFieldErrors({ port: portError })
      return
    }
    // 커스텀 도메인 사전 검증 (서버 422와 동일 규칙) — 왕복 없이 즉시 안내한다.
    const domain = normalizeCustomDomain(customDomain)
    if (domain !== '' && !HOSTNAME_RE.test(domain)) {
      setFieldErrors({ customDomain: CUSTOM_DOMAIN_FORMAT_MESSAGE })
      return
    }
    publish.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-neutral-600">
        VM 내부에서 열려 있는 HTTP 서비스 포트를 외부에 공개합니다. 공개 주소는 아래
        서브도메인으로 정해지며, 나중에 바꾸려면 공개를 해제하고 다시 공개해야 합니다.
      </p>

      {!publishable && (
        <Alert variant="warning">
          실행 중 또는 중지됨 상태의 VM만 공개할 수 있습니다. 현재 상태에서는 공개를
          접수할 수 없습니다.
        </Alert>
      )}
      <ErrorSummary
        error={error}
        fieldErrors={fieldErrors}
        slots={['port', 'subdomain', 'customDomain']}
      />

      <div className="flex flex-wrap items-start gap-4">
        <FormField
          label="공개 포트"
          required
          error={fieldErrors.port}
          description="기본 80. VM의 SSH 포트(22)는 공개할 수 없습니다."
          className="w-40"
        >
          <Input
            inputMode="numeric"
            value={port}
            onChange={(event) => setPort(event.target.value)}
          />
        </FormField>
        <FormField
          label="서브도메인"
          error={fieldErrors.subdomain}
          description={
            vm.requestedRootDomain
              ? `공개 주소는 ${subdomain.trim() || '<서브도메인>'}.${vm.requestedRootDomain} 이 됩니다.`
              : '플랫폼 도메인 아래에 공개할 이름입니다. (소문자·숫자·하이픈, 3~40자)'
          }
          className="min-w-64 flex-1"
        >
          <Input
            placeholder="capstone-team3"
            value={subdomain}
            maxLength={40}
            disabled={usingCustomDomain}
            onChange={(event) => setSubdomain(event.target.value)}
          />
        </FormField>
        <FormField
          label="커스텀 도메인 (선택)"
          error={fieldErrors.customDomain}
          description="내 소유 도메인을 연결하려면 입력하세요. 비워 두면 위 서브도메인으로 공개됩니다."
          className="min-w-64 flex-1"
        >
          <Input
            placeholder="app.example.com"
            value={customDomain}
            onChange={(event) => setCustomDomain(event.target.value)}
          />
        </FormField>
      </div>

      {publishable && missingSubdomain && (
        <p className="text-sm text-neutral-500">공개할 서브도메인을 입력해 주세요.</p>
      )}

      <Button
        type="submit"
        loading={publish.isPending}
        disabled={!publishable || missingSubdomain}
      >
        HTTP 서비스 공개
      </Button>
    </form>
  )
}

/* ─── 공개 상태 상세 + 변경/해제 ─── */

function PublicationDetail({
  vm,
  publication,
  canMutate,
  mutateFallback = null,
}: {
  vm: VmDetail
  publication: PublicationView
  canMutate: boolean
  /** 권한을 알 수 없을 때(조회 실패) 읽기 전용 안내 대신 표시할 내용. */
  mutateFallback?: ReactNode
}) {
  // 접수 직후·해제 진행 중 등 과도기에는 중첩 블록(route/certificate/verification)이
  // 아직 없을 수 있다 — 어떤 조합이 와도 크래시 없이 "준비 중"으로 렌더링한다.
  const domain: DomainDetail | null = publication.domain ?? null
  const route: RouteView | null = publication.route ?? null
  const certificate = publication.certificate ?? null
  const isCustom = domain?.kind === 'CUSTOM'

  return (
    <div className="space-y-5">
      {/* 공개 주소 + 상태 요약 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://${publication.fqdn}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm font-medium text-primary-700 hover:underline"
          >
            {publication.fqdn}
          </a>
          {domain && (
            <>
              <DomainKindBadge kind={domain.kind} />
              <DomainStatusBadge status={domain.status} />
            </>
          )}
        </div>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <SummaryField label="공개 포트">
            {route ? route.targetPort : '적용 대기 중'}
          </SummaryField>
          <SummaryField label="라우트 상태">
            {route ? (
              <RouteStatusBadge status={route.status} />
            ) : (
              <span className="text-neutral-500">공개 준비 중</span>
            )}
          </SummaryField>
        </dl>
      </div>

      {/* 라우트 적용 상태 안내 (라우트가 아직 만들어지지 않은 과도기도 적용 중으로 안내) */}
      {(route == null || route.status === 'PENDING') && (
        <Alert variant="info">
          공개 설정을 적용하고 있습니다. 잠시 후 상태가 자동으로 갱신됩니다.
        </Alert>
      )}
      {route?.status === 'FAILED' && (
        <Alert variant="danger" title="라우트 적용에 실패했습니다">
          {route.lastError ?? '프록시 적용 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'}
        </Alert>
      )}

      {/* 인증서 상태 */}
      {certificate && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
            <span className="text-xs font-medium text-neutral-500">인증서</span>
            <span>{CERTIFICATE_KIND_LABELS[certificate.kind]}</span>
            <CertificateStatusBadge status={certificate.status} />
            {certificate.notAfter && (
              <span className="text-xs text-neutral-500">
                만료 {formatDateTime(certificate.notAfter)}
              </span>
            )}
          </div>
          {certificate.status === 'FAILED' && certificate.lastError && (
            <Alert variant="warning" title="인증서 발급·갱신에 실패했습니다">
              {certificate.lastError}
            </Alert>
          )}
        </div>
      )}

      {/* 커스텀 도메인 검증 안내 */}
      {isCustom && domain?.verification && (
        <CustomDomainVerification
          vm={vm}
          domain={domain}
          verification={domain.verification}
          canMutate={canMutate}
        />
      )}

      {/* 변경·해제 액션 (OWNER/EDITOR). 라우트가 생기는 시점에 다시 마운트해
          포트 초기값이 임시 기본값(80)이 아닌 실제 적용 포트로 채워지게 한다. */}
      {canMutate ? (
        <PublicationActions
          key={route == null ? 'route-pending' : 'route-live'}
          vm={vm}
          publication={publication}
        />
      ) : (
        (mutateFallback ?? (
          <p className="text-sm text-neutral-500">
            공개 설정 변경·해제는 그룹의 소유자·편집자만 할 수 있습니다.
          </p>
        ))
      )}
    </div>
  )
}

function SummaryField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{children}</dd>
    </div>
  )
}

/* ─── 커스텀 도메인 소유권·전파 검증 안내 ─── */

function CustomDomainVerification({
  vm,
  domain,
  verification,
  canMutate,
}: {
  vm: VmDetail
  domain: DomainDetail
  verification: DomainVerification
  canMutate: boolean
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const reverify = useMutation({
    mutationFn: () => verifyDomain(domain.id),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (err) => setError(toApiError(err, '검증 재시도를 접수하지 못했습니다.').message),
  })

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">도메인 소유권·연결 확인</h3>
      <p className="text-sm text-neutral-600">
        아래 DNS 레코드를 도메인에 추가하면 소유권·연결이 자동으로 확인되고 인증서가
        발급됩니다. 전파에는 수 분~수십 분이 걸릴 수 있습니다.
      </p>
      <Table>
        <THead>
          <TR>
            <TH>종류</TH>
            <TH>이름</TH>
            <TH>값</TH>
            <TH>확인</TH>
          </TR>
        </THead>
        <TBody>
          {verification.requiredRecords.map((record) => {
            const verified = record.type === 'A' ? verification.aVerified : verification.txtVerified
            return (
              <TR key={`${record.type}-${record.name}`}>
                <TD className="font-mono">{record.type}</TD>
                <TD className="font-mono break-all">{record.name}</TD>
                <TD className="font-mono break-all">{record.value}</TD>
                <TD className="whitespace-nowrap">
                  {verified ? (
                    <span className="text-success-700">확인됨</span>
                  ) : (
                    <span className="text-neutral-400">대기 중</span>
                  )}
                </TD>
              </TR>
            )
          })}
        </TBody>
      </Table>
      {verification.lastError && (
        <p className="text-sm text-warning-800">{verification.lastError}</p>
      )}
      {verification.lastCheckedAt && (
        <p className="text-xs text-neutral-500">
          마지막 확인 {formatDateTime(verification.lastCheckedAt)}
        </p>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
      {canMutate && (
        <Button
          variant="secondary"
          size="sm"
          loading={reverify.isPending}
          onClick={() => reverify.mutate()}
        >
          지금 다시 확인
        </Button>
      )}
    </section>
  )
}

/* ─── 포트·커스텀 도메인 변경 + 공개 해제 ─── */

function PublicationActions({
  vm,
  publication,
}: {
  vm: VmDetail
  publication: PublicationView
}) {
  const queryClient = useQueryClient()
  // 과도기(라우트 미생성)에는 실제 포트를 알 수 없다 — 폼을 비활성화하고,
  // 라우트가 생기면 부모가 key로 다시 마운트해 실제 값으로 초기화한다.
  const routeReady = publication.route != null
  const [port, setPort] = useState(String(publication.route?.targetPort ?? 80))
  const [customDomain, setCustomDomain] = useState(
    publication.domain?.kind === 'CUSTOM' ? publication.fqdn : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [unpublishOpen, setUnpublishOpen] = useState(false)

  const isCustom = publication.domain?.kind === 'CUSTOM'

  const change = useMutation({
    mutationFn: (body: Parameters<typeof updatePublication>[1]) =>
      updatePublication(vm.id, body),
    onSuccess: async () => {
      setError(null)
      setFieldErrors({})
      setMessage('공개 설정 변경을 접수했습니다. 잠시 후 적용 상태가 갱신됩니다.')
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (err) => {
      const apiError = toApiError(err, '공개 설정 변경을 접수하지 못했습니다.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setError(apiError.message)
      setMessage(null)
    },
  })

  const unpublish = useMutation({
    mutationFn: () => unpublishVm(vm.id),
    onSuccess: async (data) => {
      setUnpublishOpen(false)
      setError(null)
      setFieldErrors({})
      setMessage(data.message)
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (err) => {
      setUnpublishOpen(false)
      setFieldErrors({})
      // 직전 변경의 성공 배너가 실패 알림과 나란히 남지 않게 함께 지운다.
      setMessage(null)
      setError(toApiError(err, '공개 해제를 접수하지 못했습니다.').message)
    },
  })

  const submitPort = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setMessage(null)
    const portError = portFieldError(port)
    if (portError) {
      setFieldErrors({ port: portError })
      return
    }
    change.mutate({ port: Number(port) })
  }

  const detachCustom = () => {
    setError(null)
    setFieldErrors({})
    setMessage(null)
    change.mutate({ customDomain: null })
  }

  const attachCustom = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setMessage(null)
    // 신청서·공개 폼과 같은 규칙으로 정규화·사전 검증한 값을 전송한다.
    const domain = normalizeCustomDomain(customDomain)
    if (!HOSTNAME_RE.test(domain)) {
      setFieldErrors({ customDomain: CUSTOM_DOMAIN_FORMAT_MESSAGE })
      return
    }
    change.mutate({ customDomain: domain })
  }

  return (
    <section className="space-y-4 border-t border-neutral-100 pt-4">
      <h3 className="text-sm font-semibold text-neutral-800">공개 설정 변경</h3>
      {message && <Alert variant="success">{message}</Alert>}
      {/* 변경 폼에 자리가 없는 필드 오류(예: 플랫폼 복귀 시 subdomain)도 요약으로 노출한다.
          커스텀 도메인이 이미 연결된 상태에서는 도메인 입력칸 자체가 없으므로
          customDomain 오류도 표시 자리가 없다 — 요약으로 돌린다. */}
      <ErrorSummary
        error={error}
        fieldErrors={fieldErrors}
        slots={isCustom ? ['port'] : ['port', 'customDomain']}
      />

      <form onSubmit={submitPort} className="flex flex-wrap items-start gap-4" noValidate>
        <FormField
          label="공개 포트"
          required
          error={fieldErrors.port}
          description={
            routeReady ? '22는 공개할 수 없습니다.' : '공개 설정 적용 중에는 변경할 수 없습니다.'
          }
          className="w-40"
        >
          <Input
            inputMode="numeric"
            value={port}
            disabled={!routeReady}
            onChange={(event) => setPort(event.target.value)}
          />
        </FormField>
        <Button
          type="submit"
          variant="secondary"
          loading={change.isPending}
          disabled={!routeReady}
          className="mt-6"
        >
          포트 변경
        </Button>
      </form>

      {isCustom ? (
        <div className="space-y-2">
          <p className="text-sm text-neutral-600">
            커스텀 도메인 연결을 해제하면 플랫폼 서브도메인 공개로 되돌아갑니다. 이때
            커스텀 도메인과 인증서는 정리되므로, 나중에 다시 연결하면 소유권 검증을
            처음부터 진행합니다.
          </p>
          <Button variant="secondary" size="sm" loading={change.isPending} onClick={detachCustom}>
            커스텀 도메인 연결 해제
          </Button>
        </div>
      ) : (
        <form onSubmit={attachCustom} className="flex flex-wrap items-start gap-4" noValidate>
          <FormField
            label="커스텀 도메인 연결"
            error={fieldErrors.customDomain}
            description="내 소유 도메인을 연결합니다 (소유권·인증서 검증 필요)."
            className="min-w-64 flex-1"
          >
            <Input
              placeholder="app.example.com"
              value={customDomain}
              onChange={(event) => setCustomDomain(event.target.value)}
            />
          </FormField>
          <Button
            type="submit"
            variant="secondary"
            loading={change.isPending}
            disabled={customDomain.trim() === ''}
            className="mt-6"
          >
            도메인 연결
          </Button>
        </form>
      )}

      <div className="border-t border-neutral-100 pt-4">
        <Button variant="danger" onClick={() => setUnpublishOpen(true)}>
          HTTP 공개 해제
        </Button>
        <ConfirmNameModal
          open={unpublishOpen}
          onClose={() => setUnpublishOpen(false)}
          title="HTTP 공개 해제"
          expectedName={vm.name}
          confirmLabel="공개 해제"
          loading={unpublish.isPending}
          onConfirm={() => unpublish.mutate()}
        >
          <Alert variant="warning" title="외부 접근이 차단됩니다">
            공개를 해제하면 {publication.fqdn} 주소로 더 이상 접근할 수 없습니다.
            {isCustom
              ? ' 커스텀 도메인의 검증 상태는 보존되어 같은 도메인으로 다시 공개하면 재검증 없이 재사용됩니다. 더 이상 쓰지 않으면 해제 후 이 카드의 "남은 도메인" 목록에서 삭제할 수 있습니다.'
              : ' 플랫폼 서브도메인은 함께 정리됩니다.'}
          </Alert>
        </ConfirmNameModal>
      </div>
    </section>
  )
}

/* ─── 공개 해제 후 남은 도메인 (tombstone) 목록·삭제 ─── */

/**
 * 이 VM에 남아 있는, 현재 공개에 연결되지 않은 도메인 목록. 커스텀 도메인은
 * 공개 해제 후에도 검증 상태 보존을 위해 행이 남고(계약 unpublishVm), 같은
 * 도메인으로 다시 공개하면 서버가 이 행을 되살려(revive) 보존된 검증 상태를
 * 재사용한다. 삭제(DELETE /domains/{id})는 도메인을 더 이상 쓰지 않을 때만.
 */
function LeftoverDomainList({
  vm,
  activeDomainId,
  canMutate,
}: {
  vm: VmDetail
  activeDomainId: number | null
  canMutate: boolean
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const domains = useQuery({
    queryKey: ['domains', { vmId: vm.id }],
    queryFn: () => fetchDomains({ vmId: vm.id }),
  })

  const remove = useMutation({
    mutationFn: (domainId: number) => deleteDomain(domainId),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
    },
    onError: async (err) => {
      const apiError = toApiError(err, '도메인 삭제를 접수하지 못했습니다.')
      setError(apiError.message)
      // 이미 서버에서 사라진 도메인(404)이면 목록을 다시 불러와 낡은 행을 정리한다.
      if (apiError.problem?.status === 404) {
        await queryClient.invalidateQueries({ queryKey: ['domains'] })
      }
    },
  })

  // 현재 공개에 연결된 도메인은 공개 카드 본문이 담당한다 — 남은 행만 노출.
  const leftovers = (domains.data?.content ?? []).filter((d) => d.id !== activeDomainId)
  if (leftovers.length === 0) return null

  return (
    <section className="space-y-2 border-t border-neutral-100 pt-4">
      <h3 className="text-sm font-semibold text-neutral-800">남은 도메인</h3>
      <p className="text-sm text-neutral-600">
        공개 해제 후 남아 있는 도메인입니다. 같은 도메인으로 다시 공개하면 보존된
        소유권 검증 상태를 그대로 재사용하므로 재검증이 필요 없습니다. 도메인을 더
        이상 사용하지 않을 때만 삭제하세요 — 삭제하면 검증 상태도 함께 정리됩니다.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <ul className="space-y-2">
        {leftovers.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-neutral-800">{d.fqdn}</span>
            <DomainKindBadge kind={d.kind} />
            <DomainStatusBadge status={d.status} />
            {canMutate && (
              <Button
                variant="danger"
                size="sm"
                loading={remove.isPending && remove.variables === d.id}
                onClick={() => remove.mutate(d.id)}
              >
                도메인 삭제
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
