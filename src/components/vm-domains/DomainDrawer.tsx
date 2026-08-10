import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteDomain,
  updateDomainPort,
  verifyDomain,
  type DomainSummary,
  type PublicationView,
  type VmDetail,
} from '../../api/queries'
import { toApiError } from '../../api/problem'
import { formatDateTime, kstDateString } from '../../lib/format'
import { CERTIFICATE_KIND_LABELS } from '../../lib/status'
import {
  Alert,
  Button,
  CertificateStatusBadge,
  DdayBadge,
  Drawer,
  DomainConnectionBadge,
  DomainKindBadge,
  FormField,
  Input,
  Modal,
  RouteStatusBadge,
  useToast,
} from '../ui'
import { ConnectionJourney } from './ConnectionJourney'
import { DnsRecordTable } from './DnsRecordTable'
import { foldDomainStatus } from './domain-status'
import { portFieldError } from './domain-form'

interface DomainDrawerProps {
  vm: VmDetail
  /** 예약 중(해제됨) 도메인 행 — 서빙 목록에 없는 id는 여기서 찾는다. */
  reserved: DomainSummary[]
  /** 열려 있는 도메인 id (null = 닫힘). */
  openId: string | null
  onClose: () => void
  canMutate: boolean
  /** 포트 변경·해제 성공 후 상위 목록의 "직전 사용 포트" 기억을 갱신한다. */
  onPortUsed: (port: number) => void
}

/**
 * 도메인 상세 드로어 — 서빙 중이면 연결 진행·DNS 레코드·포트 변경·해제,
 * 예약 중이면 예약 안내와 즉시 반납을 담는다.
 */
export function DomainDrawer({
  vm,
  reserved,
  openId,
  onClose,
  canMutate,
  onPortUsed,
}: DomainDrawerProps) {
  const pub = vm.publications.find((p) => p.domain.id === openId) ?? null
  const reservedRow = pub ? null : (reserved.find((d) => d.id === openId) ?? null)
  const title = pub?.fqdn ?? reservedRow?.fqdn ?? '도메인 상세'

  return (
    <Drawer open={openId != null} onClose={onClose} title={title}>
      {pub && (
        <LiveDomainBody
          vm={vm}
          pub={pub}
          canMutate={canMutate}
          onReleased={onClose}
          onPortUsed={onPortUsed}
        />
      )}
      {reservedRow && (
        <ReservedDomainBody
          vm={vm}
          domain={reservedRow}
          canMutate={canMutate}
          onReturned={onClose}
        />
      )}
    </Drawer>
  )
}

/* ─── 서빙 중 도메인 상세 ─── */

