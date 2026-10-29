import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { cancelRequestRecipient, fetchRecipientCancellationImpact, type RecipientCancellationImpact, type RecipientCancellationReceipt } from '../../api/request-recipient-cancellation'
import { toApiError } from '../../api/problem'
import type { RequestDetail, RequestRecipient } from '../../api/queries'
import { useActiveResult } from '../../lib/use-active-result'
import { formatDateTime } from '../../lib/format'
import { requestRecipientStatusLabel } from '../../lib/request-recipient-status'
import { resourceTypeEntry } from '../resource/registry'
import { Alert, Button, Checkbox, FormField, Modal, Spinner, Textarea } from '../ui'

export function RecipientCancellationResult({ receipt }: { receipt: RecipientCancellationReceipt }) {
  return <div className="space-y-1 text-sm [overflow-wrap:anywhere]" role="status">
    <p className="font-semibold">생성 대기 취소 완료</p>
    <p>취소 시각: {formatDateTime(receipt.canceledAt)}</p>
    <p>취소 사유: {receipt.reason}</p>
    <p>취소 전 상태: {requestRecipientStatusLabel('APPROVED', receipt.previousStatus, true)}</p>
    <p>이전 생성 시도: {receipt.previousAttempts}회</p>
    {receipt.previousReason && <p>이전 생성 실패·제외 사유: {receipt.previousReason}</p>}
    <p>결과 ID: <code>{receipt.id}</code></p>
  </div>
}

