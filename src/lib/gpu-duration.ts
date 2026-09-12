export type GpuDurationUnit = 'hours' | 'days'

/** Normalize an explicit duration; an empty field never chooses an operating default. */
export function gpuDurationHours(value: string, unit: GpuDurationUnit): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const hours = Number(value) * (unit === 'days' ? 24 : 1)
  return Number.isSafeInteger(hours) && hours > 0 && hours <= 2_147_483_647 ? hours : null
}

export function gpuDurationLabel(hours: number | null | undefined): string {
  if (hours == null) return '—'
  return hours % 24 === 0 ? `${hours / 24}일` : `${hours}시간`
}