export function LiveDomainBody({
  vm,
  pub,
  canMutate,
  onReleased,
  onPortUsed,
  notice = null,
}: {
  vm: VmDetail
  pub: PublicationView
  canMutate: boolean
  /** 해제 접수 뒤 드로어를 닫는 등 후처리. */
  onReleased: () => void
  onPortUsed: (port: number) => void
  /** 본문 위에 표시할 알림 (커스텀 연결 접수 직후 안내 등). */
  notice?: ReactNode
}) {
  const domain = pub.domain
  const isCustom = domain.kind === 'CUSTOM'
  const fold = foldDomainStatus({
    kind: domain.kind,
    status: domain.status,
    route: pub.route,
    certificate: pub.certificate,
  })
  const certificate = pub.certificate ?? null

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <DomainKindBadge kind={domain.kind} />
          <DomainConnectionBadge status={fold} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://${pub.fqdn}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm font-medium text-primary-700 hover:underline"
          >
            https://{pub.fqdn}
            <span aria-hidden="true"> ↗</span>
          </a>
          {pub.route && (
            <span className="font-mono text-xs text-neutral-500">
              → :{pub.route.targetPort}
            </span>
          )}
        </div>
        {fold.hint && <p className="text-sm text-neutral-500">{fold.hint}</p>}
      </div>

      {notice}

      {isCustom ? (
        <ConnectionJourney pub={pub} />
      ) : (
        // 플랫폼 서브도메인은 여정을 접는다 — 확인·발급 축이 없다.
        <section className="space-y-2">
          <p className="text-sm text-neutral-600">
            플랫폼 서브도메인은 소유 확인과 개별 인증서 발급이 필요 없습니다.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
            <span className="text-xs font-medium text-neutral-500">라우트</span>
            {pub.route ? (
              <RouteStatusBadge status={pub.route.status} />
            ) : (
              <span className="text-neutral-500">적용 준비 중</span>
            )}
          </div>
          {certificate && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
              <span className="text-xs font-medium text-neutral-500">인증서</span>
              <span>{CERTIFICATE_KIND_LABELS[certificate.kind]}</span>
              <CertificateStatusBadge status={certificate.status} />
            </div>
          )}
        </section>
      )}

      {pub.route?.status === 'FAILED' && pub.route.lastError && (
        <Alert variant="danger" title="라우트 적용에 실패했습니다">
          {pub.route.lastError}
        </Alert>
      )}
      {certificate?.status === 'FAILED' && certificate.lastError && (
        <Alert variant="warning" title="인증서 발급·갱신에 실패했습니다">
          {certificate.lastError}
        </Alert>
      )}

      {isCustom && certificate?.notAfter && (
        <p className="text-xs text-neutral-500">
          인증서 만료 {formatDateTime(certificate.notAfter)}
        </p>
      )}

      {isCustom && domain.verification && (
        <DnsRecordSection vm={vm} pub={pub} canMutate={canMutate} />
      )}

      {canMutate && (
        <ManageSection
          vm={vm}
          pub={pub}
          onReleased={onReleased}
          onPortUsed={onPortUsed}
        />
      )}
    </div>
  )
}

/* ─── DNS 레코드 + 재확인 ─── */