export function RecipientCancellationDialog({ request, recipient, support, resourceHref, onClose, onStored, onReadback }: {
  request: RequestDetail
  recipient: RequestRecipient
  support: boolean
  resourceHref: string | null
  onClose: () => void
  onStored: (receipt: RecipientCancellationReceipt) => void
  onReadback: () => Promise<RequestDetail>
}) {
  const active = useActiveResult()
  const started = useRef(false)
  const busy = useRef(false)
  const submitting = useRef(false)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [impact, setImpact] = useState<RecipientCancellationImpact | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState(false)
  const [receipt, setReceipt] = useState<RecipientCancellationReceipt | null>(null)
  const matches = (value: { requestId: string; workspaceId: string; recipientId: string }) => value.requestId === request.id && value.workspaceId === request.workspaceId && value.recipientId === recipient.id
  const load = async () => {
    if (busy.current || !active.current) return
    busy.current = true
    setLoading(true)
    setError(null)
    setImpact(null)
    try {
      const next = await fetchRecipientCancellationImpact(request.id, recipient.id, support)
      if (!active.current) return
      if (!matches(next) || next.type !== request.type) throw new Error('요청한 대상과 취소 영향이 일치하지 않습니다. 다시 조회해 주세요.')
      if (!next.allowed || next.fingerprint !== impact?.fingerprint) setConfirmed(null)
      setImpact(next)
    } catch (failure) {
      if (active.current) { setConfirmed(null); setError(failure instanceof Error ? failure.message : '생성 대기 취소 영향을 확인하지 못했습니다.') }
    } finally {
      if (active.current) { busy.current = false; setLoading(false) }
    }
  }
  useEffect(() => { if (!started.current) { started.current = true; void load() } })
  const readResult = async () => {
    if (busy.current || !active.current) return
    busy.current = true
    setLoading(true)
    setError(null)
    setConfirmed(null)
    try {
      const current = await onReadback()
      if (!active.current) return
      const target = current.recipients.find((row) => row.id === recipient.id)
      if (current.id !== request.id || current.workspaceId !== request.workspaceId || !target) throw new Error('선택한 대상의 현재 결과를 확인하지 못했습니다.')
      if (target.cancellation && matches(target.cancellation)) {
        setReceipt(target.cancellation)
        setUnknown(false)
        onStored(target.cancellation)
      } else {
        setUnknown(false)
        setImpact(null)
        setError(`현재 대상자 상태는 ${requestRecipientStatusLabel(current.status, target.status, true)}이며 저장된 개별 취소 결과가 없습니다. 다시 취소하려면 현재 영향을 새로 조회하고 확인해 주세요.`)
      }
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : '현재 결과를 조회하지 못했습니다.')
    } finally {
      if (active.current) { busy.current = false; setLoading(false) }
    }
  }
  const submit = async () => {
    if (!active.current || busy.current || unknown || receipt || !impact?.allowed || confirmed !== impact.fingerprint || !reason.trim() || reason.length > 500) return
    busy.current = true
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      const result = await cancelRequestRecipient(request.id, recipient.id, support, { reason, confirmation: { fingerprint: impact.fingerprint, confirmed: true } })
      if (!active.current) return
      if (!matches(result)) throw new Error('선택한 대상과 취소 결과가 일치하지 않습니다.')
      setReceipt(result)
      setConfirmed(null)
      onStored(result)
    } catch (failure) {
      if (!active.current) return
      const problem = toApiError(failure, '취소 결과를 확인하지 못했습니다.')
      setConfirmed(null)
      if (!problem.problem || problem.problem.status >= 500) {
        setUnknown(true)
        setError('처리 결과를 확인하지 못했습니다. 완료나 실패를 단정할 수 없습니다. 현재 결과를 조회해 주세요.')
      } else {
        setError(problem.message)
        if (problem.problem.status === 409) {
          busy.current = false
          await load()
          if (active.current) setError(problem.message)
          void onReadback().catch(() => {})
        }
      }
    } finally {
      if (active.current) { busy.current = false; submitting.current = false; setPending(false) }
    }
  }
  const close = () => { if (!submitting.current) onClose() }
  const canSubmit = !!impact?.allowed && confirmed === impact.fingerprint && !!reason.trim() && reason.length <= 500 && !loading && !unknown && !receipt
  return <Modal open title="대상자 생성 대기 취소" onClose={close} className="max-w-2xl" footer={<>
    <Button variant="secondary" onClick={close}>닫기</Button>
    {!receipt && <Button variant="danger" loading={pending} disabled={!canSubmit} onClick={() => void submit()}>생성 대기 취소</Button>}
  </>}>
    <div className="space-y-4 [overflow-wrap:anywhere]">
      <dl className="space-y-1 text-sm">
        <div><dt className="text-foreground-muted">선택한 대상자</dt><dd>{recipient.name ?? recipient.invitee ?? '이름 정보 없음'} · <code>{recipient.id}</code></dd></div>
        <div><dt className="text-foreground-muted">워크스페이스</dt><dd>{request.workspaceName} · <code>{request.workspaceId}</code></dd></div>
        <div><dt className="text-foreground-muted">신청</dt><dd>{request.displayName} · <code>{request.id}</code></dd></div>
        <div><dt className="text-foreground-muted">종류</dt><dd>{resourceTypeEntry(request.type).label}</dd></div>
        <div><dt className="text-foreground-muted">수행 자격</dt><dd>{support ? '워크스페이스 지원 쓰기 권한' : '현재 워크스페이스 소유자 자격'}</dd></div>
      </dl>
      <Alert variant="info">선택한 한 사람의 생성 대기만 취소합니다. 신청의 승인 결정과 승인값, 다른 대상자, 구성원과 초대는 유지됩니다. 등록된 리소스의 삭제나 회수, 외부 적용 취소는 실행하지 않습니다.</Alert>
      {loading && <Spinner label="현재 대상자 결과 확인 중" />}
      {error && <Alert variant="danger">{error}</Alert>}
      {receipt ? <RecipientCancellationResult receipt={receipt} /> : <>
        <Button variant="secondary" disabled={loading || pending} onClick={() => void readResult()}>현재 결과 조회</Button>
        {!unknown && !loading && !impact && <Button variant="secondary" onClick={() => void load()}>현재 취소 영향 조회</Button>}
        {impact && <>
          <p className="text-sm">현재 상태: {requestRecipientStatusLabel(request.status, impact.previousStatus, true)} · 조회 {formatDateTime(impact.observedAt)}</p>
          <p className="text-sm">이전 생성 시도: {impact.previousAttempts}회</p>
          {impact.previousReason && <p className="text-sm">이전 생성 실패·제외 사유: {impact.previousReason}</p>}
          {impact.previousStatus === 'FAILED' && <Alert variant="warning">생성 실패의 재시도를 포기합니다. 실패는 진행 중인 생성 대기와 다르며 이전 실패 사유와 시도 이력은 유지됩니다.</Alert>}
          {!impact.allowed && <Alert variant="warning">{impact.blockedReason ?? '현재 조건에서는 생성 대기를 취소할 수 없습니다.'}</Alert>}
          {!impact.allowed && <p className="text-sm">이미 등록된 VM과 발급 전 LLM API 키는 등록 자원입니다. {resourceHref ? <Link className="text-primary-700 underline" to={resourceHref}>기존 리소스 상세</Link> : '현재 권한에서 열 수 있는 기존 리소스 상세'}에서 허용된 삭제·폐기 경로를 확인해 주세요. 연결이 불명확하면 운영자에게 확인해 주세요.</p>}
          <FormField label="취소 사유" required><Textarea value={reason} maxLength={500} disabled={pending || unknown} onChange={(event) => { setReason(event.target.value); setConfirmed(null) }} rows={3} /></FormField>
          <Checkbox label="선택한 대상과 현재 상태, 생성 대기 취소 효과를 확인했습니다" checked={confirmed === impact.fingerprint}
            disabled={!impact.allowed || pending || loading || unknown} onChange={(event) => setConfirmed(event.target.checked ? impact.fingerprint : null)} />
          <Button variant="secondary" disabled={pending || loading || unknown} onClick={() => void load()}>현재 취소 영향 새로 조회</Button>
        </>}
      </>}
    </div>
  </Modal>
}
