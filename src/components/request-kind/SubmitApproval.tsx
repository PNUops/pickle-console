import { useLayoutEffect, type RefObject } from 'react'
import type { ApproveRequest, RequestDetail } from '../../api/queries'
import { Button, Modal } from '../ui'
import { requestKindView } from './index'
import type { DecisionFormApi, RequestKindView } from './types'

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
}: {
  request: RequestDetail
  errors: Record<string, string>
  handle: RefObject<DecisionFormApi | null>
  confirmOpen: boolean
  onCloseConfirm: () => void
  onConfirm: (approval: ApproveRequest) => void
  pending: boolean
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
}) {
  const form = view.useApproveForm(request, value)
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
      {form.fields(errors)}
      <Modal
        open={confirmOpen}
        onClose={onCloseConfirm}
        title="신청 승인"
        footer={
          <>
            <Button variant="secondary" onClick={onCloseConfirm}>
              돌아가기
            </Button>
            <Button
              loading={pending}
              disabled={form.confirmReady === false}
              onClick={() => onConfirm(form.body())}
            >
              제출하고 승인
            </Button>
          </>
        }
      >
        {form.confirmBody}
      </Modal>
    </section>
  )
}
