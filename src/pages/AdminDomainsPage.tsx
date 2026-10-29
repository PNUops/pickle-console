import { invalidateAdminDeadlines } from '../lib/admin-deadline-cache'
import { useDialogResultFocus } from '../lib/use-dialog-result-focus'
import { AdminResourceAccessLink } from '../components/resource/AdminResourceAccessLink'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyAdminRoute,
  fetchAdminRouteSourcePolicy,
  fetchCampusSourcePolicyPreset,
  fetchAdminDomainRecords,
  fetchAdminDomainRoots,
  fetchAdminDomains,
  fetchAdminDomain,
  forceReleaseDomain,
  resyncRoutes,
  updateAdminDomainRenewal,
  updateAdminDomainRoot,
  updateAdminRouteSourcePolicy,
  verifyAdminDomain,
  type AdminDomainRootView,
  type AdminDomainView,
  type DomainKind,
  type DomainStatus,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { SYS_ADMIN, SYS_OPERATORS, SYS_READERS } from '../auth/institution-authority'
import { CERTIFICATE_READS, DOMAIN_READ_COMMANDS, PUBLICATION_READ_COMMANDS, ROOT_READS, useInstitutionResourcePermissions } from '../lib/institution-resource-work'
import { fetchInstitutionDomainRoute } from '../api/institution-publication'
import {
  BulkSelectionBar,
  SelectPageHeader,
  SelectRowCell,
} from '../components/bulk/BulkSelection'
import { CertificatesSection } from '../components/CertificatesSection'
import { SourcePolicyPanel } from '../components/network-policy/SourcePolicyPanel'
import { FilterBar } from '../components/FilterBar'
import {
  Alert,
  Badge,
  Button,
  Card,
  CertificateStatusBadge,
  ConfirmNameModal,
  DdayBadge,
  DomainDnsStatusBadge,
  DomainKindBadge,
  DomainStatusBadge,
  Drawer,
  Input,
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
import { formatDateTime, kstDateString, todayKstDate } from '../lib/format'
import { DOMAIN_KIND_LABELS, DOMAIN_STATUS_LABELS } from '../lib/status'
import { useAdminScope } from '../lib/use-admin-scope'
import { isUuid } from '../lib/validation'
import { useBulkSelection } from '../lib/bulk-selection'
import { adminPaths } from '../lib/paths'
import { requestDetailReturn } from '../lib/list-url'
import { WorkspaceSourceReturnLink } from '../components/workspace/WorkspaceSourceReturnLink'
import { useActiveResult } from '../lib/use-active-result'

const PAGE_SIZE = 20

const SCREEN_TABS = [
  { id: 'domains', label: '도메인' },
  { id: 'certificates', label: '인증서' },
  { id: 'roots', label: '루트 도메인' },
]

const STATUS_TABS: { label: string; status: DomainStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: DOMAIN_STATUS_LABELS.ACTIVE, status: 'ACTIVE' },
  { label: DOMAIN_STATUS_LABELS.VERIFYING, status: 'VERIFYING' },
  { label: DOMAIN_STATUS_LABELS.PENDING, status: 'PENDING' },
  { label: DOMAIN_STATUS_LABELS.FAILED, status: 'FAILED' },
]

const KINDS: DomainKind[] = ['AUTO', 'PLATFORM', 'CUSTOM', 'EXTERNAL']

/**
 * 공개 서비스 — 도메인 중심 1화면. 운영자가 실제로 겪는 단위("이 도메인이 왜
 * 안 열리나")에 맞춰 도메인 행 선택 시 드로어에 라우트·인증서·검증 상태와
 * 사후 개입 액션을 함께 보여준다. 인증서 축(만료 임박 일괄 점검)은 별도 탭.
 */
export function AdminDomainsPage() {
  const { user } = useAuth()
  const permissions = useInstitutionResourcePermissions()
  const { activeOrgId } = useAdminScope()
  return <AdminDomainsContent key={`${activeOrgId ?? 'all'}:${user?.id ?? 'none'}:${permissions.fingerprint}`} />
}

