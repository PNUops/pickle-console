import type { ComponentProps, MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { withViewTransition } from '../lib/view-transition'

/**
 * View Transition 크로스페이드로 이동하는 Link — 랜딩↔인증 화면처럼 배경 톤이
 * 이어지는 전환에 사용한다. 수정키·새 탭·외부 target은 기본 동작에 맡긴다.
 */
export function TransitionLink({ to, onClick, ...rest }: ComponentProps<typeof Link>) {
  const navigate = useNavigate()

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (rest.target && rest.target !== '_self') return
    event.preventDefault()
    withViewTransition(() => navigate(to))
  }

  return <Link to={to} onClick={handleClick} {...rest} />
}
