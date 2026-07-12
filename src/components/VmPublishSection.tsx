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

/** 이 상태에서만 공개(publish) 접수가 가능하다 (계약: 그 외 409 VM_INVALID_STATE). */
const PUBLISHABLE_STATUSES: VmDetail['status'][] = ['RUNNING', 'STOPPED']

/**
 * VM HTTP 공개 섹션. 소유 그룹의 OWNER/MANAGER만 공개·변경·해제할 수 있고
 * (그룹 myRole로 판정), VIEWER 이상은 현재 상태를 읽기 전용으로 본다.
 */
export function VmPublishSection({ vm }: { vm: VmDetail }) {
  // 그룹 myRole로 변경 권한을 판정한다 (계약 §2.4: 도메인·포트 설정은 OWNER/MANAGER).
  const group = useQuery({
    queryKey: ['groups', vm.groupId],
    queryFn: () => fetchGroup(vm.groupId),
  })
  const canMutate = group.data?.myRole === 'OWNER' || group.data?.myRole === 'MANAGER'

  if (!vm.httpPublishGranted) {
    // 공개가 미공개인 경우에만 안내를 노출한다 (허가된 뒤 공개된 VM은 아래 카드로).
    if (vm.publication == null) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>HTTP 서비스 공개</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="info" title="HTTP 공개가 허가되지 않았습니다">
              이 VM은 신청 승인 시 HTTP 공개가 허용되지 않았습니다. 외부 공개가
              필요하면 관리자에게 문의해 주세요.
            </Alert>
            <LeftoverDomainList vm={vm} activeDomainId={null} canMutate={canMutate} />
          </CardContent>
        </Card>
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>HTTP 서비스 공개</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {vm.publication == null ? (
          <PublishForm vm={vm} canMutate={canMutate} />
        ) : (
          <PublicationDetail vm={vm} publication={vm.publication} canMutate={canMutate} />
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

/* ─── 처음 공개 폼 ─── */

function PublishForm({ vm, canMutate }: { vm: VmDetail; canMutate: boolean }) {
  const queryClient = useQueryClient()
  const [port, setPort] = useState('80')
  const [customDomain, setCustomDomain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const publishable = PUBLISHABLE_STATUSES.includes(vm.status)

  const publish = useMutation({
    mutationFn: () =>
      publishVm(vm.id, {
        port: Number(port),
        customDomain: customDomain.trim() === '' ? null : customDomain.trim(),
      }),
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
        이 VM은 아직 HTTP 서비스가 공개되어 있지 않습니다. 공개는 그룹의 소유자·관리자만
        설정할 수 있습니다.
      </p>
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    if (!/^\d+$/.test(port.trim())) {
      setFieldErrors({ port: '포트 번호를 입력해 주세요.' })
      return
    }
    publish.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-neutral-600">
        VM 내부에서 열려 있는 HTTP 서비스 포트를 외부에 공개합니다. 공개 주소(플랫폼
        서브도메인)는 <strong>신청 승인 시 관리자가 부여한 이름</strong>(미부여 시 자동
        생성)으로 정해지며, 여기서 직접 지정할 수 없습니다.
      </p>

      {!publishable && (
        <Alert variant="warning">
          실행 중 또는 중지됨 상태의 VM만 공개할 수 있습니다. 현재 상태에서는 공개를
          접수할 수 없습니다.
        </Alert>
      )}
      {error && Object.keys(fieldErrors).length === 0 && (
        <Alert variant="danger">{error}</Alert>
      )}

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
          label="커스텀 도메인 (선택)"
          error={fieldErrors.customDomain}
          description="내 소유 도메인을 연결하려면 입력하세요. 비워 두면 플랫폼 서브도메인으로 공개됩니다."
          className="min-w-64 flex-1"
        >
          <Input
            placeholder="app.example.com"
            value={customDomain}
            onChange={(event) => setCustomDomain(event.target.value)}
          />
        </FormField>
      </div>

      <Button type="submit" loading={publish.isPending} disabled={!publishable}>
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
}: {
  vm: VmDetail
  publication: PublicationView
  canMutate: boolean
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

      {/* 변경·해제 액션 (OWNER/MANAGER) */}
      {canMutate ? (
        <PublicationActions vm={vm} publication={publication} />
      ) : (
        <p className="text-sm text-neutral-500">
          공개 설정 변경·해제는 그룹의 소유자·관리자만 할 수 있습니다.
        </p>
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
  // 과도기(라우트 미생성)에도 크래시하지 않도록 방어적으로 초기화한다.
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
      setMessage(data.message)
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (err) => {
      setUnpublishOpen(false)
      setError(toApiError(err, '공개 해제를 접수하지 못했습니다.').message)
    },
  })

  const submitPort = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setMessage(null)
    if (!/^\d+$/.test(port.trim())) {
      setFieldErrors({ port: '포트 번호를 입력해 주세요.' })
      return
    }
    change.mutate({ port: Number(port) })
  }

  const detachCustom = () => {
    setError(null)
    setMessage(null)
    change.mutate({ customDomain: null })
  }

  const attachCustom = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setMessage(null)
    change.mutate({ customDomain: customDomain.trim() })
  }

  return (
    <section className="space-y-4 border-t border-neutral-100 pt-4">
      <h3 className="text-sm font-semibold text-neutral-800">공개 설정 변경</h3>
      {message && <Alert variant="success">{message}</Alert>}
      {error && Object.keys(fieldErrors).length === 0 && (
        <Alert variant="danger">{error}</Alert>
      )}

      <form onSubmit={submitPort} className="flex flex-wrap items-start gap-4" noValidate>
        <FormField
          label="공개 포트"
          required
          error={fieldErrors.port}
          description="22는 공개할 수 없습니다."
          className="w-40"
        >
          <Input
            inputMode="numeric"
            value={port}
            onChange={(event) => setPort(event.target.value)}
          />
        </FormField>
        <Button type="submit" variant="secondary" loading={change.isPending} className="mt-6">
          포트 변경
        </Button>
      </form>

      {isCustom ? (
        <div className="space-y-2">
          <p className="text-sm text-neutral-600">
            커스텀 도메인 연결을 해제하면 플랫폼 서브도메인 공개로 되돌아갑니다.
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
              ? ' 커스텀 도메인의 검증 상태는 보존되며, 해제 후 이 카드의 "남은 도메인" 목록에서 도메인 자체를 삭제할 수 있습니다.'
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
 * 공개 해제 후에도 검증 상태 보존을 위해 행이 남는데(계약 unpublishVm),
 * 같은 도메인을 다시 연결하려면 먼저 여기서 삭제해야 한다 (DELETE /domains/{id}).
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
    onError: (err) => setError(toApiError(err, '도메인 삭제를 접수하지 못했습니다.').message),
  })

  // 현재 공개에 연결된 도메인은 공개 카드 본문이 담당한다 — 남은 행만 노출.
  const leftovers = (domains.data?.content ?? []).filter((d) => d.id !== activeDomainId)
  if (leftovers.length === 0) return null

  return (
    <section className="space-y-2 border-t border-neutral-100 pt-4">
      <h3 className="text-sm font-semibold text-neutral-800">남은 도메인</h3>
      <p className="text-sm text-neutral-600">
        공개 해제 후 남아 있는 도메인입니다. 같은 도메인을 다시 연결하려면 먼저
        삭제해야 하며, 삭제하면 소유권 검증 상태도 함께 정리됩니다.
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
