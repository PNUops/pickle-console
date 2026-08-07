import { Link } from 'react-router'
import { CONTACT_URL, FEEDBACK_URL, SERVICE_NAME } from '../lib/brand'

/**
 * 사용 가이드 자리표시자. 사이드바 하단 링크가 가리킬 경로를 먼저 확보해 두고,
 * 실제 본문은 이후에 이 라우트 안에서 구현한다.
 */
export function DocsPage() {
  const linkClass =
    'font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800'

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold text-neutral-900">사용 가이드</h1>
      <p className="mt-3 text-sm text-neutral-600">
        {SERVICE_NAME} 사용 안내를 준비하고 있습니다. 준비되는 대로 이 자리에 공개합니다.
      </p>
      <p className="mt-2 text-sm text-neutral-600">
        그때까지 궁금한 점은{' '}
        <a href={CONTACT_URL} target="_blank" rel="noreferrer" className={linkClass}>
          문의 창구
        </a>
        로, 개선 의견은{' '}
        <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className={linkClass}>
          의견 창구
        </a>
        로 보내 주세요.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex h-10 items-center rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        홈으로 이동
      </Link>
    </div>
  )
}
