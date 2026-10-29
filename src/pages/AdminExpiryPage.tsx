import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchAdminResourceDeadlines, type AdminResourceDeadline } from '../api/resource-deadlines'
import { useAuth } from '../auth/auth-context'
import { SYS_READERS } from '../auth/institution-authority'
import { useInstitutionPermissions } from '../auth/use-institution-permissions'
import { DEADLINE_READS } from '../lib/institution-resource-work'
import { FilterBar } from '../components/FilterBar'
import { resourceTypesInDisplayOrder, RESOURCE_TYPES } from '../components/resource/registry'
import { ADMIN_DEADLINE_QUERY_KEY } from '../lib/admin-deadline-cache'
import { DEADLINE_KIND_LABELS, deadlineConnectionLabel, deadlineDate, deadlineDetailPath, deadlineKindLabel, deadlineListState, deadlineQuery, deadlineStatusLabel, deadlineTime, deadlineTypeLabel, knownDeadline, validDeadlineInstant, type DeadlineWindow } from '../lib/admin-deadlines'
import { useListUrl } from '../lib/use-list-url'
import { useAdminScope } from '../lib/use-admin-scope'
import { isUuid } from '../lib/validation'
import { Alert, Badge, Button, Card, DataTable, FormField, Input, Pagination, Select, Spinner, TBody, TD, TH, THead, TR } from '../components/ui'

const TABS: { label: string; status: DeadlineWindow }[] = [
  { label: '7일 이내', status: 'D7' }, { label: '30일 이내', status: 'D30' }, { label: '만료됨', status: 'EXPIRED' },
]
const CONTEXT_DATES: Record<AdminResourceDeadline['type'], Array<{ field: keyof AdminResourceDeadline['dates']; label: string; dateOnly?: boolean }>> = {
  VM: [{ field: 'startDate', label: '사용 시작일', dateOnly: true }, { field: 'endDate', label: '사용 종료일', dateOnly: true }, { field: 'expiryStoppedAt', label: '만료 중지 관측' }, { field: 'deleteScheduledFor', label: '삭제 예약' }, { field: 'deleteRequestedAt', label: '삭제 요청' }],
  LLM_API_KEY: [{ field: 'expiresAt', label: '키 만료 시각' }],
  DOMAIN: [{ field: 'renewDueAt', label: '갱신 기한' }, { field: 'releasedAt', label: '해제 시각' }, { field: 'reservedUntil', label: '예약 종료' }],
  GPU: [{ field: 'grantedStartDate', label: '승인 시작일', dateOnly: true }, { field: 'grantedEndDate', label: '승인 종료일', dateOnly: true }, { field: 'allocatedAt', label: '할당 시각' }, { field: 'leaseEndsAt', label: '임대 종료' }],
}

export function AdminExpiryPage() {
  const { user } = useAuth()
  const scope = useAdminScope()
  const permissions = useInstitutionPermissions()
  return <AdminExpiryContent key={`${user?.id ?? 'none'}:${scope.activeOrgId ?? 'all'}:${permissions.fingerprint}`} />
}

