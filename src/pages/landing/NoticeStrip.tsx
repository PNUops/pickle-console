import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchNotices } from '../../api/queries'
import { cn } from '../../lib/cn'
import { LANDING_NOTICE_DISMISS_KEY } from '../../lib/storage-keys'

/** 후보를 찾기 위해 훑는 공개 목록의 크기(고정 먼저 최신순 첫 페이지). */
const STRIP_SCAN_SIZE = 10

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(LANDING_NOTICE_DISMISS_KEY)
  } catch {
    return null
  }
}

/**
 * 랜딩과 로그인 화면 맨 위에 놓이는 공지 한 줄.
 *
 * 장애 공지가 가장 필요한 사람은 아직 로그인하지 못한 사람이므로, 문 앞인
 * 랜딩과 인증 화면 두 곳에 같은 줄을 세운다. 익명에게 보이는 것만 — 즉 공개
 * 대상(PUBLIC)이면서 고정이거나 팝업으로 표시된 공지만 — 골라 하나를 띄운다.
 *
 * 조회가 실패하거나 늦으면 아무것도 그리지 않는다. 첫 화면이 API 하나 때문에
 * 막히거나 오류를 말하는 일은 없어야 한다.
 */
export function NoticeStrip({ className }: { className?: string }) {
  const notices = useQuery({
    queryKey: ['notices', 'strip'],
    queryFn: () => fetchNotices({ page: 0, size: STRIP_SCAN_SIZE }),
    staleTime: 5 * 60_000,
    retry: false,
  })

  // StrictMode는 초기화 함수를 두 번 부른다 — 여기서는 읽기만 하고 쓰기는 핸들러에서.
  const [dismissedId, setDismissedId] = useState<string | null>(() => readDismissed())

  const notice = (notices.data?.content ?? []).find(
    (candidate) => candidate.audience === 'PUBLIC' && (candidate.pinned || candidate.popup),
  )
  if (!notice || notice.id === dismissedId) return null

  const dismiss = () => {
    setDismissedId(notice.id)
    try {
      sessionStorage.setItem(LANDING_NOTICE_DISMISS_KEY, notice.id)
    } catch {
      // 저장소가 막힌 브라우저 — 이번 화면에서만 닫힌다.
    }
  }

  return (
    <div
      className={cn(
        'relative z-30 border-b border-white/10 bg-neutral-950/95 backdrop-blur-md',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <span
          aria-hidden="true"
          className="hidden shrink-0 rounded-full border border-primary-400/40 bg-primary-400/10 px-2 py-0.5 text-[11px] font-medium text-primary-300 sm:inline"
        >
          공지
        </span>
        <p className="min-w-0 flex-1 truncate text-sm text-neutral-200">{notice.title}</p>
        <Link
          to={`/notices/${notice.id}`}
          className="shrink-0 text-sm font-medium text-primary-300 hover:text-primary-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
        >
          자세히 보기
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="공지 닫기"
          className="shrink-0 cursor-pointer rounded p-0.5 text-neutral-500 hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
