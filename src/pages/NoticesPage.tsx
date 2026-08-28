import { useState } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchNotices, type NoticeView } from '../api/queries'
import { Alert, Badge, Card, Pagination, Spinner } from '../components/ui'
import { formatDateTime } from '../lib/format'
import { consolePaths } from '../lib/paths'

const PAGE_SIZE = 10

/**
 * 공지사항 목록. 상세와 함께 별도 라우트인 것은 공지가 주소째로 공유되기
 * 때문이고, 드로어가 아닌 이유도 같다. 콘솔 껍데기 안에 있으므로 세션은 이미
 * 정해져 있다 — 라우트에 닿았다는 것이 곧 인증됐다는 뜻이다.
 *
 * 정렬(고정 먼저, 게시 시작 최신순)과 대상 판정은 서버가 한다. 화면에서 다시
 * 정렬하면 페이지 경계 안에서만 맞는 순서가 되어 오히려 거짓말이 된다.
 */
export function NoticesPage() {
  const [page, setPage] = useState(0)
  const notices = useQuery({
    queryKey: ['notices', 'list', page],
    queryFn: () => fetchNotices({ page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">공지사항</h1>
        <p className="mt-1 text-sm text-neutral-500">
          서비스 점검·장애와 정책 변경을 이곳에 알립니다.
        </p>
      </div>

      <div className="space-y-4">
        {notices.isPending && (
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
      to={consolePaths.noticeDetail(notice.id)}
      className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-600"
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          {notice.pinned && <Badge variant="warning">고정</Badge>}
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
