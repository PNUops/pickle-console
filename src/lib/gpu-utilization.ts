export const GPU_SAMPLE_FRESHNESS_MS = 10 * 60_000

/** A missing, stale, or future sample cannot establish current GPU usage. */
export function currentGpuUtilization(value: number | null | undefined, observedAt: string | null | undefined, now = Date.now()): number | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 100 || !observedAt) return null
  const measuredAt = Date.parse(observedAt)
  const age = now - measuredAt
  return Number.isFinite(measuredAt) && age >= 0 && age <= GPU_SAMPLE_FRESHNESS_MS ? value : null
}
