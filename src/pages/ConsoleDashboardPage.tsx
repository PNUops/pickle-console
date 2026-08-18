import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  fetchNotifications,
  fetchUnreadCount,
  fetchRequests,
  fetchResources,
  fetchVms,
} from '../api/queries'
import { resourceTypeEntry } from '../components/resource/registry'
import { consolePaths } from '../lib/paths'
import { useScope } from '../lib/use-scope'
import { useAuth } from '../auth/auth-context'
import {
  Card,
  LinkButton,
  RequestStatusBadge,
  Spinner,
  StatTile,
} from '../components/ui'
import { formatDateTime, formatDday } from '../lib/format'


/** 만료 임박으로 취급하는 잔여 일수 상한. */
const EXPIRY_SOON_DAYS = 14

/**
 * 사용자 대시보드 — 별도 집계 API 없이 목록 API를 클라이언트에서 합성한다
 * (최대 50건 기준, 현 규모에서 충분).
 *
 * 목록은 종류를 가리지 않는 리소스 인벤토리에서 읽는다. 만료 타일만 VM 목록을
 * 따로 보는데, 남은 기간은 아직 리소스 공통 항목이 아니기 때문이다.
 */
export function ConsoleDashboardPage() {
  const { user } = useAuth()
  const scope = useScope()

  const resources = useQuery({
    queryKey: ['resources', { page: 0, size: 50, workspaceId: scope }],
    queryFn: () => fetchResources({ size: 50, workspaceId: scope ?? undefined }),
  })
  const vms = useQuery({
    queryKey: ['vms', { page: 0, size: 50, workspaceId: scope }],
    queryFn: () => fetchVms({ size: 50, workspaceId: scope ?? undefined }),
  })
  const pendingRequests = useQuery({
    queryKey: ['requests', { status: 'SUBMITTED', page: 0, size: 3, workspaceId: scope }],
    queryFn: () =>
      fetchRequests({ status: 'SUBMITTED', page: 0, size: 3, workspaceId: scope ?? undefined }),
  })
  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: 30_000,
    staleTime: 25_000,
  })
  const recentNotifications = useQuery({
    queryKey: ['notifications', { page: 0, size: 5 }],
    queryFn: () => fetchNotifications({ page: 0, size: 5 }),
  })

  const activeVms = (vms.data?.content ?? []).filter(
    (vm) => vm.status !== 'DELETED' && vm.status !== 'DELETING',
  )
  // 파기된 것은 인벤토리에서도 뺀다 — 종류별 상태 어휘를 대시보드가 알 필요가
  // 없도록, 판단은 종류 레지스트리가 한다.
  const activeResources = (resources.data?.content ?? []).filter((resource) =>
    resourceTypeEntry(resource.type).isActive(resource),
  )
  const runningCount = activeVms.filter((vm) => vm.status === 'RUNNING').length

  // 만료 임박: endDate가 있고 D-14 이내인 VM 중 가장 임박한 것.
  const expiring = activeVms
    .filter((vm) => vm.endDate)
    .map((vm) => ({ vm, dday: formatDday(vm.endDate!) }))
    .filter(({ dday }) => dday.daysLeft <= EXPIRY_SOON_DAYS)
    .sort((a, b) => a.dday.daysLeft - b.dday.daysLeft)[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">대시보드</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {user?.name}님, 환영합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton to={consolePaths.newRequest(scope, 'VM')}>가상머신 신청</LinkButton>
          <LinkButton to={consolePaths.workspaces} variant="secondary">
            워크스페이스 만들기
          </LinkButton>
        </div>
      </div>

      {/* 지표 타일 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="내 리소스"
          value={resources.isPending ? '—' : `${activeResources.length}개`}
          hint={vms.isPending ? undefined : `실행 중인 VM ${runningCount}대`}
          to={consolePaths.resources(scope)}
        />
        <StatTile
          label="대기 중 신청"
          value={pendingRequests.isPending ? '—' : `${pendingRequests.data?.totalElements ?? 0}건`}
          to={consolePaths.requests(scope)}
        />
        <StatTile
          label="읽지 않은 알림"
          value={unread.isPending ? '—' : `${unread.data?.unreadCount ?? 0}건`}
          to={consolePaths.notifications}
        />
        <StatTile
          label="만료 임박"
          value={expiring ? expiring.dday.label : '—'}
          hint={
            expiring
              ? expiring.vm.displayName || expiring.vm.name
              : vms.isPending
                ? undefined
                : `${EXPIRY_SOON_DAYS}일 내 만료 없음`
          }
          tone={expiring && expiring.dday.daysLeft <= 7 ? 'danger' : 'normal'}
          to={expiring ? consolePaths.vmDetail(expiring.vm.id) : undefined}
        />
      </div>

      {/* 내 리소스 */}
      <Card>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
          <h2 className="font-semibold text-neutral-900">내 리소스</h2>
          <Link
            to={consolePaths.resources(scope)}
            className="text-sm font-medium text-primary-700 hover:text-primary-800"
          >
            모두 보기 →
          </Link>
        </div>
        {resources.isPending && (
          <div className="flex justify-center py-10">
            <Spinner label="리소스 불러오는 중" />
          </div>
        )}
        {resources.isError && (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">
            리소스 목록을 불러오지 못했습니다.
          </p>
        )}
        {resources.isSuccess && activeResources.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-neutral-500">아직 사용 중인 리소스가 없습니다.</p>
            <Link
              to={consolePaths.newRequest(scope)}
              className="mt-3 inline-flex h-9 items-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
            >
              첫 리소스 신청하기
            </Link>
          </div>
        )}
        {resources.isSuccess && activeResources.length > 0 && (
          <ul className="divide-y divide-neutral-100">
            {activeResources.slice(0, 5).map((resource) => {
              const entry = resourceTypeEntry(resource.type)
              return (
                <li key={`${resource.type}-${resource.id}`}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {/* 목록과 같은 규칙 — 접근 권한이 없거나 상세 화면이 없는
                            종류면 링크를 걸지 않는다 (열면 403인 링크는 없다). */}
                        {resource.accessLimited || !entry.detailPath ? (
                          <span className="truncate font-medium text-neutral-500">
                            {resource.displayName || resource.name}
                          </span>
                        ) : (
                          <Link
                            to={entry.detailPath(resource.id)}
                            className="truncate font-medium text-neutral-900 hover:text-primary-700 hover:underline"
                          >
                            {resource.displayName || resource.name}
                          </Link>
                        )}
                        {entry.statusBadge(resource)}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {entry.label} · {resource.workspaceName}
                      </p>
                    </div>
                    {entry.rowAction?.(resource)}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* 진행 중 신청 — 있을 때만 */}
      {pendingRequests.isSuccess && pendingRequests.data.content.length > 0 && (
        <Card>
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
            <h2 className="font-semibold text-neutral-900">진행 중 신청</h2>
            <Link
              to={consolePaths.requests(scope)}
              className="text-sm font-medium text-primary-700 hover:text-primary-800"
            >
              모두 보기 →
            </Link>
          </div>
          <ul className="divide-y divide-neutral-100">
            {pendingRequests.data.content.map((request) => (
              <li key={request.id}>
                <Link
                  to={consolePaths.requestDetail(request.id)}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-neutral-50"
                >
                  <span className="min-w-0">
                    {/* 신청을 가리키는 것은 이름이다 — 종류를 가리지 않고 모든
                        신청이 갖는 값이라, VM 사양 한 줄보다 이것이 맞다. */}
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {request.workspaceName} · {request.displayName}
                    </span>
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      {formatDateTime(request.createdAt)} 제출
                    </span>
                  </span>
                  <RequestStatusBadge status={request.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 최근 알림 */}
      <Card>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
          <h2 className="font-semibold text-neutral-900">최근 알림</h2>
          <Link
            to={consolePaths.notifications}
            className="text-sm font-medium text-primary-700 hover:text-primary-800"
          >
            알림함 →
          </Link>
        </div>
        {recentNotifications.isSuccess && recentNotifications.data.content.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">알림이 없습니다.</p>
        )}
        {recentNotifications.isSuccess && recentNotifications.data.content.length > 0 && (
          <ul className="divide-y divide-neutral-100">
            {recentNotifications.data.content.slice(0, 3).map((notification) => (
              <li key={notification.id} className="px-5 py-3">
                <p
                  className={
                    notification.readAt == null
                      ? 'text-sm font-semibold text-neutral-900'
                      : 'text-sm text-neutral-700'
                  }
                >
                  {notification.title}
                </p>
                <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">
                  {notification.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
