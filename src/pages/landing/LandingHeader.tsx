import { useEffect, useRef, useState } from 'react'
import { homePathFor, useAuth } from '../../auth/auth-context'
import { Logo } from '../../components/Logo'
import { TransitionLink } from '../../components/TransitionLink'
import { DOCS_PATH } from '../../lib/brand'

const sections = [
  { href: '#resources', label: '리소스' },
  { href: '#access', label: '사용 방식' },
  { href: '#how-it-works', label: '이용 절차' },
]
const linkFocus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300'

export function LandingHeader() {
  const { status, user } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header className={`fixed inset-x-0 top-0 z-40 border-b transition-colors ${scrolled || open ? 'border-white/10 bg-neutral-950/95 backdrop-blur-md' : 'border-transparent bg-transparent'}`}
      onKeyDown={(event) => { if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus() } }}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo tone="inverse" variant="brand" />
        <nav aria-label="랜딩 섹션" className="hidden items-center gap-1 md:flex">
          {sections.map((item) => <a key={item.href} href={item.href} className={`rounded-lg px-3 py-2 text-sm font-medium text-neutral-300 hover:text-white ${linkFocus}`}>{item.label}</a>)}
          <TransitionLink to={DOCS_PATH} className={`rounded-lg px-3 py-2 text-sm font-medium text-neutral-300 hover:text-white ${linkFocus}`}>사용 가이드</TransitionLink>
        </nav>
        <nav aria-label="주 메뉴" className="flex items-center gap-2">
          {status === 'loading' ? <div aria-hidden="true" className="h-10" /> : status === 'authenticated' && user ? (
            <TransitionLink to={homePathFor(user.role)} className={`inline-flex h-10 items-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 ${linkFocus}`}>콘솔로 이동</TransitionLink>
          ) : (
            <>
              <TransitionLink to="/login" className={`hidden rounded-lg px-3 py-2 text-sm font-medium text-neutral-300 hover:text-white sm:inline-flex ${linkFocus}`}>로그인</TransitionLink>
              <TransitionLink to="/signup" className={`inline-flex h-10 items-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 ${linkFocus}`}>회원가입</TransitionLink>
            </>
          )}
          <button ref={toggle} type="button" aria-expanded={open} aria-controls="landing-mobile-menu" onClick={() => setOpen(!open)} className={`inline-flex h-10 items-center rounded-lg border border-white/20 px-3 text-sm text-neutral-200 md:hidden ${linkFocus}`}>{open ? '닫기' : '메뉴'}</button>
        </nav>
      </div>
      {open && <nav id="landing-mobile-menu" aria-label="모바일 랜딩 메뉴" className="grid gap-1 border-t border-white/10 px-4 py-3 md:hidden">
        {sections.map((item) => <a key={item.href} href={item.href} onClick={() => setOpen(false)} className={`rounded-lg px-3 py-3 text-sm text-neutral-200 hover:bg-white/5 ${linkFocus}`}>{item.label}</a>)}
        <TransitionLink to={DOCS_PATH} onClick={() => setOpen(false)} className={`rounded-lg px-3 py-3 text-sm text-neutral-200 hover:bg-white/5 ${linkFocus}`}>사용 가이드</TransitionLink>
        {status === 'unauthenticated' && <TransitionLink to="/login" onClick={() => setOpen(false)} className={`rounded-lg px-3 py-3 text-sm text-neutral-200 hover:bg-white/5 ${linkFocus}`}>로그인</TransitionLink>}
      </nav>}
    </header>
  )
}
