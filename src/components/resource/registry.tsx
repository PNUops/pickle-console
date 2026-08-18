import type { ReactNode } from 'react'
import type { ResourceSummary } from '../../api/queries'
import { consolePaths } from '../../lib/paths'
import { TerminalRowAction } from './TerminalRowAction'
import { LlmKeyStatusBadge, VmStatusBadge } from '../ui'
import type { LlmApiKeyStatus, VmStatus } from '../../lib/status'

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
  /** Absent when this build has no screen for the type — the row stays text. */
  detailPath?: (id: string) => string
  /**
   * Where a workspace owner with no grant goes to hand one out. Separate from
   * the detail path because the two answer different questions: this one opens
   * for exactly the people the detail refuses, which is why a restricted row
   * can offer it.
   */
  accessPath?: (id: string) => string
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
    label: '가상머신',
    detailPath: (id) => consolePaths.vmDetail(id),
    accessPath: (id) => consolePaths.vmAccess(id),
    statusBadge: (resource) => <VmStatusBadge status={resource.status as VmStatus} />,
    isActive: (resource) => resource.status !== 'DELETED' && resource.status !== 'DELETING',
    rowAction: (resource) =>
      resource.status === 'RUNNING' ? <TerminalRowAction resource={resource} /> : null,
  },
  LLM_API_KEY: {
    label: 'LLM API 키',
    detailPath: (id) => consolePaths.llmKeyDetail(id),
    accessPath: (id) => consolePaths.llmKeyAccess(id),
    statusBadge: (resource) => (
      <LlmKeyStatusBadge status={resource.status as LlmApiKeyStatus} />
    ),
    // 폐기만이 "없어짐"이다. 만료·정지는 다시 살아날 수 있는 상태이고, 발급 전
    // 키는 아직 비밀이 없을 뿐 이미 승인받아 가지고 있는 것이다 — 서버가
    // 워크스페이스에 남은 것을 셀 때 쓰는 기준과 같다.
    isActive: (resource) => resource.status !== 'REVOKED',
  },
}

/**
 * The entry for a type this build does not know.
 *
 * The record looks total to the compiler, but the api and the console deploy
 * on their own schedules: a type added server-side reaches a console still
 * running the old bundle. A row it cannot describe degrades to its raw type
 * and status rather than taking the whole screen down with it.
 */
function unknownTypeEntry(type: string): ResourceTypeEntry {
  return {
    label: type,
    statusBadge: (resource) => resource.status,
    // Counted as something the person has: it came back from the inventory,
    // and only the type itself knows which of its states mean "gone".
    isActive: () => true,
  }
}

export function resourceTypeEntry(type: ResourceSummary['type']): ResourceTypeEntry {
  return RESOURCE_TYPES[type] ?? unknownTypeEntry(type)
}

