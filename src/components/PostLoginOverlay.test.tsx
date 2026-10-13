import { StrictMode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { POST_LOGIN_OVERLAY_KEY, schedulePostLoginOverlay } from '../lib/storage-keys'
import { PostLoginOverlay } from './PostLoginOverlay'

vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: { name: '홍길동' } }) }))
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function renderWelcome(strict = false) {
  const view = <MemoryRouter><PostLoginOverlay /><button>콘솔 버튼</button></MemoryRouter>
  return render(strict ? <StrictMode>{view}</StrictMode> : view)
}

describe('Post-login welcome', () => {
  test('consumes a fresh welcome once under StrictMode without exposing a hidden link', () => {
    vi.useFakeTimers()
    schedulePostLoginOverlay()
    const view = renderWelcome(true)
    const message = screen.getByText('환영합니다, 홍길동님')
    expect(message.parentElement).toHaveAttribute('inert')
    expect(screen.queryByRole('link', { name: 'Pickle' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem(POST_LOGIN_OVERLAY_KEY)).toBeNull()
    view.unmount()
    renderWelcome()
    expect(screen.queryByText('환영합니다, 홍길동님')).not.toBeInTheDocument()
  })

  test('skips a welcome delayed by the consent or profile gate', () => {
    sessionStorage.setItem(POST_LOGIN_OVERLAY_KEY, String(Date.now() - 11_000))
    renderWelcome()
    expect(screen.queryByText('환영합니다, 홍길동님')).not.toBeInTheDocument()
    expect(sessionStorage.getItem(POST_LOGIN_OVERLAY_KEY)).toBeNull()
  })

  test('skips and consumes a welcome when reduced motion is requested', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    schedulePostLoginOverlay()
    renderWelcome()
    expect(screen.queryByText('환영합니다, 홍길동님')).not.toBeInTheDocument()
    expect(sessionStorage.getItem(POST_LOGIN_OVERLAY_KEY)).toBeNull()
  })

  test.each(['getItem', 'removeItem'] as const)('does not interrupt the console when storage %s throws', (method) => {
    schedulePostLoginOverlay()
    const original: (this: Storage, key: string) => string | null | void = Storage.prototype[method]
    vi.spyOn(Storage.prototype, method).mockImplementation(function (this: Storage, key: string) {
      if (key === POST_LOGIN_OVERLAY_KEY) throw new DOMException('Storage blocked', 'SecurityError')
      return original.call(this, key)
    })
    expect(() => renderWelcome()).not.toThrow()
    expect(screen.getByRole('button', { name: '콘솔 버튼' })).toBeInTheDocument()
    expect(screen.queryByText('환영합니다, 홍길동님')).not.toBeInTheDocument()
  })

  test.each(['pointerDown', 'keyDown'] as const)('reveals the console immediately on %s', (event) => {
    schedulePostLoginOverlay()
    renderWelcome()
    expect(screen.getByText('환영합니다, 홍길동님')).toBeInTheDocument()
    fireEvent[event](screen.getByRole('button', { name: '콘솔 버튼' }), { key: 'Tab' })
    expect(screen.queryByText('환영합니다, 홍길동님')).not.toBeInTheDocument()
  })
})
