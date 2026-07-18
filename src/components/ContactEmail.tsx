import { cn } from '../lib/cn'

/** 운영 문의 이메일 mailto 링크. 값이 없으면 아무것도 렌더링하지 않는다. */
export function ContactEmail({
  email,
  className,
}: {
  email: string | null | undefined
  className?: string
}) {
  if (!email) return null
  return (
    <a
      href={`mailto:${email}`}
      className={cn('font-medium text-primary-700 hover:underline', className)}
    >
      {email}
    </a>
  )
}
