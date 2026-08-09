import type { ReactNode } from 'react'
import { Link } from 'react-router'
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
  statusBadge: (resource: ResourceSummary) => ReactNode
  /**
   * Whether this row still counts as something the person has. Each type owns
   * the judgment because the states are its own: a destroyed VM and a revoked
   * key are both "gone", and nothing outside knows that from the string.
   */
  isActive: (resource: ResourceSummary) => boolean
  /** An optional shortcut shown on the dashboard row (the web terminal, say). */
  rowAction?: (resource: ResourceSummary) => ReactNode
}

export const RESOURCE_TYPES: Record<ResourceSummary['type'], ResourceTypeEntry> = {
  VM: {
    label: 'VM',
    detailPath: (id) => consolePaths.vmDetail(id),
    statusBadge: (resource) => <VmStatusBadge status={resource.status as VmStatus} />,
    isActive: (resource) => resource.status !== 'DELETED' && resource.status !== 'DELETING',
    rowAction: (resource) =>
      resource.status === 'RUNNING' ? (
        <Link
          to={consolePaths.vmTerminal(resource.id)}
          className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          웹 터미널
        </Link>
      ) : null,
  },
}

export function resourceTypeEntry(type: ResourceSummary['type']): ResourceTypeEntry {
  return RESOURCE_TYPES[type]
}