function DnsRecordSection({
  vm,
  pub,
  canMutate,
}: {
  vm: VmDetail
  pub: PublicationView
  canMutate: boolean
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const verification = pub.domain.verification!

  const reverify = useMutation({
    mutationFn: () => verifyDomain(pub.domain.id),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (err) =>
      setError(toApiError(err, '검증 재시도를 접수하지 못했습니다.').message),
  })

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-800">DNS 레코드</h3>
      <p className="text-sm text-neutral-600">
        도메인 관리 서비스(DNS)에 아래 두 레코드를 추가해 주세요. 전파에는 수
        분~수십 분이 걸릴 수 있습니다.
      </p>
      <DnsRecordTable verification={verification} />
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

/* ─── 관리: 포트 변경 + 연결 해제 ─── */

function ManageSection({
  vm,
  pub,
  onReleased,
  onPortUsed,
}: {
  vm: VmDetail
  pub: PublicationView
  onReleased: () => void
  onPortUsed: (port: number) => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const routeReady = pub.route != null
  const [port, setPort] = useState(String(pub.route?.targetPort ?? 80))
  const [portError, setPortError] = useState<string | null>(null)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releaseError, setReleaseError] = useState<string | null>(null)

  const changePort = useMutation({
    mutationFn: (next: number) => updateDomainPort(pub.domain.id, { port: next }),
    onSuccess: async (_data, next) => {
      setPortError(null)
      onPortUsed(next)
      toast.success('공개 포트 변경을 접수했습니다. 잠시 후 적용됩니다.')
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (err) =>
      setPortError(toApiError(err, '공개 포트 변경을 접수하지 못했습니다.').message),
  })

  const release = useMutation({
    mutationFn: () => deleteDomain(pub.domain.id),
    onSuccess: async (data) => {
      setReleaseOpen(false)
      toast.success(data.message)
      onReleased()
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (err) => {
      setReleaseError(toApiError(err, '도메인 해제를 접수하지 못했습니다.').message)
    },
  })

  const submitPort = (event: FormEvent) => {
    event.preventDefault()
    const fieldError = portFieldError(port)
    if (fieldError) {
      setPortError(fieldError)
      return
    }
    setPortError(null)
    changePort.mutate(Number(port))
  }

  const isCustom = pub.domain.kind === 'CUSTOM'
  // 이 VM의 마지막 서빙 도메인을 해제하면 HTTP 공개가 완전히 끊긴다 — 확인을 승격.
  const isLast = vm.publications.length === 1

  return (
    <section className="space-y-4 border-t border-neutral-100 pt-4">
      <h3 className="text-sm font-semibold text-neutral-800">관리</h3>
      <form onSubmit={submitPort} className="flex flex-wrap items-start gap-3" noValidate>
        <FormField
          label="공개 포트"
          error={portError ?? undefined}
          description={
            routeReady ? '22는 공개할 수 없습니다.' : '적용 중에는 변경할 수 없습니다.'
          }
          className="w-36"
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
          size="sm"
          loading={changePort.isPending}
          disabled={!routeReady}
          className="mt-6"
        >
          공개 포트 변경
        </Button>
      </form>

      <div>
        <Button variant="danger" size="sm" onClick={() => setReleaseOpen(true)}>
          연결 해제
        </Button>
      </div>

      <Modal
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        title="도메인 연결 해제"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReleaseOpen(false)}>
              돌아가기
            </Button>
            <Button
              variant="danger"
              loading={release.isPending}
              onClick={() => release.mutate()}
            >
              연결 해제
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {isLast && (
            <Alert variant="danger">
              이 VM의 마지막 도메인입니다. 해제하면 HTTP 공개가 완전히 중단됩니다.
            </Alert>
          )}
          <p className="text-sm text-neutral-600">
            <span className="font-mono">{pub.fqdn}</span> 연결을 해제합니다.{' '}
            {isCustom
              ? '해제하면 이 주소로의 접근이 즉시 중단되고 이름도 바로 풀립니다. 다시 연결하려면 소유 확인을 처음부터 진행합니다.'
              : '해제하면 주소가 즉시 닫히고, 이름은 일정 기간 예약된 뒤 풀립니다. 예약 중에는 다시 연결할 수 있습니다.'}
          </p>
          {releaseError && <Alert variant="danger">{releaseError}</Alert>}
        </div>
      </Modal>
    </section>
  )
}

/* ─── 예약 중 도메인 상세 (즉시 반납) ─── */

function ReservedDomainBody({
  vm,
  domain,
  canMutate,
  onReturned,
}: {
  vm: VmDetail
  domain: DomainSummary
  canMutate: boolean
  onReturned: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fold = foldDomainStatus({
    kind: domain.kind,
    status: domain.status,
    releasedAt: domain.releasedAt,
    reservedUntil: domain.reservedUntil,
  })

  const returnName = useMutation({
    mutationFn: () => deleteDomain(domain.id),
    onSuccess: async (data) => {
      setConfirmOpen(false)
      toast.success(data.message)
      onReturned()
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
    },
    onError: (err) => {
      setError(toApiError(err, '이름 반납을 접수하지 못했습니다.').message)
    },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <DomainKindBadge kind={domain.kind} />
          <DomainConnectionBadge status={fold} />
          {domain.reservedUntil && (
            <DdayBadge endDate={kstDateString(new Date(domain.reservedUntil))} />
          )}
        </div>
        {fold.hint && <p className="text-sm text-neutral-500">{fold.hint}</p>}
        {domain.releasedAt && (
          <p className="text-xs text-neutral-500">
            해제 {formatDateTime(domain.releasedAt)}
            {domain.reservedUntil &&
              ` · 예약 만료 ${formatDateTime(domain.reservedUntil)}`}
          </p>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {canMutate && (
        <section className="space-y-2 border-t border-neutral-100 pt-4">
          <h3 className="text-sm font-semibold text-neutral-800">관리</h3>
          <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
            지금 이름 반납
          </Button>
        </section>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="지금 이름 반납"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              돌아가기
            </Button>
            <Button
              variant="danger"
              loading={returnName.isPending}
              onClick={() => returnName.mutate()}
            >
              지금 이름 반납
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">
          <span className="font-mono">{domain.fqdn}</span> — 지금 반납하면 이름이 즉시
          풀려 다른 사용자가 사용할 수 있게 됩니다.
        </p>
      </Modal>
    </div>
  )
}
