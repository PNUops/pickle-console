import { setupServer } from 'msw/node'
import type { RequestHandler } from 'msw'
import { adminHandlers, resetAdminFixtures } from './handlers/admin'
import { adminOpsHandlers, resetAdminOpsFixtures } from './handlers/admin-ops'
import { auditHandlers, resetAuditFixtures } from './handlers/audit'
import { authHandlers } from './handlers/auth'
import { groupHandlers, resetGroupFixtures } from './handlers/groups'
import { notificationHandlers, resetNotificationFixtures } from './handlers/notifications'
import { publishingHandlers, resetPublishingFixtures } from './handlers/publishing'
import { referenceHandlers, resetReferenceFixtures } from './handlers/reference'
import { resetSettingFixtures, settingHandlers } from './handlers/settings'
import { resetVmRequestFixtures, vmRequestHandlers } from './handlers/vm-requests'
import { resetVmFixtures, vmHandlers } from './handlers/vms'

/** Add per-WP API mock handlers here (or compose them from feature modules). */
export const handlers: RequestHandler[] = [
  ...authHandlers,
  ...referenceHandlers,
  ...groupHandlers,
  ...vmRequestHandlers,
  ...vmHandlers,
  ...publishingHandlers,
  ...adminHandlers,
  ...adminOpsHandlers,
  ...auditHandlers,
  ...settingHandlers,
  ...notificationHandlers,
]

export const server = setupServer(...handlers)

/** Restore all stateful mock fixtures to their initial data (run between tests). */
export function resetFixtures() {
  resetReferenceFixtures()
  resetGroupFixtures()
  resetVmRequestFixtures()
  resetVmFixtures()
  resetPublishingFixtures()
  resetAdminFixtures()
  resetAdminOpsFixtures()
  resetAuditFixtures()
  resetSettingFixtures()
  resetNotificationFixtures()
}
