const REMEMBERED_SCOPE_KEY = 'pickle.console-scope'

/** The scope to return to from an unscoped entry point. */
export function rememberedScope(): number | null {
  const raw = window.localStorage.getItem(REMEMBERED_SCOPE_KEY)
  if (raw == null) return null
  const asNumber = Number(raw)
  return Number.isFinite(asNumber) ? asNumber : null
}

export function rememberScope(scope: number | null) {
  if (scope == null) {
    window.localStorage.removeItem(REMEMBERED_SCOPE_KEY)
  } else {
    window.localStorage.setItem(REMEMBERED_SCOPE_KEY, String(scope))
  }
}
