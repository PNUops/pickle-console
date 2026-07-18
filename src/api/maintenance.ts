/**
 * Bridge for a 503 MAINTENANCE_MODE response seen mid-request: the API client
 * fires it, and the authenticated shell subscribes to immediately refetch the
 * system status (routing a non-admin to the maintenance screen without waiting
 * out the ~60 s poll). Mirrors the session-expired notifier in token.ts.
 */

type MaintenanceListener = () => void

let listener: MaintenanceListener | null = null

/** Registered by the shell; fired when a request returns 503 MAINTENANCE_MODE. */
export function onMaintenanceDetected(handler: MaintenanceListener): () => void {
  listener = handler
  return () => {
    if (listener === handler) listener = null
  }
}

export function notifyMaintenanceDetected(): void {
  listener?.()
}
