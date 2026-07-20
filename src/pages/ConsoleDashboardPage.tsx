import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  fetchMySshKeys,
  fetchNotifications,
  fetchUnreadCount,
  fetchVmRequests,
  fetchVms,
} from '../api/queries'
import type { components } from '../api/schema'
import { useAuth } from '../auth/auth-context'
import {
  Alert,
  Card,
  DdayBadge,
  RequestStatusBadge,
  Spinner,
  StatTile,
  VmStatusBadge,
} from '../components/ui'
import { formatDateTime, formatDday, formatSpec } from '../lib/format'

type VmSummary = components['schemas']['VmSummary']

/** 만료 임박으로 취급하는 잔여 일수 상한. */
const EXPIRY_SOON_DAYS = 14

/**
 * 사용자 대시보드 — 별도 집계 API 없이 목록 API를 클라이언트에서 합성한다
 * (내 VM 최대 50대 기준, 현 규모에서 충분).
 */
export function ConsoleDashboardPage() {
  const { user } = useAuth()

  const vms = useQuery({
    queryKey: ['vms', { page: 0, size: 50 }],
    queryFn: () => fetchVms({ size: 50 }),
  })
  const pendingRequests = useQuery({
    queryKey: ['vm-requests', { status: 'SUBMITTED', page: 0, size: 3 }],
    queryFn: () => fetchVmRequests({ status: 'SUBMITTED', page: 0, size: 3 }),
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
          <Link
            to="/console/requests/new"
            className="inline-flex h-9 items-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            VM 신청
          </Link>
          <Link
            to="/console/groups"
            className="inline-flex h-9 items-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            그룹 만들기
          </Link>
        </div>
      </div>

      <SshKeyReminder hasVm={(vms.data?.totalElements ?? 0) > 0} />

      {/* 지표 타일 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="내 VM"
          value={vms.isPending ? '—' : `${activeVms.length}대`}
          hint={vms.isPending ? undefined : `실행 중 ${runningCount}대`}
          to="/console/vms"
        />
        <StatTile
          label="대기 중 신청"
          value={pendingRequests.isPending ? '—' : `${pendingRequests.data?.totalElements ?? 0}건`}
          to="/console/requests"
        />
        <StatTile
          label="읽지 않은 알림"
          value={unread.isPending ? '—' : `${unread.data?.unreadCount ?? 0}건`}
          to="/console/notifications"
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
          to={expiring ? `/console/vms/${expiring.vm.id}` : undefined}
        />
      </div>

      {/* 내 VM */}
      <Card>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
          <h2 className="font-semibold text-neutral-900">내 VM</h2>
          <Link
            to="/console/vms"
            className="text-sm font-medium text-primary-700 hover:text-primary-800"
          >
            모두 보기 →
          </Link>
        </div>
        {vms.isPending && (
          <div className="flex justify-center py-10">
            <Spinner label="VM 불러오는 중" />
          </div>
        )}
        {vms.isError && (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">
            VM 목록을 불러오지 못했습니다.
          </p>
        )}
        {vms.isSuccess && activeVms.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-neutral-500">아직 사용 중인 VM이 없습니다.</p>
            <Link
              to="/console/requests/new"
              className="mt-3 inline-flex h-9 items-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
            >
              첫 VM 신청하기
            </Link>
          </div>
        )}
        {vms.isSuccess && activeVms.length > 0 && (
          <ul className="divide-y divide-neutral-100">
            {sortVms(activeVms)
              .slice(0, 5)
              .map((vm) => (
                <li key={vm.id}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/console/vms/${vm.id}`}
                          className="truncate font-medium text-neutral-900 hover:text-primary-700 hover:underline"
                        >
                          {vm.displayName || vm.name}
                        </Link>
                        <VmStatusBadge status={vm.status} />
                        {vm.endDate && formatDday(vm.endDate).daysLeft <= 7 && (
                          <DdayBadge endDate={vm.endDate} />
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {formatSpec(vm.vcpu, vm.memoryMb, vm.diskGb)} · {vm.groupName}
                      </p>
                    </div>
                    {vm.status === 'RUNNING' && (
                      <Link
                        to={`/console/vms/${vm.id}/terminal`}
                        className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        웹 터미널
                      </Link>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {/* 진행 중 신청 — 있을 때만 */}
      {pendingRequests.isSuccess && pendingRequests.data.content.length > 0 && (
        <Card>
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
            <h2 className="font-semibold text-neutral-900">진행 중 신청</h2>
            <Link
              to="/console/requests"
              className="text-sm font-medium text-primary-700 hover:text-primary-800"
            >
              모두 보기 →
            </Link>
          </div>
          <ul className="divide-y divide-neutral-100">
            {pendingRequests.data.content.map((request) => (
              <li key={request.id}>
                <Link
                  to={`/console/requests/${request.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-neutral-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {request.groupName} · {formatSpec(request.reqVcpu, request.reqMemoryMb, request.reqDiskGb)}
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
            to="/console/notifications"
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

/** 만료 임박 우선, 나머지는 실행 중 → 이름 순. */
function sortVms(vms: VmSummary[]): VmSummary[] {
  return [...vms].sort((a, b) => {
    const aDays = a.endDate ? formatDday(a.endDate).daysLeft : Infinity
    const bDays = b.endDate ? formatDday(b.endDate).daysLeft : Infinity
    if (aDays !== bDays) return aDays - bDays
    if ((a.status === 'RUNNING') !== (b.status === 'RUNNING')) {
      return a.status === 'RUNNING' ? -1 : 1
    }
    return (a.displayName || a.name).localeCompare(b.displayName || b.name)
  })
}

/** VM이 있는데 SSH 키가 하나도 없으면 접속 불가 — 등록을 유도하는 닫기 가능 배너. */
function SshKeyReminder({ hasVm }: { hasVm: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  const keys = useQuery({ queryKey: ['me', 'ssh-keys'], queryFn: fetchMySshKeys })

  const noKeys = keys.isSuccess && keys.data.length === 0
  if (dismissed || !hasVm || !noKeys) return null

  return (
    <Alert variant="info" title="SSH 키를 등록해 주세요">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          VM에 SSH로 접속하려면 SSH 키가 필요합니다. 아직 등록된 키가 없어 접속할 수
          없습니다.
        </p>
        <div className="flex items-center gap-3">
          <Link
            to="/console/ssh-keys"
            className="font-medium text-primary-700 hover:underline"
          >
            SSH 키 등록하기 →
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-700"
          >
            닫기
          </button>
        </div>
      </div>
    </Alert>
  )
}
