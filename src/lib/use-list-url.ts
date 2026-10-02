import { useCallback, useLayoutEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { updateListParams } from './list-url'

/** React Router does not queue functional search-param updates within a render. */
export function useListUrl() {
  const [params, setParams] = useSearchParams()
  const latest = useRef(params)
  useLayoutEffect(() => { latest.current = params }, [params])

  const change = useCallback((changes: Record<string, string | number | undefined>, resetPage = false, replace = false) => {
    const next = updateListParams(latest.current, changes, resetPage)
    latest.current = next
    setParams(next, { replace })
  }, [setParams])

  const normalize = useCallback((canonical: string) => {
    // An effect from an older render must not replace an in-flight user edit.
    if (latest.current.toString() !== params.toString() || canonical === params.toString()) return
    const next = new URLSearchParams(canonical)
    latest.current = next
    setParams(next, { replace: true })
  }, [params, setParams])

  return [params, change, normalize] as const
}