function AdminExpiryContent() {
  const { user } = useAuth()
  const scope = useAdminScope()
  const [params, change, normalize] = useListUrl()
  const state = deadlineListState(params)
  const workspaceUrl = params.get('workspaceId') ?? ''
  const [workspaceDraft, setWorkspaceDraft] = useState(workspaceUrl)
  const [workspaceError, setWorkspaceError] = useState(false)
  useEffect(() => { setWorkspaceDraft(workspaceUrl); setWorkspaceError(false) }, [workspaceUrl])
  useEffect(() => {
    if (!params.has('page') || params.get('page') === String(state.page) && state.page > 0) return
    const next = new URLSearchParams(params)
    if (state.page > 0) next.set('page', String(state.page))
    else next.delete('page')
    normalize(next.toString())
  }, [params, state.page, normalize])
  const permissions = useInstitutionPermissions()
  const resourcePrefix = state.type === 'LLM_API_KEY' ? 'llm' : state.type?.toLowerCase()
  const canRead = permissions.canAnyWork(resourcePrefix ? [`${resourcePrefix}.metadata.read`, `${resourcePrefix}.metadata.support.read`] : DEADLINE_READS, SYS_READERS)
  const query = deadlineQuery(state, scope.activeOrgId)
  const rows = useQuery({ queryKey: [...ADMIN_DEADLINE_QUERY_KEY, { ...query, reader: `${user?.id ?? 'none'}:${permissions.fingerprint}` }],
    queryFn: () => fetchAdminResourceDeadlines(query), enabled: !state.invalid && scope.ready && canRead })
  const outsidePage = rows.isSuccess && rows.data.page > 0 && rows.data.page >= rows.data.totalPages
  if (!canRead) return <Alert variant="danger">선택한 종류의 자원 기한을 조회할 권한이 없습니다.</Alert>
  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">만료 관리</h1>
      <p className="mt-1 text-sm text-neutral-500">{scope.activeOrg?.name ?? '플랫폼 전체'} 자원의 주 기한을 자원당 하나씩 조회합니다. 관련 날짜와 관측 상태는 별도로 확인합니다.</p>
      <p className="mt-1 text-sm text-neutral-500">기한 경과는 실제 중지·회수·해제 완료를 뜻하지 않습니다. 상세 화면에서 현재 상태와 변경 조건을 확인해 주세요.</p>
    </div>
    <FilterBar tabs={TABS} status={state.window} onStatus={(window) => change({ window: window === 'D7' ? undefined : window }, true)} showOrgFilter={false} orgId={scope.activeOrgId} onOrg={() => {}} orgs={[]}>
      <FormField label="자원 종류"><Select value={state.type ?? ''} onChange={(event) => change({ type: event.target.value || undefined, deadlineKind: undefined }, true)}>
        <option value="">전체 종류</option>{resourceTypesInDisplayOrder().map((type) => <option key={type} value={type}>{RESOURCE_TYPES[type].label}</option>)}
      </Select></FormField>
      <FormField label="기한 종류"><Select value={state.deadlineKind ?? ''} onChange={(event) => change({ deadlineKind: event.target.value || undefined }, true)}>
        <option value="">전체 기한</option>{Object.entries(DEADLINE_KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
      </Select></FormField>
      <FormField label="정렬"><Select value={state.sort} onChange={(event) => change({ sort: event.target.value === 'deadlineAt' ? undefined : event.target.value }, true)}><option value="deadlineAt">기한이 빠른 순</option><option value="-deadlineAt">기한이 늦은 순</option></Select></FormField>
    </FilterBar>
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
      event.preventDefault()
      const value = workspaceDraft.trim()
      if (value && !isUuid(value)) { setWorkspaceError(true); return }
      setWorkspaceError(false)
      change({ workspaceId: value.toLowerCase() || undefined }, true)
    }}>
      <FormField label="워크스페이스 ID" error={workspaceError ? '워크스페이스 ID를 UUID 형식으로 입력해 주세요.' : undefined}><Input value={workspaceDraft} onChange={(event) => setWorkspaceDraft(event.target.value)} className="w-full sm:w-80" autoComplete="off" /></FormField>
      <Button type="submit" variant="secondary">워크스페이스로 조회</Button>
    </form>
    {state.invalid ? <Alert variant="danger">조회 조건을 확인해 주세요. <Button variant="secondary" size="sm" onClick={() => change({ type: undefined, deadlineKind: undefined, workspaceId: undefined, window: undefined, sort: undefined }, true)}>필터 초기화</Button></Alert> : <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">{rows.isSuccess ? `총 ${rows.data.totalElements}개 자원` : '자원 기한 조회'}</p>
        <Button variant="secondary" disabled={!scope.ready} loading={rows.isFetching} onClick={() => { if (scope.ready) void rows.refetch() }}>현재 기한 다시 조회</Button>
      </div>
      {rows.isPending && <Spinner label="자원 기한 불러오는 중" />}
      {rows.isError && <Alert variant="danger">{rows.error.message}</Alert>}
      {outsidePage ? <Card className="space-y-3 p-6"><p>요청한 페이지가 조회 범위를 벗어났습니다.</p><Button variant="secondary" onClick={() => change({ page: undefined })}>첫 페이지 보기</Button></Card>
        : rows.isSuccess && rows.data.content.length === 0 ? <Card className="p-8 text-center text-sm text-neutral-500">조건에 해당하는 자원 기한이 없습니다.</Card>
        : rows.isSuccess && <DataTable caption="자원 기한 목록" className="min-w-[64rem]">
          <THead><TR><TH>자원</TH><TH>주 기한</TH><TH>관측 상태</TH><TH>관측 시각</TH><TH>상세</TH></TR></THead>
          <TBody>{rows.data.content.map((row) => <DeadlineRow key={`${row.type}:${row.id}`} row={row} />)}</TBody>
        </DataTable>}
      {rows.isSuccess && !outsidePage && <Pagination page={rows.data.page} totalPages={rows.data.totalPages} onPageChange={(page) => change({ page })} />}
    </>}
  </div>
}

