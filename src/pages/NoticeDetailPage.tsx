import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchNotice, noticeImageUrl } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { Alert, Badge, Card, Spinner } from '../components/ui'
import { formatDateTime } from '../lib/format'

/**
 * 공지 상세 — 공개 라우트. 본문은 서식 없는 평문이므로 마크다운을 거치지 않고
 * 줄바꿈만 살려 그린다(whitespace-pre-line).
 */
export function NoticeDetailPage() {
  const { noticeId } = useParams()
  // 목록과 같은 이유로 세션 복원을 기다린다 — 기관 공지는 로그인해야 보인다.
  const { status } = useAuth()
  const notice = useQuery({
    queryKey: ['notices', 'detail', noticeId],
    queryFn: () => fetchNotice(noticeId!),
    enabled: noticeId != null && status !== 'loading',
  })

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <Link
        to="/notices"
        className="text-sm font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        ← 공지사항 목록
      </Link>

      {(notice.isPending || status === 'loading') && (
        <div className="flex justify-center py-12">
          <Spinner label="공지사항 불러오는 중" />
        </div>
      )}
      {notice.isError && (
        <Alert variant="danger" className="mt-6">
          {notice.error.message}
        </Alert>
      )}
      {notice.isSuccess && (
        <article className="mt-4">
          <header className="border-b border-neutral-200 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              {notice.data.pinned && <Badge variant="warning">고정</Badge>}
              {notice.data.scope === 'ORG' && <Badge variant="neutral">기관</Badge>}
            </div>
            <h1 className="mt-2 text-2xl font-bold text-neutral-900">{notice.data.title}</h1>
            <p className="mt-2 text-sm text-neutral-500">
              게시 {formatDateTime(notice.data.startsAt)}
              {notice.data.endsAt && ` · 종료 ${formatDateTime(notice.data.endsAt)}`}
            </p>
          </header>

          <div className="mt-6 text-sm/7 whitespace-pre-line text-neutral-800">
            {notice.data.body}
          </div>

          {notice.data.images.length > 0 && (
            <section className="mt-8 space-y-4">
              <h2 className="text-sm font-semibold text-neutral-800">첨부 이미지</h2>
              {notice.data.images.map((image) => (
                <Card key={image.id} className="overflow-hidden p-2">
                  <img
                    src={noticeImageUrl(notice.data.id, image.id)}
                    alt={image.fileName}
                    loading="lazy"
                    className="mx-auto h-auto w-full max-w-xl rounded"
                  />
                </Card>
              ))}
            </section>
          )}
        </article>
      )}
    </div>
  )
}
