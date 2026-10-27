import { TokenLimit, TokenValue } from '../components/TokenValue'
import { requestReaderKey } from '../api/request-review'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import {
  fetchAdminLlmKeys,
  fetchAdminWorkspaces,
  fetchOpenRouterAccounts,
  type LlmApiKeyStatus,
} from '../api/queries'
import {
  Button,
  DataTable,
  EmptyState,
  Input,
  LlmKeyStatusBadge,
  LoadingBlock,
  MessageBar,
  PageHeader,
  Pagination,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { adminPaths } from '../lib/paths'
import { effectiveLlmKeyStatus, LLM_KEY_STATUS_LABELS } from '../lib/status'
import { useAdminScope } from '../lib/use-admin-scope'
import { useDebouncedValue } from '../lib/use-debounced-value'
import { useListUrl } from '../lib/use-list-url'
import { keyListState, KEY_COHORTS, KEY_SORTS } from '../lib/llm-exploration'
import { withListReturn } from '../lib/list-url'
import { isExactTokenCount } from '../lib/token-presentation'
import { passthroughText, PASSTHROUGH_ENDPOINTS, type PassthroughEndpoint } from '../lib/passthrough-endpoints'
import { KeyCreditObservation } from '../components/OpenRouterCredits'
import { useAuth } from '../auth/auth-context'
import { canQueryWork, hasAnyWork, hasWork, projectionAvailable, SYS_OPERATORS, SYS_READERS } from '../auth/institution-authority'
import { useBulkSelection } from '../lib/bulk-selection'
import {
  BulkSelectionBar,
  SelectPageHeader,
  SelectRowCell,
} from '../components/bulk/BulkSelection'

const POLICY_FEATURES = [...new Set<PassthroughEndpoint>(['chat', ...PASSTHROUGH_ENDPOINTS])]
const COHORT_LABELS = { ALL: '전체 키', COMMITTED: '현재 금액 배정', AWAITING_PROVISION: '유료 모델 발급 대기', USAGE_UNREPORTED: '현재창 사용액 미보고' }
const SORT_LABELS = { NEWEST: '최근 생성', NAME_ASC: '키 이름', TOKEN_USAGE_DESC: '오늘 TOKEN 사용 많은 순', CREDIT_LIMIT_DESC: '금액 한도 큰 순', CREDIT_REMAINING_ASC: '관측 금액 잔여 작은 순' }

const STATUSES: LlmApiKeyStatus[] = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'REVOKED',
]

function limitText(value: number | null | undefined): string {
  return value == null ? '기본값' : value.toLocaleString('ko-KR')
}

export function AdminLlmKeysPage() {
  const { user } = useAuth()
  const { activeOrgId } = useAdminScope()
  return <AdminLlmKeysPageContent key={`${activeOrgId ?? 'all'}:${requestReaderKey(user)}`} />
}

