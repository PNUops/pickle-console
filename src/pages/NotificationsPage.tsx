import { useState } from 'react'
import { useNavigate } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationView,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { FilterBar } from '../components/FilterBar'
import { Alert, Badge, Button, Card, Pagination, Spinner } from '../components/ui'
import { cn } from '../lib/cn'
import { formatRelative } from '../lib/format'

const PAGE_SIZE = 20

const TABS: { label: string; status: true | undefined }[] = [
  { label: '전체', status: undefined },
  { label: '안읽음', status: true },
]

/** 알림함 — 학생 콘솔·관리자 콘솔이 같은 화면을 공유한다 (본인 알림만 조회). */
export function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [unreadOnly, setUnreadOnly] = useState<true | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const notifications = useQuery({
    queryKey: ['notifications', 'list', { unreadOnly: unreadOnly ?? null, page }],
    queryFn: () => fetchNotifications({ unreadOnly, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err) => setError(toApiError(err, '알림을 읽음 처리하지 못했습니다.').message),
  })

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err) =>
      setError(toApiError(err, '알림을 모두 읽음 처리하지 못했습니다.').message),
  })

  function onItemClick(notification: NotificationView) {
    if (!notification.readAt) markRead.mutate(notification.id)
    if (notification.linkPath) navigate(notification.linkPath)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">알림함</h1>
          <p className="mt-1 text-sm text-neutral-500">
            내 계정으로 발송된 알림입니다. 알림을 누르면 읽음 처리됩니다.
          </p>
        </div>
        <Button
          variant="secondary"
          loading={markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          모두 읽음
        </Button>
      </div>

      <FilterBar
        tabs={TABS}
        status={unreadOnly}
        onStatus={(next) => {
          setUnreadOnly(next)
          setPage(0)
        }}
        isSysAdmin={false}
        orgId={undefined}
        onOrg={() => {}}
        orgs={[]}
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {notifications.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="알림 불러오는 중" />
        </div>
      )}
      {notifications.isError && (
        <Alert variant="danger">{notifications.error.message}</Alert>
      )}
      {notifications.isSuccess && notifications.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">알림이 없습니다.</Card>
      )}
      {notifications.isSuccess && notifications.data.content.length > 0 && (
        <>
          <Card>
            <ul className="divide-y divide-neutral-100">
              {notifications.data.content.map((notification) => {
                const unread = notification.readAt == null
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => onItemClick(notification)}
                      className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-primary-600"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-1.5 size-2 shrink-0 rounded-full',
                          unread ? 'bg-primary-600' : 'bg-transparent',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-sm',
                            unread ? 'font-semibold text-neutral-900' : 'text-neutral-700',
                          )}
                        >
                          {notification.title}
                          {notification.importance === 'HIGH' && (
                            <Badge variant="danger" className="ml-2">
                              중요
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-neutral-500">
                          {notification.body}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-neutral-400">
                        {formatRelative(notification.createdAt)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
          <Pagination
            page={notifications.data.page}
            totalPages={notifications.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
