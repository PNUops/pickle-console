import { useNavigate } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { PopoverPanel, usePopover } from '../components/ui'
import { USER_ROLE_LABELS } from '../lib/labels'

export function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { open, toggle, close, rootRef, triggerRef } = usePopover()

  if (!user) return null

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const go = (path: string) => {
    close()
    navigate(path)
  }

  const itemClass =
    'block w-full cursor-pointer border-b border-neutral-100 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50'

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
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
            {USER_ROLE_LABELS[user.role]}
          </span>
        </span>
      </button>
      <PopoverPanel open={open} role="menu" aria-label="내 계정" className="w-48 py-1">
        <p className="border-b border-neutral-100 px-3 py-2 text-xs text-neutral-500">
          {user.email}
        </p>
        {user.role === 'USER' && (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => go('/console/account')}
              className={itemClass}
            >
              계정 설정
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => go('/console/ssh-keys')}
              className={itemClass}
            >
              SSH 키
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => go('/console/activity')}
              className={itemClass}
            >
              내 활동
            </button>
          </>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={() => void handleLogout()}
          className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
        >
          로그아웃
        </button>
      </PopoverPanel>
    </div>
  )
}
