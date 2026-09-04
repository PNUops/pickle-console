/**
 * 목 핸들러 목록.
 *
 * `server.ts`(노드, 테스트)와 `dev/mock-browser.ts`(브라우저, 미리 보기)가 함께 쓴다.
 * 따로 둔 이유는 `msw/node`가 브라우저에서 로드되면 터지기 때문이다. 목록이 두 벌이
 * 되면 미리 보기가 테스트와 다른 것을 보여 주므로 목록은 한 곳에만 둔다.
 */
import type { RequestHandler } from 'msw'
import { accountHandlers } from './handlers/account'
import { adminHandlers } from './handlers/admin'
import { adminOpsHandlers } from './handlers/admin-ops'
import { announcementHandlers } from './handlers/announcements'
import { auditHandlers } from './handlers/audit'
import { authHandlers } from './handlers/auth'
import { campusIpHandlers } from './handlers/campusip'
import { consentHandlers } from './handlers/consent'
import { googleOauthHandlers } from './handlers/google-oauth'
import { profileOptionsHandlers } from './handlers/profile-options'
import { mfaHandlers } from './handlers/mfa'
import { userHandlers } from './handlers/users'
import { workspaceHandlers } from './handlers/workspaces'
import { llmKeyHandlers } from './handlers/llm-keys'
import { llmObservabilityHandlers } from './handlers/llm-observability'
import { llmAdminUsageHandlers } from './handlers/llm-admin-usage'
import { openRouterAccountHandlers } from './handlers/openrouter-accounts'
import { metricsHandlers } from './handlers/metrics'
import { networkHandlers } from './handlers/network'
import { resourceHandlers } from './handlers/resources'
import { noticeHandlers } from './handlers/notices'
import { notificationHandlers } from './handlers/notifications'
import { publishingHandlers } from './handlers/publishing'
import { referenceHandlers } from './handlers/reference'
import { settingHandlers } from './handlers/settings'
import { requestHandlers } from './handlers/requests'
import { vmHandlers } from './handlers/vms'
import { terminalHandlers } from './handlers/terminal'
import { vmSshKeyHandlers } from './handlers/vm-ssh-key'

/** Add feature API mock handlers here (or compose them from feature modules). */
export const handlers: RequestHandler[] = [
  ...authHandlers,
  ...accountHandlers,
  ...mfaHandlers,
  ...consentHandlers,
  ...profileOptionsHandlers,
  ...googleOauthHandlers,
  ...userHandlers,
  ...referenceHandlers,
  ...workspaceHandlers,
  ...requestHandlers,
  ...vmHandlers,
  ...llmKeyHandlers,
  ...openRouterAccountHandlers,
  ...llmObservabilityHandlers,
  ...llmAdminUsageHandlers,
  ...resourceHandlers,
  ...terminalHandlers,
  ...vmSshKeyHandlers,
  ...publishingHandlers,
  ...networkHandlers,
  ...campusIpHandlers,
  ...adminHandlers,
  ...adminOpsHandlers,
  ...metricsHandlers,
  ...auditHandlers,
  ...settingHandlers,
  ...notificationHandlers,
  ...noticeHandlers,
  ...announcementHandlers,
]

