import { useState } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchNotices, type NoticeView } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { Alert, Badge, Card, Pagination, Spinner } from '../components/ui'
import { formatDateTime } from '../lib/format'

const PAGE_SIZE = 10

/**
 * 공개 공지사항 목록. 로그인 없이 열리는 자리라 별도 라우트다 — 장애 공지는
 * 주소째로 공유되는 것이 쓸모의 전부이고, 익명 방문자에게는 드로어를 걸어 둘
 * 목록 맥락 자체가 없다.
 *
 * 정렬(고정 먼저, 게시 시작 최신순)과 대상 판정은 서버가 한다. 화면에서 다시
 * 정렬하면 페이지 경계 안에서만 맞는 순서가 되어 오히려 거짓말이 된다.
 */
export function NoticesPage() {
  // 세션 복원이 끝나기 전에 물으면 익명으로 물은 답이 캐시에 남는다 — 로그인
  // 사용자에게 자기 기관 공지가 끝내 보이지 않게 되므로 판정이 설 때까지 기다린다.
  const { status } = useAuth()
  const [page, setPage] = useState(0)
  const notices = useQuery({
    queryKey: ['notices', 'list', page],
    queryFn: () => fetchNotices({ page, size: PAGE_SIZE }),
    enabled: status !== 'loading',
    placeholderData: keepPreviousData,
  })

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-neutral-900">공지사항</h1>
      <p className="mt-1 text-sm text-neutral-500">
        서비스 점검·장애와 정책 변경을 이곳에 알립니다.
      </p>

      <div className="mt-6 space-y-4">
        {(notices.isPending || status === 'loading') && (
          <div className="flex justify-center py-12">
            <Spinner label="공지사항 불러오는 중" />
          </div>
        )}
        {notices.isError && <Alert variant="danger">{notices.error.message}</Alert>}
        {notices.isSuccess && notices.data.content.length === 0 && (
          <Card className="p-8 text-center text-sm text-neutral-500">
            등록된 공지사항이 없습니다.
          </Card>
        )}
        {notices.isSuccess && notices.data.content.length > 0 && (
          <>
            <Card>
              <ul className="divide-y divide-neutral-100">
                {notices.data.content.map((notice) => (
                  <li key={notice.id}>
                    <NoticeRow notice={notice} />
                  </li>
                ))}
              </ul>
            </Card>
            <Pagination
              page={notices.data.page}
              totalPages={notices.data.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  )
}

function NoticeRow({ notice }: { notice: NoticeView }) {
  return (
    <Link
      to={`/notices/${notice.id}`}
      className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-600"
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          {notice.pinned && <Badge variant="warning">고정</Badge>}
          {notice.scope === 'ORG' && <Badge variant="neutral">기관</Badge>}
          <span className="font-medium text-neutral-900">{notice.title}</span>
        </span>
        <span className="mt-1 block truncate text-sm text-neutral-500">{notice.body}</span>
      </span>
      <span className="shrink-0 text-xs whitespace-nowrap text-neutral-400">
        {formatDateTime(notice.startsAt)}
      </span>
    </Link>
  )
}
