import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/queries'
import type { components } from '../api/schema'
import { PopoverPanel, Spinner, usePopover } from './ui'
import { cn } from '../lib/cn'
import { formatDateTime } from '../lib/format'

type NotificationView = components['schemas']['NotificationView']

/**
 * 상단 바 알림 종 — 읽지 않은 수를 폴링해 배지로 보여주고, 클릭 시 최근 알림
 * 팝오버를 연다(항목 클릭=읽음 처리+이동, 모두 읽음, 알림함 전체 보기).
 */
export function NotificationBell({ to }: { to: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { open, toggle, rootRef, triggerRef } = usePopover()

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: 30_000,
    staleTime: 25_000,
  })
  const count = unread.data?.unreadCount ?? 0

  // 최근 5건 — 팝오버가 열렸을 때만 조회(대시보드 최근 알림과 쿼리키 공유).
  const recent = useQuery({
    queryKey: ['notifications', { page: 0, size: 5 }],
    queryFn: () => fetchNotifications({ page: 0, size: 5 }),
    enabled: open,
  })

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  function onItemClick(notification: NotificationView) {
    if (!notification.readAt) markRead.mutate(notification.id)
    // linkPath 이동 시 라우트 변경으로 팝오버가 닫힌다(usePopover 안전망).
    if (notification.linkPath) navigate(notification.linkPath)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={`읽지 않은 알림 ${count}개`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative cursor-pointer rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold text-white"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      <PopoverPanel open={open} aria-label="알림" className="w-80 sm:w-96">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-neutral-900">알림</span>
          <button
            type="button"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending || count === 0}
            className="cursor-pointer rounded text-xs font-medium text-primary-700 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-default disabled:text-neutral-400"
          >
            모두 읽음
          </button>
        </div>

        {recent.isPending && (
          <div className="flex justify-center py-8">
            <Spinner label="알림 불러오는 중" />
          </div>
        )}
        {recent.isError && (
          <p className="px-4 py-6 text-center text-sm text-neutral-500">
            알림을 불러오지 못했습니다.
          </p>
        )}
        {recent.isSuccess && recent.data.content.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">알림이 없습니다.</p>
        )}
        {recent.isSuccess && recent.data.content.length > 0 && (
          <ul className="max-h-96 divide-y divide-neutral-100 overflow-y-auto">
            {recent.data.content.map((notification) => {
              const isUnread = notification.readAt == null
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => onItemClick(notification)}
                    className="flex w-full cursor-pointer items-start gap-2.5 px-4 py-3 text-left hover:bg-neutral-50"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        isUnread ? 'bg-info-500' : 'bg-transparent',
                      )}
                    />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block truncate text-sm',
                          isUnread ? 'font-semibold text-neutral-900' : 'text-neutral-700',
                        )}
                      >
                        {notification.title}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-neutral-500">
                        {notification.body}
                      </span>
                      <span className="mt-1 block text-[11px] text-neutral-400">
                        {formatDateTime(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="border-t border-neutral-100 px-4 py-2.5 text-center">
          <Link
            to={to}
            className="text-sm font-medium text-primary-700 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            알림함 전체 보기
          </Link>
        </div>
      </PopoverPanel>
    </div>
  )
}
