import { setupServer } from 'msw/node'
import type { RequestHandler } from 'msw'
import { accountHandlers } from './handlers/account'
import { adminHandlers, resetAdminFixtures } from './handlers/admin'
import { adminOpsHandlers, resetAdminOpsFixtures } from './handlers/admin-ops'
import { announcementHandlers, resetAnnouncementFixtures } from './handlers/announcements'
import { auditHandlers, resetAuditFixtures } from './handlers/audit'
import { authHandlers } from './handlers/auth'
import { campusIpHandlers, resetCampusIpFixtures } from './handlers/campusip'
import { consentHandlers } from './handlers/consent'
import { mfaHandlers } from './handlers/mfa'
import { resetUserFixtures, userHandlers } from './handlers/users'
import { workspaceHandlers, resetWorkspaceFixtures } from './handlers/workspaces'
import { metricsHandlers } from './handlers/metrics'
import { networkHandlers, resetNetworkFixtures } from './handlers/network'
import { resourceHandlers } from './handlers/resources'
import { notificationHandlers, resetNotificationFixtures } from './handlers/notifications'
import { publishingHandlers, resetPublishingFixtures } from './handlers/publishing'
import { referenceHandlers, resetReferenceFixtures } from './handlers/reference'
import { resetSettingFixtures, settingHandlers } from './handlers/settings'
import { resetSshKeyFixtures, sshKeyHandlers } from './handlers/ssh-keys'
import { resetRequestFixtures, requestHandlers } from './handlers/requests'
import { resetVmFixtures, vmHandlers } from './handlers/vms'
import { resetTerminalFixtures, terminalHandlers } from './handlers/terminal'

/** Add feature API mock handlers here (or compose them from feature modules). */
export const handlers: RequestHandler[] = [
  ...authHandlers,
  ...accountHandlers,
  ...mfaHandlers,
  ...consentHandlers,
  ...userHandlers,
  ...referenceHandlers,
  ...workspaceHandlers,
  ...requestHandlers,
  ...vmHandlers,
  ...resourceHandlers,
  ...terminalHandlers,
  ...sshKeyHandlers,
  ...publishingHandlers,
  ...networkHandlers,
  ...campusIpHandlers,
  ...adminHandlers,
  ...adminOpsHandlers,
  ...metricsHandlers,
  ...auditHandlers,
  ...settingHandlers,
  ...notificationHandlers,
  ...announcementHandlers,
]

export const server = setupServer(...handlers)

/** Restore all stateful mock fixtures to their initial data (run between tests). */
export function resetFixtures() {
  resetUserFixtures()
  resetReferenceFixtures()
  resetWorkspaceFixtures()
  resetRequestFixtures()
  resetVmFixtures()
  resetTerminalFixtures()
  resetSshKeyFixtures()
  resetPublishingFixtures()
  resetNetworkFixtures()
  resetCampusIpFixtures()
  resetAdminFixtures()
  resetAdminOpsFixtures()
  resetAuditFixtures()
  resetSettingFixtures()
  resetNotificationFixtures()
  resetAnnouncementFixtures()
}
