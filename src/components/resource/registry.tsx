import type { ReactNode } from 'react'
import type { ResourceSummary } from '../../api/queries'
import { consolePaths } from '../../lib/paths'
import { VmStatusBadge } from '../ui'
import type { VmStatus } from '../../lib/status'

/**
 * What the type-agnostic screens need to know about each kind of resource.
 *
 * The inventory row carries only the common fields, so anything that reads as
 * "a VM thing" — the status vocabulary, where its detail page lives, what a
 * one-line summary says — is looked up here. A second kind of resource adds an
 * entry; the screens themselves do not change.
 */
export type ResourceTypeEntry = {
  label: string
  detailPath: (id: number) => string
  /** A short line under the name: the specification, an expiry, whatever fits. */
  summaryLine: (resource: ResourceSummary) => ReactNode
  statusBadge: (resource: ResourceSummary) => ReactNode
}

export const RESOURCE_TYPES: Record<ResourceSummary['type'], ResourceTypeEntry> = {
  VM: {
    label: 'VM',
    detailPath: (id) => consolePaths.vmDetail(id),
    // The inventory does not carry a VM's specification, and asking for it per
    // row would undo the point of one flat list. The VM's own list still shows
    // it; here the workspace is what tells the rows apart.
    summaryLine: (resource) => resource.workspaceName,
    statusBadge: (resource) => <VmStatusBadge status={resource.status as VmStatus} />,
  },
}

export function resourceTypeEntry(type: ResourceSummary['type']): ResourceTypeEntry {
  return RESOURCE_TYPES[type]
}

