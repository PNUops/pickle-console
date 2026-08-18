import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-style'

/**
 * 버튼처럼 보이는 링크 — 누르면 다른 화면으로 가는 주 행동(목록 화면의 신청
 * 버튼 등)에 쓴다. 가는 곳이 실제로 있으므로 앵커여야 하고(새 탭·주소 복사),
 * 겉모습만 Button과 같다.
 */
export function LinkButton({
  to,
  variant,
  size,
  className,
  children,
}: {
  to: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
}) {
  return (
    <Link to={to} className={buttonClass({ variant, size, className })}>
      {children}
    </Link>
  )
}
