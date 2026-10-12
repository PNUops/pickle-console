import { useLayoutEffect, type RefObject } from 'react'
import type { ApproveRequest, RequestDetail } from '../../api/queries'
import { Alert, Button, Modal } from '../ui'
import { requestKindView } from './index'
import type { DecisionFormApi, RequestKindView } from './types'
import { ApprovalConfirmation } from './ApprovalConfirmation'
import type { ApprovalTargetFacts } from './approval-confirmation'
import { useConfirmedApproval } from './use-confirmed-approval'

/**
 * The approval half of a request an approver submits already approved.
 *
 * It is the same per-kind form the approval screen shows, prefilled the same
 * way from a request that exists only on this screen. The wizard owns the
 * submit button, so the form hands its validator up through `handle`; the
 * confirmation reads the body at the moment it is confirmed.
 */
export function SubmitApproval({
  request,
  errors,
  handle,
  confirmOpen,
  onCloseConfirm,
  onConfirm,
  pending,
  targetFacts,
  targetFactsKnown,
  workspaceReadable,
}: {
  request: RequestDetail
  errors: Record<string, string>
  handle: RefObject<DecisionFormApi | null>
  confirmOpen: boolean
  onCloseConfirm: () => void
  onConfirm: (approval: ApproveRequest) => void
  pending: boolean
  targetFacts?: ApprovalTargetFacts[]
  targetFactsKnown?: boolean
  workspaceReadable?: boolean
}) {
  const view = requestKindView(request.type)
  const decision = view.useDecisionData(request)
  if (decision.status === 'blocked') return decision.gate
  return (
    <SubmitApprovalForm
      request={request}
      view={view}
      value={decision.value}
      errors={errors}
      handle={handle}
      confirmOpen={confirmOpen}
      onCloseConfirm={onCloseConfirm}
      onConfirm={onConfirm}
      pending={pending}
      targetFacts={targetFacts}
      targetFactsKnown={targetFactsKnown}
      workspaceReadable={workspaceReadable}
    />
  )
}

function SubmitApprovalForm({
  request,
  view,
  value,
  errors,
  handle,
  confirmOpen,
  onCloseConfirm,
  onConfirm,
  pending,
  targetFacts,
  targetFactsKnown,
  workspaceReadable,
}: {
  request: RequestDetail
  view: RequestKindView
  value: unknown
  errors: Record<string, string>
  handle: RefObject<DecisionFormApi | null>
  confirmOpen: boolean
  onCloseConfirm: () => void
  onConfirm: (approval: ApproveRequest) => void
  pending: boolean
  targetFacts?: ApprovalTargetFacts[]
  targetFactsKnown?: boolean
  workspaceReadable?: boolean
}) {
  const form = view.useApproveForm(request, value)
  const confirmation = useConfirmedApproval(form, confirmOpen)
  useLayoutEffect(() => {
    handle.current = form
    return () => {
      handle.current = null
    }
  })

  return (
    <section aria-labelledby="review-approval" className="space-y-4">
      <h2 id="review-approval" className="text-sm font-semibold text-foreground-primary">
        승인 내용
      </h2>
      <fieldset disabled={pending} className="space-y-4">{form.fields(errors)}</fieldset>
      <Modal
        open={confirmOpen}
        onClose={() => { if (!pending) onCloseConfirm() }}
        title="신청 승인"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={onCloseConfirm}>
              돌아가기
            </Button>
            <Button
              loading={pending}
              disabled={form.confirmReady === false}
              onClick={() => { const approved = confirmation.confirmedBody(); if (approved) onConfirm(approved) }}
            >
              제출하고 승인
            </Button>
          </>
        }
      >
        {confirmation.changed && <Alert variant="warning">승인 내용이 갱신되었습니다. 변경된 내용을 확인한 뒤 확정해 주세요.</Alert>}
        {confirmOpen && confirmation.displayed && <ApprovalConfirmation request={request} approval={confirmation.displayed} comparisons={form.comparisons} targetFacts={targetFacts} targetFactsKnown={targetFactsKnown} workspaceReadable={workspaceReadable} nodeName={form.nodeName}>
          {form.confirmBody}
        </ApprovalConfirmation>}
      </Modal>
    </section>
  )
}
