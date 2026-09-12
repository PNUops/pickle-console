import type { GpuAllocation } from '../api/gpu'

export function gpuDetailPollInterval(allocation: GpuAllocation | undefined): number | false {
  if (!allocation || allocation.status === 'RELEASED' || allocation.status === 'CANCELED') return false
  return allocation.status === 'RELEASING' || allocation.connectionStatus === 'ATTACHING' || allocation.connectionStatus === 'DETACHING' ? 3000 : 30_000
}

export function gpuListPollInterval(rows: GpuAllocation[] | undefined): number | false {
  return rows?.some((row) => gpuDetailPollInterval(row) !== false) ? 30_000 : false
}
