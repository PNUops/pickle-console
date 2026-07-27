import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAdminDomains,
  fetchOrgs,
  forceReleaseDomain,
  verifyAdminDomain,
  type AdminDomainView,
  type DomainKind,
  type DomainStatus,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { isSysTier } from '../auth/permissions'
import {
  Alert,
  Button,
  Card,
  CertificateStatusBadge,
  ConfirmNameModal,
  DomainKindBadge,
  DomainStatusBadge,
  Pagination,
  RouteStatusBadge,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { DOMAIN_KIND_LABELS, DOMAIN_STATUS_LABELS } from '../lib/status'
import { FilterBar } from '../components/FilterBar'

const PAGE_SIZE = 20

const STATUS_TABS: { label: string; status: DomainStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: DOMAIN_STATUS_LABELS.ACTIVE, status: 'ACTIVE' },
  { label: DOMAIN_STATUS_LABELS.VERIFYING, status: 'VERIFYING' },
  { label: DOMAIN_STATUS_LABELS.PENDING, status: 'PENDING' },
  { label: DOMAIN_STATUS_LABELS.FAILED, status: 'FAILED' },
]

const KINDS: DomainKind[] = ['AUTO', 'REQUESTED', 'CUSTOM']

export function AdminDomainsPage() {
  const { user } = useAuth()
  const isSysAdmin = !!user && isSysTier(user.role)
  const [status, setStatus] = useState<DomainStatus | undefined>(undefined)
  const [kind, setKind] = useState<DomainKind | undefined>(undefined)
  const [orgId, setOrgId] = useState<number | undefined>(undefined)
  const [page, setPage] = useState(0)

  const [message, setMessage] = useState<string | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<AdminDomainView | null>(null)

  const domains = useQuery({
    queryKey: [
      'admin',
      'domains',
      { status: status ?? null, kind: kind ?? null, orgId: orgId ?? null, page },
    ],
    queryFn: () => fetchAdminDomains({ status, kind, orgId, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: isSysAdmin })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">도메인</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isSysAdmin ? '전체' : '우리 기관'} VM에 연결된 도메인(자동·희망 서브도메인·커스텀)과
          라우트·인증서 상태입니다.
        </p>
      </div>

      <FilterBar
        tabs={STATUS_TABS}
        status={status}
        onStatus={(next) => {
          setStatus(next)
          setPage(0)
        }}
        isSysAdmin={isSysAdmin}
        orgId={orgId}
        onOrg={(next) => {
          setOrgId(next)
          setPage(0)
        }}
        orgs={orgs.data ?? []}
      >
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          종류
          <Select
            aria-label="종류 필터"
            className="w-44"
            value={kind ?? ''}
            onChange={(event) => {
              setKind((event.target.value || undefined) as DomainKind | undefined)
              setPage(0)
            }}
          >
            <option value="">전체 종류</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {DOMAIN_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </label>
      </FilterBar>

      {message && <Alert variant="info">{message}</Alert>}

      {domains.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="도메인 목록 불러오는 중" />
        </div>
      )}
      {domains.isError && <Alert variant="danger">{domains.error.message}</Alert>}
      {domains.isSuccess && domains.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          연결된 도메인이 없습니다.
        </Card>
      )}
      {domains.isSuccess && domains.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>도메인</TH>
                  <TH>VM / 그룹</TH>
                  {isSysAdmin && <TH>기관</TH>}
                  <TH>상태</TH>
                  <TH>라우트</TH>
                  <TH>인증서</TH>
                  <TH>검증일</TH>
                  <TH>
                    <span className="sr-only">작업</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {domains.data.content.map((domain) => (
                  <TR key={domain.id}>
                    <TD>
                      <span className="font-mono text-sm">{domain.fqdn}</span>
                      <span className="mt-0.5 block">
                        <DomainKindBadge kind={domain.kind} />
                      </span>
                    </TD>
                    <TD>
                      {domain.vmName}
                      <span className="block text-xs text-neutral-500">{domain.groupName}</span>
                    </TD>
                    {isSysAdmin && <TD>{domain.orgName}</TD>}
                    <TD>
                      <DomainStatusBadge status={domain.status} />
                    </TD>
                    <TD>
                      {domain.routeStatus ? (
                        <RouteStatusBadge status={domain.routeStatus} />
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </TD>
                    <TD>
                      {domain.certificateStatus ? (
                        <CertificateStatusBadge status={domain.certificateStatus} />
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {domain.verifiedAt ? formatDateTime(domain.verifiedAt) : '—'}
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      {domain.kind === 'CUSTOM' && (
                        <ReverifyButton domain={domain} onDone={setMessage} />
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        className="ml-2"
                        onClick={() => setReleaseTarget(domain)}
                      >
                        강제 해제
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={domains.data.page}
            totalPages={domains.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {releaseTarget && (
        <ForceReleaseModal
          domain={releaseTarget}
          onClose={() => setReleaseTarget(null)}
          onDone={(text) => {
            setReleaseTarget(null)
            setMessage(text)
          }}
        />
      )}
    </div>
  )
}

/* ─── 사후 개입 (관리자 4역할 — 기관 계층은 자기 기관 한정, 서버 강제) ─── */

function ReverifyButton({
  domain,
  onDone,
}: {
  domain: AdminDomainView
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const reverify = useMutation({
    mutationFn: () => verifyAdminDomain(domain.id),
    onSuccess: async (data) => {
      onDone(data.message)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] })
    },
    onError: (err) => onDone(toApiError(err, '재검증을 접수하지 못했습니다.').message),
  })
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={reverify.isPending}
      onClick={() => reverify.mutate()}
    >
      재검증
    </Button>
  )
}

function ForceReleaseModal({
  domain,
  onClose,
  onDone,
}: {
  domain: AdminDomainView
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const release = useMutation({
    mutationFn: () => forceReleaseDomain(domain.id),
    onSuccess: async (data) => {
      setError(null)
      onDone(data.message)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'routes'] })
    },
    onError: (err) => setError(toApiError(err, '도메인을 강제 해제하지 못했습니다.').message),
  })

  return (
    <ConfirmNameModal
      open
      onClose={onClose}
      title="도메인 강제 해제"
      expectedName={domain.fqdn}
      confirmLabel="강제 해제"
      loading={release.isPending}
      // 서버에 이름을 보내는 이중 확인은 아니지만, 대상 도메인을 정확히
      // 지목했음을 클라이언트에서 한 번 더 확인한다 (되돌릴 수 없는 작업).
      onConfirm={() => release.mutate()}
    >
      <Alert variant="danger" title="되돌릴 수 없는 작업입니다">
        라우트가 즉시 제거되고 도메인은 소멸하며 커스텀 인증서는 폐기됩니다. 다시
        공개하려면 사용자가 새로 접수해야 합니다. 감사 기록이 남습니다.
      </Alert>
      {error && <Alert variant="danger">{error}</Alert>}
    </ConfirmNameModal>
  )
}
