import type { AccessConfirmation, ActorAccessImpact } from '../../api/resource-access'
import { Alert, Button, FormField, Modal, Textarea } from '../ui'
import { RESOURCE_ROLE_LABELS, WORKSPACE_ROLE_LABELS } from '../../lib/labels'
import { resourceTypeEntry } from './registry'

function roleLabel(role: string | null | undefined, membership = false): string {
  if (!role) return '없음'
  return ((membership ? WORKSPACE_ROLE_LABELS : RESOURCE_ROLE_LABELS) as Record<string, string>)[role] ?? role
}

export function AccessIncreaseDetails({ impact }: { impact: ActorAccessImpact }) {
  return <div className="space-y-3 text-sm">
    {impact.increases.length > 0 && <div>
      <p className="font-medium">회원님이 얻게 되는 권한</p>
      <ul className="mt-2 space-y-2">{impact.increases.map((item) => <li key={`${item.resourceType ?? 'WORKSPACE'}:${item.targetId}`} className="rounded border border-neutral-200 p-3">
        <p>{item.resourceType ? resourceTypeEntry(item.resourceType).label : '워크스페이스 구성원'}: <code className="break-all">{item.targetId}</code></p>
        <p>워크스페이스: <code className="break-all">{item.workspaceId}</code></p>
        <p>{roleLabel(item.beforeRole, item.resourceType == null)} → {roleLabel(item.afterRole, item.resourceType == null)}</p>
      </li>)}</ul>
    </div>}
    {impact.pendingResourceOwners.length > 0 && <div>
      <p className="font-medium">생성 대기 중인 자원의 예상 권한</p>
      <ul className="mt-2 space-y-2">{impact.pendingResourceOwners.map((item) => <li key={item.requestId} className="rounded border border-neutral-200 p-3">
        <p>{resourceTypeEntry(item.resourceType).label} 신청: <code className="break-all">{item.requestId}</code></p>
        <p>워크스페이스: <code className="break-all">{item.workspaceId}</code></p>
        <p>생성 대기 · 생성되면 {roleLabel(item.role)}</p>
      </li>)}</ul>
      <p className="mt-2 text-foreground-muted">아직 자원이 생성되거나 현재 접근 권한을 얻은 결과는 아닙니다.</p>
    </div>}
  </div>
}

export function AccessIncreaseReviewModal({ review, purpose, setPurpose, finish }: {
  review: { impact: ActorAccessImpact; target: string } | null
  purpose: string
  setPurpose: (value: string) => void
  finish: (value: AccessConfirmation | null) => void
}) {
  return <Modal open={review !== null} onClose={() => finish(null)} title="회원님의 권한 증가 확인" footer={<>
    <Button variant="secondary" onClick={() => finish(null)}>취소</Button>
    <Button disabled={!purpose.trim()} onClick={() => { if (review) finish({ purpose: purpose.trim(), fingerprint: review.impact.fingerprint, confirmed: true }) }}>권한 증가 확인하고 계속</Button>
  </>}>
    {review && <div className="space-y-4">
      <p className="break-all text-sm font-medium">변경 대상: {review.target}</p>
      <Alert variant="warning">이 변경으로 회원님의 권한이 늘어납니다. 대상과 얻는 권한을 확인하고 목적을 기록해 주세요.</Alert>
      <AccessIncreaseDetails impact={review.impact} />
      <FormField label="권한을 얻는 목적" required><Textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={200} /></FormField>
    </div>}
  </Modal>
}
