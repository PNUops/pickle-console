import { setupServer } from 'msw/node'
import type { RequestHandler } from 'msw'
import { authHandlers } from './handlers/auth'
import { groupHandlers, resetGroupFixtures } from './handlers/groups'
import { referenceHandlers } from './handlers/reference'
import { resetVmRequestFixtures, vmRequestHandlers } from './handlers/vm-requests'
import { resetVmFixtures, vmHandlers } from './handlers/vms'

/** Add per-WP API mock handlers here (or compose them from feature modules). */
export const handlers: RequestHandler[] = [
  ...authHandlers,
  ...referenceHandlers,
  ...groupHandlers,
  ...vmRequestHandlers,
  ...vmHandlers,
]

export const server = setupServer(...handlers)

/** Restore all stateful mock fixtures to their initial data (run between tests). */
export function resetFixtures() {
  resetGroupFixtures()
  resetVmRequestFixtures()
  resetVmFixtures()
}
