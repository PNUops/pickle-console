import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyAdminRoute,
  fetchAdminDomains,
  fetchAdminRoutes,
  fetchOrgs,
  forceReleaseDomain,
  resyncRoutes,
  verifyAdminDomain,
  type AdminDomainView,
  type DomainKind,
  type DomainStatus,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { isSysTier } from '../auth/permissions'
import { CertificatesSection } from '../components/CertificatesSection'
import { FilterBar } from '../components/FilterBar'
import {
  Alert,
  Button,
  Card,
  CertificateStatusBadge,
  ConfirmNameModal,
  DomainKindBadge,
  DomainStatusBadge,
  Drawer,
  Pagination,
  RouteStatusBadge,
  Select,
  Spinner,
  Table,
  TabPanel,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { cn } from '../lib/cn'
import { formatDateTime } from '../lib/format'
import { DOMAIN_KIND_LABELS, DOMAIN_STATUS_LABELS } from '../lib/status'

const PAGE_SIZE = 20

const SCREEN_TABS = [
  { id: 'domains', label: '도메인' },
  { id: 'certificates', label: '인증서' },
]

const STATUS_TABS: { label: string; status: DomainStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: DOMAIN_STATUS_LABELS.ACTIVE, status: 'ACTIVE' },
  { label: DOMAIN_STATUS_LABELS.VERIFYING, status: 'VERIFYING' },
  { label: DOMAIN_STATUS_LABELS.PENDING, status: 'PENDING' },
  { label: DOMAIN_STATUS_LABELS.FAILED, status: 'FAILED' },
  // 해제 후 이름 예약이 남은 행도 REMOVED로 조회된다 (예약 중 축).
  { label: DOMAIN_STATUS_LABELS.REMOVED, status: 'REMOVED' },
]

const KINDS: DomainKind[] = ['AUTO', 'REQUESTED', 'CUSTOM']

/**
 * 공개 서비스 — 도메인 중심 1화면. 운영자가 실제로 겪는 단위("이 도메인이 왜
 * 안 열리나")에 맞춰 도메인 행 선택 시 드로어에 라우트·인증서·검증 상태와
 * 사후 개입 액션을 함께 보여준다. 인증서 축(만료 임박 일괄 점검)은 별도 탭.
 */
