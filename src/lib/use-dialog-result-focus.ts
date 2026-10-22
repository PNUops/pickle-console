import { useEffect, useRef } from 'react'

export function useDialogResultFocus(pending: boolean) {
  const contentRef = useRef<HTMLDivElement>(null)
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  const wasPending = useRef(false)

  useEffect(() => {
    const settled = wasPending.current && !pending
    wasPending.current = pending
    if (!settled) return
    const dialog = contentRef.current?.closest<HTMLElement>('[role="dialog"]')
    // A disabled pending control can blur to BODY; preserve any focus still inside.
    if (!dialog || dialog.contains(document.activeElement)) return
    const activeModal = document.activeElement?.closest('[aria-modal="true"]')
    if (activeModal && activeModal !== dialog) return
    // An upper portalled modal may also have blurred to BODY while pending.
    const openModals = document.querySelectorAll('[aria-modal="true"]')
    if (openModals.item(openModals.length - 1) !== dialog) return
    const target = errorRef.current ?? resultHeadingRef.current ?? actionRef.current
    if (target instanceof HTMLButtonElement && target.disabled) dialog.focus()
    else (target ?? dialog).focus()
  }, [pending])

  return { contentRef, resultHeadingRef, errorRef, actionRef }
}