function AdminDomainsContent() {
  const { user } = useAuth()
  const permissions = useInstitutionResourcePermissions()
  const { activeOrgId, activeOrg } = useAdminScope()
  const canResync = SYS_OPERATORS.includes(permissions.role)
  const canReadDomains = permissions.canAnyWork([...DOMAIN_READ_COMMANDS, ...PUBLICATION_READ_COMMANDS], SYS_READERS)
  const canReadCertificates = permissions.canAnyWork(CERTIFICATE_READS, SYS_READERS)
  const canReadRoots = permissions.canAnyWork(ROOT_READS, SYS_READERS)
  const canSelect = permissions.canAnyWork(['domain.renewal', 'domain.release', 'domain.acl.support.manage', 'vm.publication.operate', 'vm.custom-domain.verify'], SYS_OPERATORS)
  const canSelectDomain = (domain: AdminDomainView) => {
    const commands = domain.kind === 'EXTERNAL' ? ['domain.renewal', 'domain.release']
      : domain.kind === 'CUSTOM' ? ['vm.publication.operate', 'vm.custom-domain.verify'] : ['vm.publication.operate']
    return commands.some((work) => permissions.forRow(domain, work, SYS_OPERATORS))
      || domain.kind === 'EXTERNAL' && permissions.forRow(domain, 'domain.acl.support.manage', SYS_ADMIN)
  }
  const availableTabs = SCREEN_TABS.filter((tab) => tab.id === 'domains' ? canReadDomains : tab.id === 'certificates' ? canReadCertificates : canReadRoots)
  const selection = useBulkSelection('domains', `${user?.id ?? 'none'}:${permissions.fingerprint}:${activeOrgId ?? ''}`)
  const [searchParams, setSearchParams] = useSearchParams()
  const rawWorkspaceId = searchParams.get('workspaceId')
  const workspaceId = rawWorkspaceId && isUuid(rawWorkspaceId) ? rawWorkspaceId.toLowerCase() : undefined
  const rawTab = searchParams.get('tab')
  const activeTab = availableTabs.some((tab) => tab.id === rawTab) ? rawTab! : availableTabs[0]?.id ?? 'domains'
  const [status, setStatus] = useState<DomainStatus | undefined>(undefined)
  const [kind, setKind] = useState<DomainKind | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const rawSelectedId = searchParams.get('domainId')
  const selectedId = rawSelectedId && isUuid(rawSelectedId) ? rawSelectedId.toLowerCase() : rawSelectedId
  const selectedValid = !!selectedId && isUuid(selectedId)
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const active = useActiveResult()
  const requestReturn = requestDetailReturn(searchParams.get('returnTo'), activeOrgId, permissions.role.startsWith('SYS_'))
  useEffect(() => { if (selectedId) setMessage(null) }, [selectedId])

  const selectDomain = (id: string | null) => {
    if (id !== selectedId) setMessage(null) // 다른 도메인의 결과가 남아 오독되지 않게
    const next = new URLSearchParams(searchParams)
    if (id) next.set('domainId', id)
    else next.delete('domainId')
    setSearchParams(next, { replace: true })
  }

  const domains = useQuery({
    queryKey: [
      'admin',
      'domains',
      { status: status ?? null, kind: kind ?? null, orgId: activeOrgId ?? null, workspaceId: workspaceId ?? null, page, reader: `${user?.id ?? 'none'}:${permissions.fingerprint}` },
    ],
    queryFn: () =>
      fetchAdminDomains({ status, kind, workspaceId, orgId: activeOrgId, page, size: PAGE_SIZE }),
    enabled: canReadDomains && activeTab === 'domains',
  })
  const selectedQuery = useQuery({ queryKey: ['admin', 'domains', 'detail', selectedId, { orgId: activeOrgId ?? null, reader: `${user?.id ?? 'none'}:${permissions.fingerprint}` }], queryFn: () => fetchAdminDomain(selectedId!), enabled: selectedValid && canReadDomains && activeTab === 'domains' })
  const selectedInScope = selectedQuery.isSuccess
  const selected = selectedInScope ? selectedQuery.data : null
  const pageTargets = (domains.data?.content ?? []).filter(canSelectDomain).map((domain) => ({
    id: domain.id,
    name: domain.fqdn,
  }))

  if (availableTabs.length === 0) return <Alert variant="danger">공개 서비스를 조회할 권한이 없습니다.</Alert>
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      {selected?.workspaceId && <WorkspaceSourceReturnLink workspaceId={selected.workspaceId} admin />}
      {requestReturn && <Link className="text-sm text-primary-700 hover:underline" to={requestReturn}>← 신청 상세</Link>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">공개 서비스</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {activeOrg?.name ?? '플랫폼 전체'}의 도메인과 라우트 적용, 인증서 상태입니다. 행을
            선택하면 상세와 개입 작업이 열립니다.
          </p>
        </div>
        {canResync && <ResyncButton />}
      </div>

      <Tabs
        aria-label="공개 서비스 탭"
        tabs={availableTabs}
        value={activeTab}
        onChange={(id) => {
          const next = new URLSearchParams(searchParams)
          if (id === 'domains') next.delete('tab')
          else next.set('tab', id)
          setSearchParams(next, { replace: true })
        }}
      />

      <TabPanel id="domains" active={activeTab === 'domains'} className="space-y-6">
        <FilterBar
          tabs={STATUS_TABS}
          status={status}
          onStatus={(next) => {
            setStatus(next)
            setPage(0)
          }}
          showOrgFilter={false}
          orgId={activeOrgId}
          onOrg={() => {}}
          orgs={[]}
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

        {canSelect && (
          <BulkSelectionBar
            selected={selection.selected}
            capped={selection.capped}
            onClear={selection.clear}
            to={adminPaths.bulkDomains(activeOrgId)}
          />
        )}

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
                    {canSelect && (
                      <SelectPageHeader
                        rows={pageTargets}
                        selected={selection.selected}
                        onToggle={(on) => selection.togglePage(pageTargets, on)}
                      />
                    )}
                    <TH>도메인</TH>
                    <TH>VM / 워크스페이스</TH>
                    <TH>기관</TH>
                    <TH>상태</TH>
                    <TH>DNS</TH>
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
                      {canSelect && (canSelectDomain(domain) ?
                        <SelectRowCell
                          target={{ id: domain.id, name: domain.fqdn }}
                          checked={selection.selected.some((item) => item.id === domain.id)}
                          onToggle={(on) =>
                            selection.toggle({ id: domain.id, name: domain.fqdn }, on)
                          }
                        /> : <TD />
                      )}
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
                        {/* 외부 도메인은 가상머신에 매이지 않는다. 빈 칸으로 두면
                            이름을 못 읽은 것처럼 보이므로 없다고 적는다. */}
                        {domain.vmName ?? <span className="text-xs text-neutral-400">{domain.kind === 'EXTERNAL' || domain.metadataVisible ? '—' : '조회 권한 없음'}</span>}
                        <span className="block text-xs text-neutral-500">{domain.workspaceName}</span>
                      </TD>
                      <TD>{domain.orgName}</TD>
                      <TD>
                        <DomainStatusBadge status={domain.status} />
                        {domain.kind === 'EXTERNAL' && (permissions.forRow(domain, 'domain.acl.support.read') || permissions.forRow(domain, 'domain.acl.support.manage', SYS_ADMIN)) && <AdminResourceAccessLink type="DOMAIN" resourceId={domain.id} orgId={domain.orgId} workspaceId={domain.workspaceId} />}
                        {/* 예약 판별은 status가 아니라 releasedAt이다 — 해제된
                            행의 status는 ACTIVE로 남아, 이 배지가 없으면
                            "라우트 없는 ACTIVE"와 구분되지 않는다. */}
                        {domain.releasedAt && (
                          <span className="mt-0.5 flex flex-wrap items-center gap-1">
                            <Badge variant="neutral">예약 중</Badge>
                            {domain.reservedUntil && (
                              <DdayBadge endDate={kstDateString(new Date(domain.reservedUntil))} />
                            )}
                          </span>
                        )}
                      </TD>
                      <TD>
                        {!domain.metadataVisible ? <span className="text-xs text-neutral-500">조회 권한 없음</span> : domain.dnsStatus == null || domain.dnsStatus === 'NONE' ? (
                          <span className="text-xs text-neutral-400">—</span>
                        ) : (
                          <DomainDnsStatusBadge status={domain.dnsStatus} />
                        )}
                      </TD>
                      <TD>
                        {!domain.metadataVisible && !permissions.forRow(domain, 'vm.publication.operate', SYS_OPERATORS) ? <span className="text-xs text-neutral-500">조회 권한 없음</span> : domain.routeStatus ? (
                          <RouteStatusBadge status={domain.routeStatus} />
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </TD>
                      <TD>
                        {!domain.metadataVisible ? <span className="text-xs text-neutral-500">조회 권한 없음</span> : domain.certificateStatus ? (
                          <CertificateStatusBadge status={domain.certificateStatus} />
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-xs text-neutral-500">
                        {domain.metadataVisible || permissions.forRow(domain, 'vm.custom-domain.verify', SYS_OPERATORS) ? domain.verifiedAt ? formatDateTime(domain.verifiedAt) : '—' : '조회 권한 없음'}
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
          open={selectedId !== null}
          onClose={() => selectDomain(null)}
          title="도메인 상세"
        >
          {!selectedValid && <Alert variant="danger">도메인 ID를 확인해 주세요.</Alert>}
          {selectedValid && selectedQuery.isPending && <Spinner label="도메인 상세 불러오는 중" />}
          {selectedValid && selectedQuery.isError && <Alert variant="danger">{selectedQuery.error.message}</Alert>}

          {selected && (
            <DomainDrawerContent
              key={`${selected.id}:${permissions.fingerprint}`}
              domain={selected}
              onDone={(text) => {
                if (!active.current || selectedRef.current !== selected.id) return
                selectDomain(null)
                setMessage(text)
              }}
            />
          )}
        </Drawer>
      </TabPanel>

      <TabPanel id="certificates" active={activeTab === 'certificates'}>
        <CertificatesSection orgId={activeOrgId} />
      </TabPanel>

      <TabPanel id="roots" active={activeTab === 'roots'}>
        <DomainRootsSection />
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
  const { activeOrgId } = useAdminScope()
  const { user } = useAuth()
  const permissions = useInstitutionResourcePermissions()
  const canRelease = permissions.forRow(domain, domain.kind === 'EXTERNAL' ? 'domain.release' : 'vm.publication.operate', SYS_OPERATORS)
  const canVerify = domain.kind === 'CUSTOM' && permissions.forRow(domain, 'vm.custom-domain.verify', SYS_OPERATORS)
  const canRenew = domain.kind === 'EXTERNAL' && permissions.forRow(domain, 'domain.renewal', SYS_OPERATORS)
  const canReadContent = permissions.forRow(domain, domain.kind === 'EXTERNAL' ? 'domain.observe' : 'vm.publication.read')
  const canLoadRoutes = domain.kind !== 'EXTERNAL' && ['vm.publication.read', 'vm.metadata.support.read', 'vm.publication.operate']
    .some((work) => permissions.forRow(domain, work, work.endsWith('.operate') ? SYS_OPERATORS : SYS_READERS))
  const [releaseOpen, setReleaseOpen] = useState(false)
  // 드로어 안에서 실행하는 액션(재검증·재적용)의 결과는 드로어 안에 보여야
  // 한다 — 페이지 레벨 알림은 열린 드로어의 배경에 가려 보이지 않는다.
  const [notice, setNotice] = useState<{ variant: 'info' | 'danger'; text: string } | null>(null)

  const routes = useQuery({
    queryKey: ['admin', 'routes', 'domain-reference', domain.id, `${user?.id ?? 'none'}:${permissions.fingerprint}`],
    queryFn: () => fetchInstitutionDomainRoute(domain.id),
    enabled: canLoadRoutes,
  })
  const route = canLoadRoutes ? routes.data ?? null : null
  const canApplyRoute = route != null && permissions.forRow(route, 'vm.publication.operate', SYS_OPERATORS)
  const canReadRoutePolicy = canReadContent || canApplyRoute

  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 font-mono text-lg font-semibold text-neutral-900">{domain.fqdn}</h3>
        <DomainStatusBadge status={domain.status} />
      </div>
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      {!domain.metadataVisible && <Alert variant="info">허용된 작업에 필요한 참조만 표시합니다. 나머지 세부 정보는 조회 권한이 필요합니다.</Alert>}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="종류" value={DOMAIN_KIND_LABELS[domain.kind]} />
        <Field label="루트 도메인" value={domain.metadataVisible ? domain.rootDomain ?? '—' : '조회 권한 없음'} />
        {/* 외부 도메인에는 가상머신이 없다. 「VM —」을 남겨 두면 붙였어야 할
            것이 빠진 것처럼 읽히므로, 그 자리에는 워크스페이스만 선다. */}
        {domain.vmId != null ? (
          <div>
            <dt className="text-neutral-500">VM</dt>
            <dd className="font-medium text-neutral-900">
              {domain.vmName ?? '—'}{' '}
              <Link
                to={adminPaths.vmDetail(domain.vmId, activeOrgId)}
                className="text-sm font-normal text-primary-700 hover:underline"
              >
                상세
              </Link>
              <span className="block text-xs font-normal text-neutral-500">{domain.workspaceName}</span>
            </dd>
          </div>
        ) : (
          <Field label="워크스페이스" value={domain.workspaceName ?? '워크스페이스 정보 없음'} />
        )}
        <Field label="기관" value={domain.orgName ?? '—'} />
        <Field
          label="검증일"
          value={domain.metadataVisible || permissions.forRow(domain, 'vm.custom-domain.verify', SYS_OPERATORS) ? domain.verifiedAt ? formatDateTime(domain.verifiedAt) : '—' : '조회 권한 없음'}
        />
        <Field label="등록일" value={domain.metadataVisible ? domain.createdAt ? formatDateTime(domain.createdAt) : '정보 없음' : '조회 권한 없음'} />
        {domain.releasedAt && (
          <>
            <Field label="해제 시각" value={formatDateTime(domain.releasedAt)} />
            <div>
              <dt className="text-neutral-500">예약 만료</dt>
              <dd className="flex items-center gap-2 font-medium text-neutral-900">
                {domain.reservedUntil ? formatDateTime(domain.reservedUntil) : '—'}
                {domain.reservedUntil && (
                  <DdayBadge endDate={kstDateString(new Date(domain.reservedUntil))} />
                )}
              </dd>
            </div>
          </>
        )}
      </dl>

      {domain.releasedAt && (
        <Alert variant="info">
          트래픽은 받지 않고 이름만 예약되어 있습니다. 예약이 만료되면 이름이 자동으로
          회수되고, 그 전에는 소유 워크스페이스가 같은 이름으로 다시 연결할 수 있습니다. 이름을
          먼저 풀어야 한다면 아래 강제 해제를 씁니다.
        </Alert>
      )}

      {domain.kind === 'EXTERNAL' && (
        <ExternalDomainSections
          domain={domain}
          canIntervene={canRenew}
          canReadRecords={canReadContent}
          onResult={setNotice}
        />
      )}

      {/* 라우트도 인증서도 플랫폼이 트래픽을 받는 이름의 것이다. 외부 도메인은
          레코드가 가리키는 곳으로 바로 가므로 두 구획 모두 언제나 비어 있고,
          비어 있는 구획은 무언가 잘못됐다는 뜻으로 읽힌다. */}
      {domain.kind !== 'EXTERNAL' && (
      <>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">라우트</h3>
        {!canLoadRoutes && <p className="text-sm text-neutral-500">라우트를 조회할 권한이 없습니다.</p>}
        {canLoadRoutes && routes.isPending && <Spinner label="라우트 불러오는 중" />}
        {routes.isError && <Alert variant="danger">{routes.error.message}</Alert>}
        {routes.isSuccess && !route && (
          <p className="text-sm text-neutral-500">살아 있는 라우트가 없습니다.</p>
        )}
        {route && (
          <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
            <div className="flex items-center justify-between">
              <RouteStatusBadge status={route.status} />
              {canApplyRoute && (route.status === 'REMOVED' || domain.status === 'ACTIVE') && (
                <ApplyRouteButton routeId={route.id} onResult={setNotice} />
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <Field label="대상 포트" value={route.metadataVisible ? route.targetPort != null ? String(route.targetPort) : '정보 없음' : '조회 권한 없음'} />
              <Field
                label="동기화"
                value={
                  route.appliedGeneration != null ? `gen ${route.appliedGeneration}` : route.metadataVisible ? '미적용' : '조회 권한 없음'
                }
              />
              {route.metadataVisible && route.appliedAt && (
                <Field label="적용 시각" value={formatDateTime(route.appliedAt)} />
              )}
            </dl>
            {route.metadataVisible && route.status === 'FAILED' && route.lastError && (
              <Alert variant="danger">{route.lastError}</Alert>
            )}
            {canReadRoutePolicy ? <SourcePolicyPanel
              queryKey={['admin', 'routes', route.id, 'source-policy', `${user?.id ?? 'none'}:${permissions.fingerprint}`]}
              target="DOMAIN"
              loadPolicy={() => fetchAdminRouteSourcePolicy(route.id)}
              savePolicy={(body) => updateAdminRouteSourcePolicy(route.id, body)}
              loadPreset={fetchCampusSourcePolicyPreset}
              canEdit={canApplyRoute}
              surface="admin"
            /> : <p className="text-sm text-neutral-500">연결 정책 원문을 조회할 권한이 없습니다.</p>}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">인증서</h3>
        {!domain.metadataVisible ? <p className="text-sm text-neutral-500">인증서를 조회할 권한이 없습니다.</p> : domain.certificateStatus ? (
          <CertificateStatusBadge status={domain.certificateStatus} />
        ) : (
          <p className="text-sm text-neutral-500">연결된 인증서가 없습니다.</p>
        )}
      </section>
      </>
      )}

      {(canRelease || canVerify) && (
        <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
          <h3 className="text-sm font-semibold text-neutral-800">사후 개입</h3>
          <div className="flex flex-wrap gap-2">
            {canVerify && <ReverifyButton domain={domain} onResult={setNotice} />}
            {canRelease && <Button variant="danger" size="sm" onClick={() => setReleaseOpen(true)}>
              강제 해제
            </Button>}
          </div>
        </section>
      )}

      {releaseOpen && canRelease && (
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

/**
 * 외부 도메인의 두 구획 — 사용 기한과 레코드.
 *
 * 관리자가 할 수 있는 것은 기한을 옮기는 것뿐이다. 레코드는 읽기만 한다:
 * 이름 안으로 들어가 값을 고치는 것은 이름을 통째로 해제하는 것보다 깊은
 * 개입이고, 그것을 하기로 한 적이 없다.
 */
function ExternalDomainSections({
  domain,
  canIntervene,
  canReadRecords,
  onResult,
}: {
  domain: AdminDomainView
  canIntervene: boolean
  canReadRecords: boolean
  onResult: (notice: DrawerNotice) => void
}) {
  const { user } = useAuth()
  const permissions = useInstitutionResourcePermissions()
  const records = useQuery({
    queryKey: ['admin', 'domains', domain.id, 'records', `${user?.id ?? 'none'}:${permissions.fingerprint}`],
    queryFn: () => fetchAdminDomainRecords(domain.id),
    enabled: canReadRecords,
  })

  return (
    <>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">사용 기한</h3>
        {domain.renewDueAt ? <p className="text-sm text-neutral-600">
          {formatDateTime(domain.renewDueAt)}까지입니다. 소유자가 연장하지 않으면 그 시점에 레코드가 내려가고 이름은 예약 상태로 바뀝니다.
        </p> : <p className="text-sm text-neutral-500">{domain.metadataVisible ? '사용 기한 정보가 없습니다.' : '사용 기한을 조회할 권한이 없습니다.'}</p>}
        {canIntervene && domain.releasedAt == null && (
          <AdjustRenewalForm domain={domain} onResult={onResult} />
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">레코드</h3>
        {!canReadRecords && <p className="text-sm text-neutral-500">레코드 원문을 조회할 권한이 없습니다.</p>}
        {canReadRecords && records.isPending && <Spinner label="레코드 불러오는 중" />}
        {canReadRecords && records.isError && <Alert variant="danger">{records.error.message}</Alert>}
        {canReadRecords && records.isSuccess && records.data.length === 0 && (
          <p className="text-sm text-neutral-500">넣은 레코드가 없습니다.</p>
        )}
        {canReadRecords && records.isSuccess && records.data.length > 0 && (
          <Table>
            <THead>
              <TR>
                <TH>이름</TH>
                <TH>종류</TH>
                <TH>값</TH>
                <TH>적용</TH>
              </TR>
            </THead>
            <TBody>
              {records.data.map((record) => (
                <TR key={`${record.name}:${record.type}`}>
                  <TD className="font-mono text-xs">{record.name}</TD>
                  <TD>{record.type}</TD>
                  <TD className="font-mono text-xs">
                    {record.values.map((value) => (
                      <span key={value} className="block">
                        {value}
                      </span>
                    ))}
                  </TD>
                  {/* 레코드의 상태 어휘는 도메인의 DNS 상태와 다르다(REMOVED가
                      더 있다). 배지를 돌려 쓰지 않고 그 자리의 말로 적는다. */}
                  <TD className="text-xs">
                    {record.status === 'APPLIED'
                      ? '반영됨'
                      : record.status === 'FAILED'
                        ? '반영 실패'
                        : record.status === 'REMOVED'
                          ? '삭제 대기'
                          : '반영 대기'}
                    {record.lastError && (
                      <span className="mt-0.5 block text-danger-700">{record.lastError}</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </>
  )
}

/**
 * 기한 옮기기.
 *
 * <p>날짜만 받고 그 날 KST 끝으로 보낸다. 관리자가 읽는 기한은 날짜이고,
 * 시각까지 물으면 답할 근거가 없는 칸이 하나 더 생긴다. 지난 시각은 서버가
 * 거절한다 — 그것은 조정이 아니라 통보 없는 해제다.</p>
 */
function AdjustRenewalForm({
  domain,
  onResult,
}: {
  domain: AdminDomainView
  onResult: (notice: DrawerNotice) => void
}) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(
    domain.renewDueAt ? kstDateString(new Date(domain.renewDueAt)) : '',
  )
  const [reason, setReason] = useState('')
  const adjust = useMutation({
    mutationFn: () =>
      updateAdminDomainRenewal(domain.id, {
        renewDueAt: new Date(`${date}T23:59:59+09:00`).toISOString(),
        reason: reason.trim() || undefined,
      }),
    onSuccess: async () => {
      onResult({ variant: 'info', text: '사용 기한을 옮겼습니다. 소유자에게 알렸습니다.' })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] })
      await invalidateAdminDeadlines(queryClient)
    },
    onError: (err) =>
      onResult({
        variant: 'danger',
        text: toApiError(err, '사용 기한을 바꾸지 못했습니다.').message,
      }),
  })

  const { contentRef, actionRef } = useDialogResultFocus(adjust.isPending)

  return (
    <div ref={contentRef} className="space-y-2 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-neutral-600">
          새 기한
          <Input
            type="date"
            className="mt-1"
            min={todayKstDate()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="flex-1 text-sm text-neutral-600">
          사유 (감사 기록에 남습니다)
          <Input
            className="mt-1"
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <Button
          ref={actionRef}
          variant="secondary"
          size="sm"
          disabled={!date}
          loading={adjust.isPending}
          onClick={() => adjust.mutate()}
        >
          기한 조정
        </Button>
      </div>
    </div>
  )
}

/**
 * 루트 도메인마다의 승인 정책.
 *
 * <p>이름 신청이 접수와 동시에 승인되는지, 사람의 검토를 기다리는지를 루트가
 * 정한다. 기관이 아니라 루트인 것은 한 기관이 루트를 둘 가질 수 있기 때문이고,
 * 이름이 어느 기관의 것인지도 루트가 나른다.</p>
 */
function DomainRootsSection() {
  const { user } = useAuth()
  const permissions = useInstitutionResourcePermissions()
  const canRead = permissions.canAnyWork(ROOT_READS, SYS_READERS)
  const roots = useQuery({ queryKey: ['admin', 'domain-roots', user?.id, permissions.fingerprint], queryFn: fetchAdminDomainRoots, enabled: canRead })
  if (!canRead) return <Alert variant="danger">루트 도메인을 조회할 권한이 없습니다.</Alert>

  return (
    <div className="space-y-4">
      <Alert variant="info">
        지금 이 정책이 다스리는 것은 외부 도메인 발급뿐입니다. 가상머신에 서브도메인을 붙이는
        경로는 아직 승인을 거치지 않습니다.
      </Alert>
      {roots.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="루트 도메인 불러오는 중" />
        </div>
      )}
      {roots.isError && <Alert variant="danger">{roots.error.message}</Alert>}
      {roots.isSuccess && roots.data.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          등록된 루트 도메인이 없습니다. 루트는 등록 절차가 넣습니다.
        </Card>
      )}
      {roots.isSuccess && roots.data.length > 0 && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>루트 도메인</TH>
                <TH>기관</TH>
                <TH>발급된 이름</TH>
                <TH>승인</TH>
                <TH>
                  <span className="sr-only">작업</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {roots.data.map((root) => (
                <TR key={root.rootDomain}>
                  <TD className="font-mono text-sm">{root.rootDomain}</TD>
                  <TD>{root.orgName}</TD>
                  <TD>{root.metadataVisible && root.issuedNames != null ? `${root.issuedNames}개` : '조회 권한 없음'}</TD>
                  <TD>
                    <Badge variant={root.autoApprove ? 'success' : 'neutral'}>
                      {root.autoApprove ? '자동 승인' : '승인 필요'}
                    </Badge>
                  </TD>
                  <TD>
                    {permissions.forRow(root, 'institution.root-policy.write', SYS_OPERATORS) && (
                        <ToggleRootPolicyButton root={root} />
                      )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

function ToggleRootPolicyButton({ root }: { root: AdminDomainRootView }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const toggle = useMutation({
    mutationFn: () => updateAdminDomainRoot(root.rootDomain, { autoApprove: !root.autoApprove }),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'domain-roots'] })
    },
    onError: (err) => setError(toApiError(err, '승인 정책을 바꾸지 못했습니다.').message),
  })

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        size="sm"
        loading={toggle.isPending}
        onClick={() => toggle.mutate()}
      >
        {root.autoApprove ? '승인 필요로' : '자동 승인으로'}
      </Button>
      {error && <p className="text-xs text-danger-700">{error}</p>}
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

/* ─── 사후 개입 액션 (운영 역할만 — 기관 계층은 자기가 운영하는 기관, 서버 강제) ─── */

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
      await invalidateAdminDeadlines(queryClient)
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
  routeId: string
  onResult: (notice: DrawerNotice) => void
}) {
  const queryClient = useQueryClient()
  const apply = useMutation({
    mutationFn: () => applyAdminRoute(routeId),
    onSuccess: async (data) => {
      onResult({ variant: 'info', text: data.message })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'routes'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] })
      await invalidateAdminDeadlines(queryClient)
    },
    onError: (err) =>
      onResult({
        variant: 'danger',
        text: toApiError(err, '라우트 재적용을 접수하지 못했습니다.').message,
      }),
  })
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={apply.isPending}
      onClick={() => apply.mutate()}
    >
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
      await invalidateAdminDeadlines(queryClient)
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
        {domain.releasedAt ? (
          // 예약 중인 행에는 내릴 라우트가 없다 — 남은 효과는 예약 만료를
          // 기다리지 않고 이름을 지금 푸는 것이다.
          <>
            예약이 만료되기를 기다리지 않고 이름이 즉시 회수되어 다른 사용자가 사용할
            수 있게 됩니다. 소유 워크스페이스는 이 이름으로 다시 연결할 수 없게 됩니다. 감사
            기록이 남습니다.
          </>
        ) : (
          <>
            라우트가 즉시 제거되고 이름이 즉시 회수되어 다른 사용자가 사용할 수 있게
            됩니다. 커스텀 인증서는 폐기됩니다. 다시 공개하려면 사용자가 새로 접수해야
            합니다. 감사 기록이 남습니다.
          </>
        )}
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
      await invalidateAdminDeadlines(queryClient)
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
