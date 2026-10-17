import type { components } from '../../api/schema'
import { uuid } from '../msw/ids'

export function emptyTerminationImpact(overrides: Partial<components['schemas']['WorkspaceTerminationImpactResponse']> = {}): components['schemas']['WorkspaceTerminationImpactResponse'] {
  return {
    action: 'DELETE_WORKSPACE', workspaceId: uuid(12), workspaceName: '캡스톤 3조', invitationId: null,
    observedAt: '2026-10-17T00:00:00Z', fingerprint: 'empty-exact-effects', executable: true, blockedReason: null,
    summary: { submittedRequests: 0, closingRecipients: 0, failedRecipients: 0, pendingJoinRecipients: 0, queuedRecipients: 0, approvedRecipients: 0, undecidedRecipients: 0 },
    recipientCounts: [], resourceBlockers: [],
    blockingResources: { page: 0, size: 20, totalElements: 0, totalPages: 0, content: [] },
    targets: { page: 0, size: 20, totalElements: 0, totalPages: 0, content: [] },
    ...overrides,
  }
}
