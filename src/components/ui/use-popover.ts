import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'

/**
 * 비모달 팝오버(디스클로저) 상태 훅 — {@link PopoverPanel}과 함께 쓴다.
 * 포커스 트랩 없는 non-modal 패턴: 바깥 클릭·Escape·라우트 이동 시 닫히고,
 * Escape로 닫을 때는 트리거 버튼으로 포커스를 되돌린다.
 */
export function usePopover() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // 패널 안 링크로 이동하는 등 라우트가 바뀌면 항상 닫는다(드로어와 같은 안전망).
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  return { open, toggle, close, rootRef, triggerRef }
}