function AdminLlmKeysPageContent() {
  const scope = useAdminScope()
  const { activeOrgId } = scope
  const location = useLocation()
  const { user } = useAuth()
  const canSelect = user?.role !== 'ORG_VIEWER' && hasAnyWork(user, ['llm.token.operate', 'llm.state.operate', 'llm.period', 'llm.key.budget', 'llm.revoke', 'llm.acl.support.manage'], SYS_OPERATORS)
  const selection = useBulkSelection('llm-keys', `${requestReaderKey(user)}:${activeOrgId ?? ''}`)
  const [searchParams, change] = useListUrl()
  const parsed = keyListState(searchParams)
  const { status, workspaceId, openrouterAccountId, cohort, sort, policyModel, policyFeature } = parsed.query
  const queryInput = searchParams.get('q') ?? ''
  const query = useDebouncedValue(queryInput).trim() || undefined
  const request = { ...parsed.query, query, orgId: activeOrgId }
  const identity = JSON.stringify([requestReaderKey(user), request])
  const waitingForSearch = query !== (queryInput.trim() || undefined)

  const keys = useQuery({
    queryKey: [
      'admin',
      'llm-keys',
      identity,
    ],
    queryFn: async () => ({ value: await fetchAdminLlmKeys(request), identity, fetchedAt: new Date().toISOString() }),
    enabled: scope.ready && !parsed.error && !waitingForSearch,
  })
  const workspaces = useQuery({
    queryKey: ['admin', 'workspaces', { orgId: activeOrgId ?? null, reader: requestReaderKey(user), for: 'llm-key-filter' }],
    queryFn: () =>
      fetchAdminWorkspaces(activeOrgId == null ? {} : { orgId: activeOrgId }),
    enabled: hasAnyWork(user, ['workspace.support.read', 'workspace.info.update', 'workspace.members.manage', 'workspace.invitations.manage', 'workspace.owners.manage', 'workspace.terminate', 'workspace.recipient.cancel', 'vm.roster.issue', 'llm.roster.issue', 'vm.request.decide', 'llm.request.decide', 'domain.request.decide', 'gpu.request.decide', 'workspace.announcement.send'], SYS_READERS),
  })
  const accounts = useQuery({
    queryKey: ['admin', 'llm-accounts', { orgId: activeOrgId ?? null, reader: requestReaderKey(user), for: 'llm-key-filter' }],
    queryFn: () => fetchOpenRouterAccounts(activeOrgId),
    enabled: scope.ready && canQueryWork(user, ['institution.account.read', 'institution.account.finance.read', 'institution.account.manage', 'institution.account.credential.manage'], { orgId: activeOrgId }, SYS_READERS),
  })

  const data = !parsed.error && !waitingForSearch && keys.data?.identity === identity ? keys.data.value : undefined
  const returnTo = `${location.pathname}${location.search}`
  const pageTargets = (data?.content ?? []).map((key) => ({ id: key.id, name: key.name }))
  const financeUnavailable = data?.content.some((row) => !row.financeVisible) ?? false
  const observationUnavailable = data?.content.some((row) => !row.observationVisible) ?? false

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="리소스"
        title="LLM API 키"
        description="신청 승인 후 생성된 키의 상태와 한도를 기관·워크스페이스 범위에서 관리합니다."
      />

      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label="LLM API 키 검색"
          placeholder="이름·용도 검색"
          className="min-w-48 flex-1 sm:max-w-72"
          value={queryInput}
          onChange={(event) => {
            change({ q: event.target.value }, true, true)
          }}
        />
        <Select
          aria-label="LLM API 키 상태 필터"
          className="w-full sm:w-40"
          value={status ?? ''}
          onChange={(event) => {
            change({ status: event.target.value || undefined }, true)
          }}
        >
          <option value="">전체 상태</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {LLM_KEY_STATUS_LABELS[item]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="OpenRouter 사업 계정 필터"
          className="w-full sm:w-56"
          value={openrouterAccountId ?? ''}
          onChange={(event) => {
            change({ openrouterAccountId: event.target.value || undefined }, true)
          }}
        >
          <option value="">전체 사업 계정</option>
          {openrouterAccountId && !accounts.data?.some((account) => account.id === openrouterAccountId) && <option value={openrouterAccountId}>선택한 계정 (현재 목록에 없음)</option>}
          {accounts.data?.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </Select>
        <Select
          aria-label="LLM API 키 워크스페이스 필터"
          className="w-full sm:w-56"
          value={workspaceId ?? ''}
          onChange={(event) => {
            change({ workspaceId: event.target.value || undefined }, true)
          }}
        >
          <option value="">전체 워크스페이스</option>
          {workspaceId && !workspaces.data?.some((row) => row.id === workspaceId) && <option value={workspaceId}>선택한 공간 (현재 목록에 없음)</option>}
          {workspaces.data?.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </Select>
        <Select aria-label="키군 필터" value={cohort} onChange={(event) => change({ cohort: event.target.value }, true)}>
          {KEY_COHORTS.map((value) => <option key={value} value={value} disabled={value !== 'ALL' && financeUnavailable}>{COHORT_LABELS[value]}</option>)}
        </Select>
        <Select aria-label="키 정렬" value={sort} onChange={(event) => change({ sort: event.target.value }, true)}>
          {KEY_SORTS.map((value) => <option key={value} value={value} disabled={value.startsWith('CREDIT_') && financeUnavailable || value === 'TOKEN_USAGE_DESC' && observationUnavailable}>{SORT_LABELS[value]}</option>)}
        </Select>
        <Input aria-label="저장 정책 모델 필터" placeholder="저장 정책상 허용하는 공개 모델" value={policyModel ?? ''}
          onChange={(event) => change({ policyModel: event.target.value || undefined }, true, true)} />
        <Select aria-label="저장 정책 기능 필터" value={policyFeature ?? 'chat'} onChange={(event) => change({ policyFeature: event.target.value }, true)}>
          {POLICY_FEATURES.map((value) => <option key={value} value={value}>{passthroughText([value])}</option>)}
        </Select>
      </div>
      <Button variant="secondary" onClick={() => change(Object.fromEntries(['workspaceId', 'requestId', 'openrouterAccountId', 'status', 'q', 'cohort', 'sort', 'policyModel', 'policyFeature', 'page', 'size'].map((key) => [key, undefined])), true)}>조회 필터 초기화</Button>
      {parsed.error && <MessageBar variant="danger">{parsed.error}</MessageBar>}
      {(accounts.isFetching || workspaces.isFetching) && <MessageBar>조회 가능한 선택 항목을 불러오는 중입니다.</MessageBar>}
      {(accounts.isError || workspaces.isError) && <MessageBar variant="warning">선택 항목을 불러오지 못했습니다. 현재 조회 조건은 유지합니다.</MessageBar>}
      {!accounts.isEnabled && <p className="text-sm text-foreground-muted">사업 계정 선택 목록은 현재 업무에서 조회하지 않습니다.</p>}
      {!workspaces.isEnabled && <p className="text-sm text-foreground-muted">워크스페이스 선택 목록은 현재 업무에서 조회하지 않습니다.</p>}
      {accounts.isSuccess && accounts.data.length === 0 && <p className="text-sm text-foreground-muted">선택할 수 있는 사업 계정이 없습니다.</p>}
      {workspaces.isSuccess && workspaces.data.length === 0 && <p className="text-sm text-foreground-muted">선택할 수 있는 워크스페이스가 없습니다.</p>}
      {policyModel && <MessageBar>저장 정책과 기능 권한의 후보를 찾습니다. 발급·예산·실제 경로와 호출 성공을 보장하지 않습니다.</MessageBar>}

      {canSelect && (
        <BulkSelectionBar
          selected={selection.selected}
          capped={selection.capped}
          onClear={selection.clear}
          to={withListReturn(adminPaths.bulkLlmKeys(activeOrgId), returnTo)}
        />
      )}

      {(keys.isPending || waitingForSearch) && !parsed.error && <LoadingBlock label="LLM API 키 목록 불러오는 중" />}
      {keys.isError && <MessageBar variant="danger">{keys.error.message}</MessageBar>}
      {data && <p className="text-xs text-foreground-muted">현재 조회 {isExactTokenCount(data.totalElements) ? data.totalElements.toLocaleString('ko-KR') : '정확값 확인 불가'}개 · 목록 마지막 GET 성공 {formatDateTime(keys.data!.fetchedAt)}. 한도는 저장값이며 적용 완료를 뜻하지 않습니다. TOKEN 사용·잔여는 보존된 배치 기록 기준으로, 실시간 사용량이나 지금 남은 양을 보장하지 않습니다.</p>}
      {data && data.content.length === 0 && (
        <EmptyState
          title="표시할 LLM API 키가 없습니다"
          description="관리 범위나 상태·검색 조건을 바꿔 보세요."
        />
      )}
      {data && data.content.length > 0 && (
        <>
          <DataTable caption="관리자 LLM API 키 목록">
            <THead>
              <TR>
                {canSelect && (
                  <SelectPageHeader
                    rows={pageTargets}
                    selected={selection.selected}
                    onToggle={(on) => selection.togglePage(pageTargets, on)}
                  />
                )}
                <TH>키</TH>
                <TH>상태</TH>
                <TH>워크스페이스</TH>
                <TH>기관</TH>
                <TH>사업 계정</TH>
                <TH>저장 한도</TH>
                <TH>보존된 오늘 TOKEN 기록</TH>
                <TH>금액 관측</TH>
                <TH>마지막 사용</TH>
              </TR>
            </THead>
            <TBody>
              {data.content.map((key) => {
                const effectiveStatus = effectiveLlmKeyStatus(key.status, key.expiresAt)
                return (
                  <TR key={key.id}>
                    {canSelect && (
                      <SelectRowCell
                        target={{ id: key.id, name: key.name }}
                        checked={selection.selected.some((item) => item.id === key.id)}
                        onToggle={(on) => selection.toggle({ id: key.id, name: key.name }, on)}
                      />
                    )}
                    <TD>
                      <Link
                        to={withListReturn(adminPaths.llmKeyDetail(key.id, key.orgId ?? activeOrgId), returnTo)}
                        className="font-medium text-brand-foreground hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
                      >
                        {key.name}
                      </Link>
                      {key.purpose && (
                        <p className="mt-0.5 max-w-64 truncate text-xs text-foreground-muted">
                          {key.purpose}
                        </p>
                      )}
                    </TD>
                    <TD>
                      <LlmKeyStatusBadge status={effectiveStatus} />
                    </TD>
                    <TD>{key.workspaceName}</TD>
                    <TD>{key.orgName}</TD>
                    <TD>
                      {key.openrouterAccountId && key.openrouterAccountName ? (hasWork(user, 'institution.account.read', { orgId: key.orgId }, SYS_READERS) ?
                        <Link
                          to={adminPaths.llmAccountDetail(key.openrouterAccountId, key.orgId ?? undefined)}
                          className="font-medium text-brand-foreground hover:underline"
                        >
                          {key.openrouterAccountName}
                        </Link> : <span>{key.openrouterAccountName}</span>
                      ) : (
                        <span className="text-foreground-muted">{key.metadataVisible || key.financeVisible ? '미결합' : '제공되지 않음'}</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs">{projectionAvailable(key, 'metadataVisible') || projectionAvailable(key, 'observationVisible') ? <>
                      RPM {limitText(key.rpm)} · TPM <TokenLimit value={key.tpm} decision={false} />
                      <span className="block text-foreground-muted">
                        일일 <TokenLimit value={key.dailyTokens} daily decision={false} /> · 동시 {limitText(key.concurrency)}
                      </span></> : '제공되지 않음'}
                    </TD>
                    <TD>{key.observationVisible && key.tokenObservation ? <div className="space-y-1 text-xs">
                      <p>{key.tokenObservation.day} · <TokenValue value={key.tokenObservation.todayTokens} /></p>
                      <p>보존 기록 기준 잔여 {key.tokenObservation.remainingTokens == null ? key.dailyTokens == null ? '한도 없음' : '미확인' : <TokenValue value={key.tokenObservation.remainingTokens} />}</p>
                      <p>{formatDateTime(key.tokenObservation.observedAt)} 관측</p>
                    </div> : '제공되지 않음'}</TD>
                    <TD>{projectionAvailable(key, 'financeVisible') ? <KeyCreditObservation llmKey={key} /> : '제공되지 않음'}</TD>
                    <TD className="whitespace-nowrap">
                      {!key.metadataVisible && !key.observationVisible ? '제공되지 않음' : key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '사용 기록 없음'}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </DataTable>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={(value) => change({ page: value })}
          />
        </>
      )}
    </div>
  )
}
