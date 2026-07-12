import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchUnreadCount } from '../api/queries'

/** 상단 바 알림 종 — 읽지 않은 알림 수를 주기적으로 폴링해 배지로 보여준다. */
export function NotificationBell({ to }: { to: string }) {
  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: 30_000,
    staleTime: 25_000,
  })
  const count = unread.data?.unreadCount ?? 0

  return (
    <Link
      to={to}
      aria-label={`읽지 않은 알림 ${count}개`}
      className="relative rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-primary-600"
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
    </Link>
  )
}
