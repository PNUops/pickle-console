import { useLayoutEffect, useRef } from 'react'

/** Cache refresh may outlive a target surface; its UI feedback must not. */
export function useActiveResult() {
  const active = useRef(true)
  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  return active
}
