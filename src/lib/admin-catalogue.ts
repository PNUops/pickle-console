import type { AdminOsImage, AdminRequestPeriod, NodeSummary, OsImage, VmFlavor } from '../api/queries'

export const CATALOGUE_TABS = [
  { id: 'images', label: 'OS 이미지' },
  { id: 'flavors', label: '사양' },
  { id: 'periods', label: '사용 기간' },
]

export type CatalogueStatus = 'ALL' | 'ACTIVE' | 'DISABLED'

export function catalogueState(params: URLSearchParams) {
  return {
    tab: CATALOGUE_TABS.some((tab) => tab.id === params.get('tab')) ? params.get('tab')! : 'images',
    status: ['ACTIVE', 'DISABLED'].includes(params.get('status') ?? '') ? params.get('status') as CatalogueStatus : 'ALL' as CatalogueStatus,
    q: (params.get('q') ?? '').slice(0, 100),
  }
}

/** Catalog endpoints return complete arrays, so filtering does not discard a server page. */
export function filterCatalogue<T extends { name: string; displayName: string; status: string }>(rows: T[], q: string, status: CatalogueStatus): T[] {
  const term = q.trim().toLocaleLowerCase('ko-KR')
  return rows.filter((row) => (status === 'ALL' || row.status === status)
    && `${row.name} ${row.displayName}`.toLocaleLowerCase('ko-KR').includes(term))
}

export function orderedFlavors(rows: VmFlavor[]) {
  return [...rows].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'ko-KR'))
}

export function orderedPeriods(rows: AdminRequestPeriod[]) {
  return [...rows].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'ko-KR'))
}

function compatible(image: AdminOsImage, logical: OsImage) {
  return image.name === logical.name && image.version === logical.version && image.osFamily === logical.osFamily
    && image.osVersion === logical.osVersion && image.sshUsername === logical.sshUsername && image.minDiskGb === logical.minDiskGb
}

export function logicalChoice(image: AdminOsImage, logical: OsImage[]) {
  return logical.find((entry) => compatible(image, entry))
}

/** Server logical identity is authoritative; a physical DISABLED row can still be selectable. */
export function retirementImpact(image: AdminOsImage, rows: AdminOsImage[], logical: OsImage[], nodes: NodeSummary[]) {
  const choice = logicalChoice(image, logical)
  if (!choice) return { removesChoice: false, removesLastChoice: false }
  const activeNodeIds = new Set(nodes.filter((node) => node.status === 'ACTIVE').map((node) => node.id))
  const anotherReplica = rows.some((row) => row.id !== image.id && row.status === 'ACTIVE'
    && activeNodeIds.has(row.nodeId) && compatible(row, choice))
  return { removesChoice: !anotherReplica, removesLastChoice: !anotherReplica && logical.length === 1 }
}