function DeadlineRow({ row }: { row: AdminResourceDeadline }) {
  const path = deadlineDetailPath(row)
  const contextDates = Object.hasOwn(CONTEXT_DATES, row.type) ? CONTEXT_DATES[row.type] : []
  return <TR>
    <TD><span className="block font-medium">{row.name}</span><span className="block text-xs text-neutral-500">{deadlineTypeLabel(row.type)} / {row.orgName ?? '기관 정보 없음'} / {row.workspaceName ?? '워크스페이스 정보 없음'}</span>
      <details className="mt-2 text-xs"><summary className="cursor-pointer">관련 날짜</summary><dl className="mt-1 space-y-1">{contextDates.map(({ field, label, dateOnly }) => <div key={field}><dt className="inline text-neutral-500">{label}: </dt><dd className="inline">{dateOnly ? deadlineDate(row.dates[field]) : <DeadlineTimestamp value={row.dates[field]} />}</dd></div>)}</dl></details>
    </TD>
    <TD><span className="block">{deadlineKindLabel(row.deadlineKind)}</span>{row.inclusiveEndDate != null && <span className="block text-sm">{deadlineDate(row.inclusiveEndDate)}까지 포함</span>}<div className="text-xs text-neutral-500">기한 시각: <DeadlineTimestamp value={row.deadlineAt} /></div><Badge variant={row.overdue ? 'warning' : 'neutral'} className="mt-1">{!validDeadlineInstant(row.deadlineAt) || !validDeadlineInstant(row.observedAt) ? '기한 정보 확인 필요' : row.overdue ? '기한 경과' : '기한 예정'}</Badge></TD>
    <TD><span className="block">저장 상태: {deadlineStatusLabel(row.type, row.sourceStatus)}</span>{row.sourceStatus !== row.status && <span className="block text-xs text-neutral-500">기한 반영 상태: {deadlineStatusLabel(row.type, row.status)}</span>}{row.connectionStatus != null && <span className="block text-xs">저장 연결: {deadlineConnectionLabel(row.connectionStatus)}</span>}</TD>
    <TD className="whitespace-nowrap"><DeadlineTimestamp value={row.observedAt} /></TD>
    <TD>{path ? <Link className="text-primary-700 underline" to={path}>상세 열기</Link> : <><p className="break-all text-xs">자원 ID {row.id}</p><p className="mt-1 text-xs text-neutral-500">{knownDeadline(row) && row.type === 'GPU' ? 'GPU 상세 준비 중' : '기한 정보 확인 필요'}</p></>}</TD>
  </TR>
}

function DeadlineTimestamp({ value }: { value: string | null | undefined }) {
  if (!validDeadlineInstant(value)) return <span>{deadlineTime(value)}</span>
  return <div><time dateTime={value}>{deadlineTime(value)}</time><details className="text-xs text-neutral-500"><summary className="cursor-pointer">원본 시각</summary><span className="break-all">{value}</span></details></div>
}
