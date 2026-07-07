import type { Problem } from '../api/problem'

/**
 * Flattens a 422 Problem's `errors[]` into a field → message map
 * (first message per field wins) for form field binding.
 */
export function fieldErrorsOf(problem: Problem | null | undefined): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of problem?.errors ?? []) {
    map[entry.field] ??= entry.message
  }
  return map
}
