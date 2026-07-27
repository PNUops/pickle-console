import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyAdminRoute,
  fetchAdminRoutes,
  fetchOrgs,
  resyncRoutes,
  type RouteStatus,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { isSysTier } from '../auth/permissions'
import { FilterBar } from '../components/FilterBar'
import {
  Alert,
  Button,
  Card,
  DomainKindBadge,
  Pagination,
  RouteStatusBadge,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { ROUTE_STATUS_LABELS } from '../lib/status'

const PAGE_SIZE = 20

const STATUS_TABS: { label: string; status: RouteStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: ROUTE_STATUS_LABELS.APPLIED, status: 'APPLIED' },
  { label: ROUTE_STATUS_LABELS.PENDING, status: 'PENDING' },
  { label: ROUTE_STATUS_LABELS.FAILED, status: 'FAILED' },
]

export function AdminRoutesPage() {
  const { user } = useAuth()
  const isSysAdmin = !!user && isSysTier(user.role)
  const [status, setStatus] = useState<RouteStatus | undefined>(undefined)
  const [orgId, setOrgId] = useState<number | undefined>(undefined)
  const [page, setPage] = useState(0)

  const [message, setMessage] = useState<string | null>(null)

  const routes = useQuery({
    queryKey: ['admin', 'routes', { status: status ?? null, orgId: orgId ?? null, page }],
    queryFn: () => fetchAdminRoutes({ status, orgId, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: isSysAdmin })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">도메인 라우팅</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {isSysAdmin ? '전체' : '우리 기관'} 공개 서비스의 라우트 적용 상태와 proxy-agent
            동기화 상태입니다.
          </p>
        </div>
        {isSysAdmin && <ResyncButton />}
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
      />

      {message && <Alert variant="info">{message}</Alert>}

      {routes.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="라우트 목록 불러오는 중" />
        </div>
      )}
      {routes.isError && <Alert variant="danger">{routes.error.message}</Alert>}
      {routes.isSuccess && routes.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          공개된 서비스가 없습니다.
        </Card>
      )}
      {routes.isSuccess && routes.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>공개 주소</TH>
                  <TH>VM / 그룹</TH>
                  {isSysAdmin && <TH>기관</TH>}
                  <TH>포트</TH>
                  <TH>상태</TH>
                  <TH>동기화</TH>
                  <TH>
                    <span className="sr-only">작업</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {routes.data.content.map((route) => (
                  <TR key={route.id}>
                    <TD>
                      <span className="font-mono text-sm">{route.fqdn}</span>
                      <span className="mt-0.5 block">
                        <DomainKindBadge kind={route.domainKind} />
                      </span>
                    </TD>
                    <TD>
                      {route.vmName}
                      <span className="block text-xs text-neutral-500">{route.groupName}</span>
                    </TD>
                    {isSysAdmin && <TD>{route.orgName}</TD>}
                    <TD>{route.targetPort}</TD>
                    <TD>
                      <RouteStatusBadge status={route.status} />
                      {route.status === 'FAILED' && route.lastError && (
                        <span className="mt-0.5 block max-w-xs truncate text-xs text-danger-600">
                          {route.lastError}
                        </span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {route.appliedGeneration != null
                        ? `gen ${route.appliedGeneration}`
                        : '미적용'}
                      {route.appliedAt && (
                        <span className="block">{formatDateTime(route.appliedAt)}</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <ApplyRouteButton routeId={route.id} onDone={setMessage} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={routes.data.page}
            totalPages={routes.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}

/** 개별 라우트 재적용 — 관리자 4역할 (기관 계층은 자기 기관 라우트, 서버 강제). */
function ApplyRouteButton({
  routeId,
  onDone,
}: {
  routeId: number
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const apply = useMutation({
    mutationFn: () => applyAdminRoute(routeId),
    onSuccess: async (data) => {
      onDone(data.message)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'routes'] })
    },
    onError: (err) => onDone(toApiError(err, '라우트 재적용을 접수하지 못했습니다.').message),
  })
  return (
    <Button variant="secondary" size="sm" loading={apply.isPending} onClick={() => apply.mutate()}>
      재적용
    </Button>
  )
}

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
