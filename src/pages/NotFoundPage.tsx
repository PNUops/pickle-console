import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-bold text-primary-600">404</p>
      <h1 className="text-xl font-semibold text-neutral-900">페이지를 찾을 수 없습니다</h1>
      <p className="text-sm text-neutral-500">주소가 올바른지 확인해 주세요.</p>
      <Link
        to="/"
        className="inline-flex h-10 items-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        홈으로 이동
      </Link>
    </div>
  )
}
