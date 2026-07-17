import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { ToastContext, type ToastApi } from './toast-context'

const AUTO_DISMISS_MS = 5000

const variants = {
  success: 'border-success-200 bg-success-50 text-success-800',
  danger: 'border-danger-200 bg-danger-50 text-danger-800',
} as const

type ToastVariant = keyof typeof variants

interface ToastItem {
  id: number
  variant: ToastVariant
  message: string
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  // 언마운트 후 타이머가 발화해 setState하지 않게 정리한다.
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, variant, message }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      )
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('danger', message),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* 라이브 리전은 상시 마운트 — 삽입과 동시에 생기면 첫 토스트가 낭독되지 않을 수 있다. */}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
        >
          {toasts.map((toast) => (
              <div
                key={toast.id}
                role="status"
                className={cn(
                  'pointer-events-auto flex w-full max-w-md items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-overlay',
                  variants[toast.variant],
                )}
              >
                <p>{toast.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="알림 닫기"
                  className="cursor-pointer rounded p-0.5 opacity-60 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-primary-600"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-4"
                    aria-hidden="true"
                  >
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}
