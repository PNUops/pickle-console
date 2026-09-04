import { setupServer } from 'msw/node'
import { handlers } from './handlers'
import { resetAdminFixtures } from './handlers/admin'
import { resetAdminOpsFixtures } from './handlers/admin-ops'
import { resetAnnouncementFixtures } from './handlers/announcements'
import { resetAuditFixtures } from './handlers/audit'
import { resetCampusIpFixtures } from './handlers/campusip'
import { resetUserFixtures } from './handlers/users'
import { resetWorkspaceFixtures } from './handlers/workspaces'
import { resetLlmKeyFixtures } from './handlers/llm-keys'
import { resetAdminLlmUsageFixtures } from './handlers/llm-admin-usage'
import { resetOpenRouterAccountFixtures } from './handlers/openrouter-accounts'
import { resetNetworkFixtures } from './handlers/network'
import { resetNoticeFixtures } from './handlers/notices'
import { resetNotificationFixtures } from './handlers/notifications'
import { resetPublishingFixtures } from './handlers/publishing'
import { resetReferenceFixtures } from './handlers/reference'
import { resetSettingFixtures } from './handlers/settings'
import { resetRequestFixtures } from './handlers/requests'
import { resetVmFixtures } from './handlers/vms'
import { resetTerminalFixtures } from './handlers/terminal'
import { resetVmSshKeyFixtures } from './handlers/vm-ssh-key'

export { handlers }

export const server = setupServer(...handlers)

/** Restore all stateful mock fixtures to their initial data (run between tests). */
export function resetFixtures() {
  resetUserFixtures()
  resetReferenceFixtures()
  resetWorkspaceFixtures()
  resetRequestFixtures()
  resetVmFixtures()
  resetLlmKeyFixtures()
  resetOpenRouterAccountFixtures()
  resetAdminLlmUsageFixtures()
  resetTerminalFixtures()
  resetVmSshKeyFixtures()
  resetPublishingFixtures()
  resetNetworkFixtures()
  resetCampusIpFixtures()
  resetAdminFixtures()
  resetAdminOpsFixtures()
  resetAuditFixtures()
  resetSettingFixtures()
  resetNotificationFixtures()
  resetNoticeFixtures()
  resetAnnouncementFixtures()
}
