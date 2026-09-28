import { useCallback, useEffect, useState } from 'react'

/** The most targets one bulk change takes. Same value as the server. */
export const BULK_SELECTION_CAP = 200

/** A selected row: its id for the request and its name for the screens after. */
export interface BulkTarget {
  id: string
  name: string
}

export interface SelectionUpdate {
  next: BulkTarget[]
  /** True when the cap left at least one requested row out. */
  capped: boolean
}

/** Turns one row on or off. Turning on past the cap leaves the selection as it was. */
export function toggleTarget(
  selected: readonly BulkTarget[],
  target: BulkTarget,
  on: boolean,
): SelectionUpdate {
  const without = selected.filter((item) => item.id !== target.id)
  if (!on) return { next: without, capped: false }
  if (without.length !== selected.length) return { next: [...selected], capped: false }
  if (selected.length >= BULK_SELECTION_CAP) return { next: [...selected], capped: true }
  return { next: [...selected, target], capped: false }
}

/**
 * Turns every row of the visible page on or off. Turning on adds rows in page
 * order until the cap; rows selected on other pages are never touched.
 */
export function togglePage(
  selected: readonly BulkTarget[],
  rows: readonly BulkTarget[],
  on: boolean,
): SelectionUpdate {
  if (!on) {
    const pageIds = new Set(rows.map((row) => row.id))
    return { next: selected.filter((item) => !pageIds.has(item.id)), capped: false }
  }
  const chosen = new Set(selected.map((item) => item.id))
  const next = [...selected]
  let capped = false
  for (const row of rows) {
    if (chosen.has(row.id)) continue
    if (next.length >= BULK_SELECTION_CAP) {
      capped = true
      break
    }
    next.push(row)
    chosen.add(row.id)
  }
  return { next, capped }
}

/** How the header checkbox of a page reads. */
export function pageSelectionState(
  selected: readonly BulkTarget[],
  rows: readonly BulkTarget[],
): 'none' | 'some' | 'all' {
  const chosen = new Set(selected.map((item) => item.id))
  const count = rows.filter((row) => chosen.has(row.id)).length
  if (count === 0) return 'none'
  return count === rows.length ? 'all' : 'some'
}

interface StoredSelection {
  owner: string
  targets: BulkTarget[]
}

function storageKey(type: string): string {
  return `pickle.bulk-selection.${type}`
}

function readStored(type: string, owner: string): BulkTarget[] {
  try {
    const raw = sessionStorage.getItem(storageKey(type))
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredSelection
    return parsed.owner === owner && Array.isArray(parsed.targets) ? parsed.targets : []
  } catch {
    return []
  }
}

function writeStored(type: string, owner: string, targets: readonly BulkTarget[]): void {
  try {
    if (targets.length === 0) sessionStorage.removeItem(storageKey(type))
    else sessionStorage.setItem(storageKey(type), JSON.stringify({ owner, targets }))
  } catch {
    // The selection still works for this page's lifetime.
  }
}

/** Forgets a list's selection, as the bulk page does once a change is applied. */
export function clearStoredSelection(type: string): void {
  try {
    sessionStorage.removeItem(storageKey(type))
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/**
 * A list page's row selection. It outlives paging and filtering, and is kept
 * in session storage so that stepping back from the bulk page finds it again.
 * `owner` names whose selection it is (account and organisation scope); a
 * different owner starts empty, so a scope switch never carries targets from
 * another organisation into a request.
 */
export function useBulkSelection(type: string, owner: string) {
  const [state, setState] = useState(() => ({
    owner,
    targets: readStored(type, owner),
    capped: false,
  }))
  const current = state.owner === owner ? state : { owner, targets: [], capped: false }

  useEffect(() => {
    if (state.owner !== owner) setState({ owner, targets: readStored(type, owner), capped: false })
  }, [owner, state.owner, type])

  const apply = useCallback(
    (update: (targets: BulkTarget[]) => SelectionUpdate) => {
      setState((previous) => {
        const base = previous.owner === owner ? previous.targets : []
        const { next, capped } = update(base)
        writeStored(type, owner, next)
        return { owner, targets: next, capped }
      })
    },
    [owner, type],
  )

  return {
    selected: current.targets,
    capped: current.capped,
    toggle: (target: BulkTarget, on: boolean) =>
      apply((targets) => toggleTarget(targets, target, on)),
    togglePage: (rows: readonly BulkTarget[], on: boolean) =>
      apply((targets) => togglePage(targets, rows, on)),
    clear: () => apply(() => ({ next: [], capped: false })),
  }
}
