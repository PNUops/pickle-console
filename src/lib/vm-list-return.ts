import type { AdminVmSort, VmStatus } from '../api/queries'
import { listPage } from './list-url'
import { adminPaths } from './paths'
import { safeInternalPath } from './redirect'
import { VM_STATUS_LABELS } from './status'
import { isUuid } from './validation'

export interface VmListReturn {
  reader: string
  path: string
  filters: {
    status?: VmStatus
    workspaceId?: string
    qInput: string
    sort?: AdminVmSort
    page: number
  }
}

const SORTS: AdminVmSort[] = ['name', '-name', 'endDate', '-endDate', 'createdAt', '-createdAt']

/** Restore only the same reader's VM list, in its original readable scope. */
export function vmListReturn(value: unknown, reader: string, activeOrgId?: string, allowGlobal = false): VmListReturn | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const context = value as Partial<VmListReturn>
  if (context.reader !== reader || typeof context.path !== 'string' || !safeInternalPath(context.path)) return null
  const url = new URL(context.path, 'https://pickle.invalid')
  if (url.pathname !== '/admin/vms' || url.hash) return null
  if ([...url.searchParams.keys()].some((key) => !['org', 'workspaceId'].includes(key) || url.searchParams.getAll(key).length !== 1)) return null
  const rawOrg = url.searchParams.get('org')
  const rawWorkspace = url.searchParams.get('workspaceId')
  if (rawOrg != null && !isUuid(rawOrg) || rawWorkspace != null && !isUuid(rawWorkspace)) return null
  const orgId = rawOrg?.toLowerCase()
  if (orgId !== activeOrgId && !(allowGlobal && orgId == null)) return null
  const filters = context.filters
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return null
  if (typeof filters.qInput !== 'string' || typeof filters.page !== 'number' || listPage(String(filters.page)) !== filters.page) return null
  if (filters.status !== undefined && !Object.hasOwn(VM_STATUS_LABELS, filters.status)) return null
  if (filters.workspaceId !== undefined && !isUuid(filters.workspaceId)) return null
  if (filters.sort !== undefined && !SORTS.includes(filters.sort)) return null
  return {
    reader,
    path: adminPaths.vms(orgId, rawWorkspace?.toLowerCase()),
    filters: { status: filters.status, workspaceId: filters.workspaceId?.toLowerCase(), qInput: filters.qInput, sort: filters.sort, page: filters.page },
  }
}
