import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/auth-context'

const ROLE_LABELS: Record<string, string> = {
  STUDENT: '학생',
  ORG_ADMIN: '기관 관리자',
  SYS_ADMIN: '시스템 관리자',
}

export function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!user) return null

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-800">
          {user.name.slice(0, 1)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block leading-tight font-medium text-neutral-900">{user.name}</span>
          <span className="block text-xs leading-tight text-neutral-500">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-card"
        >
          <p className="border-b border-neutral-100 px-3 py-2 text-xs text-neutral-500">
            {user.email}
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
