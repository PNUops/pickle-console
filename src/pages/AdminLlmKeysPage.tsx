import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  fetchAdminLlmKeys,
  fetchAdminWorkspaces,
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
  const { activeOrgId } = useAdminScope()
  const [status, setStatus] = useState<LlmApiKeyStatus | undefined>(undefined)
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined)
  const [queryInput, setQueryInput] = useState('')
  const [page, setPage] = useState(0)
  const query = useDebouncedValue(queryInput).trim() || undefined
  const previousOrgId = useRef(activeOrgId)

  useEffect(() => {
    if (previousOrgId.current === activeOrgId) return
    previousOrgId.current = activeOrgId
    setWorkspaceId(undefined)
    setPage(0)
  }, [activeOrgId])

  const keys = useQuery({
    queryKey: [
      'admin',
      'llm-keys',
      { orgId: activeOrgId ?? null, workspaceId: workspaceId ?? null, status: status ?? null, query: query ?? null, page },
    ],
    queryFn: () =>
      fetchAdminLlmKeys({
        orgId: activeOrgId,
        workspaceId,
        status,
        query,
        page,
        size: PAGE_SIZE,
      }),
  })
  const workspaces = useQuery({
    queryKey: ['admin', 'workspaces', { orgId: activeOrgId ?? null, for: 'llm-key-filter' }],
    queryFn: () =>
      fetchAdminWorkspaces(activeOrgId == null ? {} : { orgId: activeOrgId }),
  })

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
          aria-label="LLM API 키 워크스페이스 필터"
          className="w-full sm:w-56"
          value={workspaceId ?? ''}
          onChange={(event) => {
            setWorkspaceId(event.target.value || undefined)
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
                <TH>키</TH>
                <TH>상태</TH>
                <TH>워크스페이스</TH>
                <TH>기관</TH>
                <TH>사업 계정</TH>
                <TH>운영 한도</TH>
                <TH>마지막 사용</TH>
              </TR>
            </THead>
            <TBody>
              {keys.data.content.map((key) => {
                const effectiveStatus = effectiveLlmKeyStatus(key.status, key.expiresAt)
                return (
                  <TR key={key.id}>
                    <TD>
                      <Link
                        to={adminPaths.llmKeyDetail(key.id, activeOrgId)}
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
                      {key.openrouterAccountId && key.openrouterAccountName ? (
                        <Link
                          to={adminPaths.llmAccountDetail(key.openrouterAccountId, activeOrgId)}
                          className="font-medium text-brand-foreground hover:underline"
                        >
                          {key.openrouterAccountName}
                        </Link>
                      ) : (
                        <span className="text-foreground-muted">미결합</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs">
                      RPM {limitText(key.rpm)} · TPM {limitText(key.tpm)}
                      <span className="block text-foreground-muted">
                        일일 {limitText(key.dailyTokens)} · 동시 {limitText(key.concurrency)}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '사용 기록 없음'}
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
