import { TokenLimit } from '../components/TokenValue'
import { requestReaderKey } from '../api/request-review'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import {
  fetchAdminLlmKeys,
  fetchAdminWorkspaces,
  fetchOpenRouterAccounts,
  type LlmApiKeyStatus,
} from '../api/queries'
import {
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
import { KeyCreditObservation } from '../components/OpenRouterCredits'
import { useAuth } from '../auth/auth-context'
import { canQueryWork, hasAnyWork, hasWork, projectionAvailable, SYS_OPERATORS, SYS_READERS } from '../auth/institution-authority'
import { useBulkSelection } from '../lib/bulk-selection'
import {
  BulkSelectionBar,
  SelectPageHeader,
  SelectRowCell,
} from '../components/bulk/BulkSelection'

const PAGE_SIZE = 20

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
  const { user } = useAuth()
  const canSelect = hasAnyWork(user, ['llm.token.operate', 'llm.state.operate', 'llm.period', 'llm.key.budget', 'llm.revoke', 'llm.acl.support.manage'], SYS_OPERATORS)
  const selection = useBulkSelection('llm-keys', `${requestReaderKey(user)}:${activeOrgId ?? ''}`)
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState<LlmApiKeyStatus | undefined>(undefined)
  const workspaceId = searchParams.get('workspaceId') ?? undefined
  const [openrouterAccountId, setOpenrouterAccountId] = useState<string | undefined>(undefined)
  const [queryInput, setQueryInput] = useState('')
  const [page, setPage] = useState(0)
  const query = useDebouncedValue(queryInput).trim() || undefined
  const previousOrgId = useRef(activeOrgId)

  useEffect(() => {
    if (previousOrgId.current === activeOrgId) return
    previousOrgId.current = activeOrgId
    setOpenrouterAccountId(undefined)
    setPage(0)
  }, [activeOrgId])

  const keys = useQuery({
    queryKey: [
      'admin',
      'llm-keys',
      { orgId: activeOrgId ?? null, reader: requestReaderKey(user), workspaceId: workspaceId ?? null, openrouterAccountId: openrouterAccountId ?? null, status: status ?? null, query: query ?? null, page },
    ],
    queryFn: () =>
      fetchAdminLlmKeys({
        orgId: activeOrgId,
        workspaceId,
        openrouterAccountId,
        status,
        query,
        page,
        size: PAGE_SIZE,
      }),
    enabled: scope.ready,
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

  const pageTargets = (keys.data?.content ?? []).map((key) => ({ id: key.id, name: key.name }))

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
            setQueryInput(event.target.value)
            setPage(0)
          }}
        />
        <Select
          aria-label="LLM API 키 상태 필터"
          className="w-full sm:w-40"
          value={status ?? ''}
          onChange={(event) => {
            setStatus((event.target.value || undefined) as LlmApiKeyStatus | undefined)
            setPage(0)
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
            setOpenrouterAccountId(event.target.value || undefined)
            setPage(0)
          }}
        >
          <option value="">전체 사업 계정</option>
          {accounts.data?.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </Select>
        <Select
          aria-label="LLM API 키 워크스페이스 필터"
          className="w-full sm:w-56"
          value={workspaceId ?? ''}
          onChange={(event) => {
            const next = new URLSearchParams(searchParams)
            if (event.target.value) next.set('workspaceId', event.target.value)
            else next.delete('workspaceId')
            setSearchParams(next, { replace: true })
            setPage(0)
          }}
        >
          <option value="">전체 워크스페이스</option>
          {workspaces.data?.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </Select>
      </div>

      {canSelect && (
        <BulkSelectionBar
          selected={selection.selected}
          capped={selection.capped}
          onClear={selection.clear}
          to={adminPaths.bulkLlmKeys(activeOrgId)}
        />
      )}

      {keys.isPending && <LoadingBlock label="LLM API 키 목록 불러오는 중" />}
      {keys.isError && <MessageBar variant="danger">{keys.error.message}</MessageBar>}
      {keys.isSuccess && keys.data.content.length === 0 && (
        <EmptyState
          title="표시할 LLM API 키가 없습니다"
          description="관리 범위나 상태·검색 조건을 바꿔 보세요."
        />
      )}
      {keys.isSuccess && keys.data.content.length > 0 && (
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
                <TH>운영 한도</TH>
                <TH>금액 관측</TH>
                <TH>마지막 사용</TH>
              </TR>
            </THead>
            <TBody>
              {keys.data.content.map((key) => {
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
                        to={adminPaths.llmKeyDetail(key.id, key.orgId ?? activeOrgId)}
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
            page={keys.data.page}
            totalPages={keys.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
