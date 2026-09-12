import { useEffect, useState } from 'react'
import { currentGpuUtilization, GPU_SAMPLE_FRESHNESS_MS } from '../../lib/gpu-utilization'
import { formatRelative } from '../../lib/format'

export function GpuUtilization({ value, observedAt }: { value?: number | null; observedAt?: string | null }) {
  const [, refresh] = useState(0)
  const now = Date.now()
  const current = currentGpuUtilization(value, observedAt, now)
  const measuredAt = observedAt ? Date.parse(observedAt) : Number.NaN

  useEffect(() => {
    if (value == null || !observedAt || currentGpuUtilization(value, observedAt) == null) return
    // Expire the displayed value even when no new API response arrives.
    const remaining = Date.parse(observedAt) + GPU_SAMPLE_FRESHNESS_MS - Date.now() + 1
    const timeout = window.setTimeout(() => refresh((tick) => tick + 1), Math.max(1, remaining))
    return () => window.clearTimeout(timeout)
  }, [value, observedAt])

  return <>
    {current == null ? '측정 불가' : `${current.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`}
    {value != null && observedAt && Number.isFinite(measuredAt) && measuredAt <= now && <span className="ml-2 text-xs text-neutral-500">{formatRelative(observedAt)} 측정</span>}
  </>
}