export function AdminDomainsPage() {
  const { user } = useAuth()
  const isSysAdmin = !!user && isSysTier(user.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab = SCREEN_TABS.some((tab) => tab.id === rawTab) ? rawTab! : 'domains'
  const [status, setStatus] = useState<DomainStatus | undefined>(undefined)
  const [kind, setKind] = useState<DomainKind | undefined>(undefined)
  const [orgId, setOrgId] = useState<number | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selectDomain = (id: number) => {
    if (id !== selectedId) setMessage(null) // 다른 도메인의 결과가 남아 오독되지 않게
    setSelectedId(id)
  }

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

  const selected = domains.data?.content.find((domain) => domain.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">공개 서비스</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {isSysAdmin ? '전체' : '우리 기관'} VM의 도메인과 라우트 적용·인증서 상태입니다.
            행을 선택하면 라우트·인증서 상세와 개입 작업이 열립니다.
          </p>
        </div>
        {isSysAdmin && <ResyncButton />}
      </div>

      <Tabs
        aria-label="공개 서비스 탭"
        tabs={SCREEN_TABS}
        value={activeTab}
        onChange={(id) => setSearchParams(id === 'domains' ? {} : { tab: id }, { replace: true })}
      />

      <TabPanel id="domains" active={activeTab === 'domains'} className="space-y-6">
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
                  </TR>
                </THead>
                <TBody>
                  {domains.data.content.map((domain) => (
                    <TR
                      key={domain.id}
                      className={cn(
                        'cursor-pointer',
                        domain.id === selectedId && 'bg-primary-50 hover:bg-primary-50',
                      )}
                      onClick={() => selectDomain(domain.id)}
                    >
                      <TD>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            selectDomain(domain.id)
                          }}
                          className="cursor-pointer font-mono text-sm text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
                        >
                          {domain.fqdn}
                        </button>
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

        <Drawer
          open={selected !== null}
          onClose={() => setSelectedId(null)}
          title="도메인 상세"
        >
          {selected && (
            <DomainDrawerContent
              key={selected.id}
              domain={selected}
              onDone={(text) => {
                setMessage(text)
                setSelectedId(null) // 강제 해제된 도메인의 드로어를 확정적으로 닫는다
              }}
            />
          )}
        </Drawer>
      </TabPanel>

      <TabPanel id="certificates" active={activeTab === 'certificates'}>
        <CertificatesSection />
      </TabPanel>
    </div>
  )
}

/* ─── 상세 드로어 (검증·라우트·인증서 + 사후 개입) ─── */

function DomainDrawerContent({
  domain,
  onDone,
}: {
  domain: AdminDomainView
  onDone: (message: string) => void
}) {
  const [releaseOpen, setReleaseOpen] = useState(false)
  // 드로어 안에서 실행하는 액션(재검증·재적용)의 결과는 드로어 안에 보여야
  // 한다 — 페이지 레벨 알림은 열린 드로어의 배경에 가려 보이지 않는다.
  const [notice, setNotice] = useState<{ variant: 'info' | 'danger'; text: string } | null>(null)

  // 라우트 상세는 domainId 조인으로 찾는다. 라우트 수는 도메인 수와 같은
  // 규모의 참조 목록이라 한 페이지로 충분하다 (초과 시 상세 API 후보).
  const routes = useQuery({
    queryKey: ['admin', 'routes', { forDomainJoin: true }],
    queryFn: () => fetchAdminRoutes({ page: 0, size: 100 }),
  })
  const route = routes.data?.content.find((r) => r.domainId === domain.id) ?? null
  const routesTruncated =
    routes.isSuccess && routes.data.totalElements > routes.data.content.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-lg font-semibold text-neutral-900">{domain.fqdn}</h3>
        <DomainStatusBadge status={domain.status} />
      </div>
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="종류" value={DOMAIN_KIND_LABELS[domain.kind]} />
        <Field label="루트 도메인" value={domain.rootDomain ?? '—'} />
        <div>
          <dt className="text-neutral-500">VM</dt>
          <dd className="font-medium text-neutral-900">
            {domain.vmName ?? '—'}{' '}
            {domain.vmId != null && (
              <Link
                to={`/admin/vms/${domain.vmId}`}
                className="text-sm font-normal text-primary-700 hover:underline"
              >
                상세
              </Link>
            )}
            <span className="block text-xs font-normal text-neutral-500">{domain.groupName}</span>
          </dd>
        </div>
        <Field label="기관" value={domain.orgName ?? '—'} />
        <Field
          label="검증일"
          value={domain.verifiedAt ? formatDateTime(domain.verifiedAt) : '—'}
        />
        <Field label="등록일" value={formatDateTime(domain.createdAt)} />
      </dl>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">라우트</h3>
        {routes.isPending && <Spinner label="라우트 불러오는 중" />}
        {routes.isError && <Alert variant="danger">{routes.error.message}</Alert>}
        {routes.isSuccess && !route && !routesTruncated && (
          <p className="text-sm text-neutral-500">살아 있는 라우트가 없습니다.</p>
        )}
        {routes.isSuccess && !route && routesTruncated && (
          <Alert variant="warning">
            라우트가 많아 일부만 조회했습니다 — 이 도메인의 라우트는 표시하지 못할 수
            있습니다.
          </Alert>
        )}
        {route && (
          <div className="space-y-2 rounded-lg border border-neutral-200 p-4">
            <div className="flex items-center justify-between">
              <RouteStatusBadge status={route.status} />
              <ApplyRouteButton routeId={route.id} onResult={setNotice} />
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <Field label="대상 포트" value={String(route.targetPort)} />
              <Field
                label="동기화"
                value={
                  route.appliedGeneration != null ? `gen ${route.appliedGeneration}` : '미적용'
                }
              />
              {route.appliedAt && (
                <Field label="적용 시각" value={formatDateTime(route.appliedAt)} />
              )}
            </dl>
            {route.status === 'FAILED' && route.lastError && (
              <Alert variant="danger">{route.lastError}</Alert>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">인증서</h3>
        {domain.certificateStatus ? (
          <CertificateStatusBadge status={domain.certificateStatus} />
        ) : (
          <p className="text-sm text-neutral-500">연결된 인증서가 없습니다.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-semibold text-neutral-800">사후 개입</h3>
        <p className="text-sm text-neutral-500">
          커스텀 도메인 소유권 재검증과 도메인 강제 해제(라우트 제거·인증서 폐기·이름
          즉시 회수)를 수행합니다. 해제됨(이름 예약 중) 행의 강제 해제는 예약된
          이름을 즉시 회수합니다. 기관 계층은 자기 기관 VM의 도메인에만 적용됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {domain.kind === 'CUSTOM' && (
            <ReverifyButton domain={domain} onResult={setNotice} />
          )}
          <Button variant="danger" size="sm" onClick={() => setReleaseOpen(true)}>
            강제 해제
          </Button>
        </div>
      </section>

      {releaseOpen && (
        <ForceReleaseModal
          domain={domain}
          onClose={() => setReleaseOpen(false)}
          onDone={(text) => {
            setReleaseOpen(false)
            onDone(text)
          }}
        />
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  )
}

/* ─── 사후 개입 액션 (관리자 4역할 — 기관 계층은 자기 기관, 서버 강제) ─── */

type DrawerNotice = { variant: 'info' | 'danger'; text: string }

function ReverifyButton({
  domain,
  onResult,
}: {
  domain: AdminDomainView
  onResult: (notice: DrawerNotice) => void
}) {
  const queryClient = useQueryClient()
  const reverify = useMutation({
    mutationFn: () => verifyAdminDomain(domain.id),
    onSuccess: async (data) => {
      onResult({ variant: 'info', text: data.message })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] })
    },
    onError: (err) =>
      onResult({
        variant: 'danger',
        text: toApiError(err, '재검증을 접수하지 못했습니다.').message,
      }),
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

/** 개별 라우트 재적용 — 전역 sync-all 없이 이 도메인의 라우트만 재전파. */
function ApplyRouteButton({
  routeId,
  onResult,
}: {
  routeId: number
  onResult: (notice: DrawerNotice) => void
}) {
  const queryClient = useQueryClient()
  const apply = useMutation({
    mutationFn: () => applyAdminRoute(routeId),
    onSuccess: async (data) => {
      onResult({ variant: 'info', text: data.message })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'routes'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] })
    },
    onError: (err) =>
      onResult({
        variant: 'danger',
        text: toApiError(err, '라우트 재적용을 접수하지 못했습니다.').message,
      }),
  })
  return (
    <Button variant="secondary" size="sm" loading={apply.isPending} onClick={() => apply.mutate()}>
      재적용
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
        라우트가 즉시 제거되고 이름이 즉시 회수되어 다른 사용자가 사용할 수 있게
        됩니다. 커스텀 인증서는 폐기됩니다. 다시 공개하려면 사용자가 새로 접수해야
        합니다. 감사 기록이 남습니다.
      </Alert>
      {error && <Alert variant="danger">{error}</Alert>}
    </ConfirmNameModal>
  )
}

/* ─── 전체 재동기화 (SYS 계층 — 매니페스트 권위적 prune) ─── */

function ResyncButton() {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resync = useMutation({
    mutationFn: resyncRoutes,
    onSuccess: async (data) => {
      setError(null)
      setMessage(data.message)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'routes'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] })
    },
    onError: (err) => {
      setMessage(null)
      setError(toApiError(err, '라우트 재동기화를 접수하지 못했습니다.').message)
    },
  })

  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="secondary" loading={resync.isPending} onClick={() => resync.mutate()}>
        전체 재동기화 (sync-all)
      </Button>
      {message && <Alert variant="info">{message}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}
    </div>
  )
}
