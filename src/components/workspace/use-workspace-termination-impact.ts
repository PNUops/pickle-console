import { useRef, useState } from 'react'
import type { components } from '../../api/schema'
import { fetchWorkspaceTerminationImpact } from '../../api/workspace-termination'
import { useActiveResult } from '../../lib/use-active-result'

type Impact = components['schemas']['WorkspaceTerminationImpactResponse']
type Target = components['schemas']['WorkspaceTerminationTargetResponse']
type BlockingResource = components['schemas']['WorkspaceTerminationResourceResponse']

export function useWorkspaceTerminationImpact({ workspaceId, invitationId, admin = false }: { workspaceId: string; invitationId?: string; admin?: boolean }) {
  const active = useActiveResult()
  const generation = useRef(0)
  const loadingRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [impact, setImpact] = useState<Impact | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [resources, setResources] = useState<BlockingResource[]>([])
  const [page, setPage] = useState(0)
  const [resourcePage, setResourcePage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [confirmedFingerprint, setConfirmedFingerprint] = useState<string | null>(null)

  const load = async (part: 'refresh' | 'targets' | 'resources' = 'refresh') => {
    if (loadingRef.current) return
    loadingRef.current = true
    const issued = ++generation.current
    const fresh = part === 'refresh'
    const nextPage = fresh ? 0 : part === 'targets' ? page + 1 : page
    const nextResourcePage = fresh ? 0 : part === 'resources' ? resourcePage + 1 : resourcePage
    const expectedFingerprint = fresh ? undefined : impact?.fingerprint
    setLoading(true)
    setError(null)
    if (fresh) { setImpact(null); setTargets([]); setResources([]); setStale(false); setPage(0); setResourcePage(0) }
    try {
      const next = await fetchWorkspaceTerminationImpact(workspaceId, { invitationId, admin, page: nextPage, resourcePage: nextResourcePage })
      if (!active.current || generation.current !== issued) return
      if (next.workspaceId !== workspaceId || (next.invitationId ?? undefined) !== invitationId || next.action !== (invitationId ? 'CANCEL_INVITATION' : 'DELETE_WORKSPACE') || next.targets.page !== nextPage || next.blockingResources.page !== nextResourcePage) {
        setConfirmedFingerprint(null)
        setImpact(null)
        setTargets([])
        setResources([])
        setError('요청한 대상이나 페이지와 조회 결과가 일치하지 않습니다. 전체 영향을 다시 조회해 주세요.')
        return
      }
      if (expectedFingerprint && next.fingerprint !== expectedFingerprint) {
        setConfirmedFingerprint(null)
        setImpact(null)
        setTargets([])
        setResources([])
        setStale(true)
        return
      }
      if (!next.executable || next.fingerprint !== impact?.fingerprint) setConfirmedFingerprint(null)
      setImpact(next)
      if (fresh || part === 'targets') setTargets((previous) => fresh ? next.targets.content : [...previous, ...next.targets.content])
      if (fresh || part === 'resources') setResources((previous) => fresh ? next.blockingResources.content : [...previous, ...next.blockingResources.content])
      setPage(nextPage)
      setResourcePage(nextResourcePage)
    } catch (failure) {
      if (active.current && generation.current === issued) { setConfirmedFingerprint(null); setError(failure instanceof Error ? failure.message : '종료 영향을 불러오지 못했습니다.') }
    } finally {
      if (active.current && generation.current === issued) { loadingRef.current = false; setLoading(false) }
    }
  }

  const reset = () => {
    ++generation.current
    loadingRef.current = false
    setLoading(false)
    setImpact(null)
    setTargets([])
    setResources([])
    setError(null)
    setStale(false)
    setConfirmedFingerprint(null)
  }

  const confirmed = !!impact && impact.executable && !loading && !error && !stale && confirmedFingerprint === impact.fingerprint
  return { impact, targets, resources, page, resourcePage, loading, error, stale, load, reset, confirmed,
    confirm: (checked: boolean) => setConfirmedFingerprint(checked && impact?.executable && !loading && !error && !stale ? impact.fingerprint : null),
  }
}

