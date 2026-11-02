import { useState } from 'react'
import type { NotificationView } from '../api/queries'
import { FilterBar } from '../components/FilterBar'
import { Alert, Badge, Button, Card, Pagination, Spinner } from '../components/ui'
import { cn } from '../lib/cn'
import { formatRelative } from '../lib/format'
import { useNotificationNavigation } from '../lib/use-notification-navigation'
import { UsageMailPreference } from '../components/notifications/UsageMailPreference'
import { useNotificationActions, useNotificationList, useNotificationReader, usageNotificationPath, USAGE_ALERT_EVENT, type NotificationReader } from '../lib/notification-reader'

const PAGE_SIZE = 20

const TABS: { label: string; status: true | undefined }[] = [
  { label: '전체', status: undefined },
  { label: '안읽음', status: true },
]

/** 알림함 — 사용자 콘솔·관리자 콘솔이 같은 화면을 공유한다 (본인 알림만 조회). */
export function NotificationsPage() {
  const reader = useNotificationReader()
  if (reader == null) return <Spinner label="로그인 상태 확인 중" />
  return <NotificationInbox key={reader.account} reader={reader} />
}

function NotificationInbox({ reader }: { reader: NotificationReader }) {
  const { openNotification, navigationError } = useNotificationNavigation()
  const [unreadOnly, setUnreadOnly] = useState<true | undefined>(undefined)
  const [page, setPage] = useState(0)

  const notifications = useNotificationList(reader, { unreadOnly, page, size: PAGE_SIZE })

  const { markRead, markAll, error, isCurrentReader, reportError } = useNotificationActions(reader)

  async function onItemClick(notification: NotificationView) {
    if (notification.event === USAGE_ALERT_EVENT) {
      try {
        const fresh = await markRead.mutateAsync({ id: notification.id, reader })
        if (!isCurrentReader(reader)) return
        const destination = usageNotificationPath(fresh)
        if (!destination) {
          reportError('알림 연결 정보를 확인하지 못했습니다. 다시 조회해 주세요.', reader)
          return
        }
        await openNotification(destination)
      } catch { /* The owned mutation exposes the current reader error. */ }
      return
    }
    if (!notification.readAt) markRead.mutate({ id: notification.id, reader })
    void openNotification(notification.linkPath)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">알림함</h1>
        </div>
        <Button
          variant="secondary"
          loading={markAll.isPending}
          onClick={() => markAll.mutate({ reader })}
        >
          모두 읽음
        </Button>
      </div>

      <UsageMailPreference key={JSON.stringify([reader.account, reader.context])} reader={reader} />

      <FilterBar
        tabs={TABS}
        status={unreadOnly}
        onStatus={(next) => {
          setUnreadOnly(next)
          setPage(0)
        }}
        showOrgFilter={false}
        orgId={undefined}
        onOrg={() => {}}
        orgs={[]}
      />

      {error && <Alert variant="danger">{error}</Alert>}
      {navigationError && <Alert variant="danger">{navigationError}</Alert>}

      {notifications.showingLegacySnapshot && <p className="text-sm text-neutral-500">일부 알림은 이전 조회 결과예요.</p>}
      {notifications.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="알림 불러오는 중" />
        </div>
      )}
      {notifications.isError && (
        <Alert variant="danger">{notifications.error.message}</Alert>
      )}
      {notifications.currentResponse && notifications.data?.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">알림이 없습니다.</Card>
      )}
      {notifications.data && notifications.data.content.length > 0 && (
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
                        <span className={cn('mt-0.5 block text-xs text-neutral-500', notification.event === USAGE_ALERT_EVENT
                          ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'truncate')}>
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
          {notifications.currentResponse && <Pagination
            page={notifications.data.page}
            totalPages={notifications.data.totalPages}
            onPageChange={setPage}
          />}
        </>
      )}
    </div>
  )
}
