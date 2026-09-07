import type { LlmKeyDetail } from '../../api/queries'
import { Card, CardContent, CardHeader, CardTitle } from '../ui'
import type { LlmApiKeyStatus } from '../../lib/status'
import { LlmKeyIssueAction } from './LlmKeyIssueAction'
import { RevokeKeyAction } from './RevokeKeyCard'

/**
 * The settings tab's last card: the two actions that cannot be undone,
 * re-issue above revoke. Re-issue only has a meaning for an active key;
 * revoke stays for every state the tab is shown in.
 */
export function LlmKeyDangerCard({
  llmKey,
  status,
}: {
  llmKey: LlmKeyDetail
  status: LlmApiKeyStatus
}) {
  return (
    <Card className="border-danger-200">
      <CardHeader>
        <CardTitle className="text-danger-700">되돌릴 수 없는 작업</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-stroke-subtle">
        {status === 'ACTIVE' && (
          <div className="pb-4">
            <LlmKeyIssueAction llmKey={llmKey} status={status} placement="row" />
          </div>
        )}
        <div className={status === 'ACTIVE' ? 'pt-4' : undefined}>
          <RevokeKeyAction
            keyId={llmKey.id}
            name={llmKey.name}
            allowed={llmKey.accessManageAllowed}
          />
        </div>
      </CardContent>
    </Card>
  )
}
