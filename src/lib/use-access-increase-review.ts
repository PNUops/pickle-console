import { createElement, useEffect, useRef, useState } from 'react'
import type { AccessConfirmation, ActorAccessImpact } from '../api/resource-access'
import { AccessIncreaseReviewModal } from '../components/resource/AccessIncreaseReview'

/** Every review belongs to one mounted actor, scope and target surface. */
export function useAccessIncreaseReview() {
  const [review, setReview] = useState<{ impact: ActorAccessImpact; target: string } | null>(null)
  const resolve = useRef<((value: AccessConfirmation | null) => void) | null>(null)
  const [purpose, setPurpose] = useState('')
  useEffect(() => () => { resolve.current?.(null); resolve.current = null }, [])
  const finish = (value: AccessConfirmation | null) => {
    resolve.current?.(value)
    resolve.current = null
    setReview(null)
    setPurpose('')
  }
  const confirm = (impact: ActorAccessImpact, target: string): Promise<AccessConfirmation | undefined | null> => {
    if (impact.increases.length === 0 && impact.pendingResourceOwners.length === 0) return Promise.resolve(undefined)
    resolve.current?.(null)
    setPurpose('')
    setReview({ impact, target })
    return new Promise((done) => { resolve.current = done })
  }
  return { confirm, modal: createElement(AccessIncreaseReviewModal, { review, purpose, setPurpose, finish }) }
}
