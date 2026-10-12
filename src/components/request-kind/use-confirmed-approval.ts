import { useLayoutEffect, useRef, useState } from 'react'
import type { ApproveRequest } from '../../api/queries'
import type { DecisionFormApi } from './types'

/** Do not submit a body that changed since the current confirmation was rendered. */
export function useConfirmedApproval(form: DecisionFormApi, open: boolean) {
  const [changed, setChanged] = useState(false)
  const [, refresh] = useState(0)
  const displayed = open ? form.body() : null
  const visible = useRef<ApproveRequest | null>(null)
  useLayoutEffect(() => {
    visible.current = displayed
    if (!open) setChanged(false)
  }, [displayed, open])
  const confirmedBody = () => {
    const current = form.body()
    if (JSON.stringify(current) !== JSON.stringify(visible.current)) {
      setChanged(true)
      refresh((revision) => revision + 1)
      return null
    }
    return current
  }
  return { displayed, changed, confirmedBody }
}
