import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchOrgOperations, previewRequestMail, saveRequestMail, type OrgOperations, type OrgOperationsPreview, type SaveRequestMail, type RequestMailTarget } from '../../api/org-operations'
import { toApiError } from '../../api/problem'
import { useInstitutionPermissions } from '../../auth/use-institution-permissions'
import { SYS_ADMIN } from '../../auth/institution-authority'
import { orgRecipientReason, requestMailTargetLabel } from '../../lib/org-operations'
import { useActiveResult } from '../../lib/use-active-result'
import { Alert, Button, Checkbox, FormField, Modal, Select, Textarea } from '../ui'
import { useDialogResultFocus } from '../../lib/use-dialog-result-focus'
import { RequestMailTargetPicker } from './RequestMailTargetPicker'

export function RequestMailEditor({ initial, onClose, onSaved }: { initial: OrgOperations; onClose: () => void; onSaved: (value: OrgOperations) => Promise<void> }) {
  const permissions = useInstitutionPermissions()
  const active = useActiveResult()
  const [initialFingerprint] = useState(permissions.fingerprint)
  const [baseline, setBaseline] = useState(initial)
  const [mode, setMode] = useState<'' | 'ALL_APPROVERS' | 'DESIGNATED'>(initial.mailMode ?? '')
  const [recipients, setRecipients] = useState(initial.members.filter((member) => member.requestMail === true).map((member) => member.userId))
  const [reason, setReason] = useState('')
  const [retained, setRetained] = useState<string[] | null>(null)
  const [preview, setPreview] = useState<OrgOperationsPreview | null>(null)
  const [reviewed, setReviewed] = useState<SaveRequestMail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [target, setTarget] = useState<RequestMailTarget | null>(initial.selectionContext ?? null)
  const blocked = initialFingerprint !== permissions.fingerprint || !permissions.canWork('institution.request-mail.configure', { orgId: initial.org.id }, SYS_ADMIN)
  const eligibility = useQuery({ queryKey: ['admin', 'org-mail-eligibility', initial.org.id, permissions.fingerprint, baseline.revision, target],
    queryFn: () => fetchOrgOperations(initial.org.id, undefined, target), enabled: !blocked,
    initialData: baseline.requesterId == null && JSON.stringify(baseline.selectionContext ?? null) === JSON.stringify(target) ? baseline : undefined })
  const revisionChanged = eligibility.data != null && eligibility.data.revision !== baseline.revision
  const clearReview = () => { setPreview(null); setReviewed(null); setError(null) }
  const handleError = (value: unknown) => {
    if (!active.current) return
    const problem = toApiError(value, '신청 메일 수신 설정을 확인하지 못했어요.')
    setError(problem.message)
    if (problem.problem?.status === 409) { setConflict(true); setPreview(null); setReviewed(null) }
  }
  const review = useMutation({ mutationFn: (input: { body: SaveRequestMail; target: RequestMailTarget | null }) => previewRequestMail(initial.org.id, input.body, input.target), onSuccess: (value, input) => { if (active.current) { setPreview(value); setReviewed(input.body); setError(null) } }, onError: handleError })
  const save = useMutation({ mutationFn: (body: SaveRequestMail) => saveRequestMail(initial.org.id, body), onSuccess: onSaved, onError: handleError })
  const reload = useMutation({ mutationFn: () => fetchOrgOperations(initial.org.id), onSuccess: (value) => {
    if (!active.current) return
    setRetained([...recipients]); setBaseline(value); setRecipients(value.members.filter((member) => member.requestMail === true).map((member) => member.userId)); setMode(value.mailMode ?? ''); setConflict(false); clearReview()
  }, onError: handleError })
  const busy = review.isPending || save.isPending || reload.isPending
  const { contentRef, resultHeadingRef, errorRef, actionRef } = useDialogResultFocus(busy)
  const requiresFresh = baseline.requesterId != null
  return <Modal open title="신청 메일 수신 설정" className="max-w-2xl" dismissible={!busy} onClose={onClose}>
    <div ref={contentRef} className="min-w-0 space-y-5">
      <p className="text-sm">{initial.org.name}</p>
      {blocked && <Alert variant="danger">권한이 없거나 바뀌어 저장할 수 없어요. 창을 닫고 다시 열어 주세요.</Alert>}
      {error && <div ref={errorRef} tabIndex={-1}><Alert variant="danger">{error}</Alert></div>}
      {(conflict || requiresFresh || revisionChanged) && <Alert variant="warning">최신 수신 설정을 불러와 다시 검토해 주세요.<Button variant="secondary" disabled={busy || blocked} onClick={() => reload.mutate()}>최신 수신 설정 다시 조회</Button></Alert>}
      {retained && <details><summary>이전에 선택한 수신자 (비교용)</summary><p className="break-all text-sm">{retained.map((id) => initial.members.find((member) => member.userId === id)?.name ?? id).join(', ') || '지정 없음'}</p></details>}
      <FormField label="신청 이메일 수신 방식"><Select disabled={busy || blocked} value={mode} onChange={(event) => { clearReview(); setMode(event.target.value as 'ALL_APPROVERS' | 'DESIGNATED') }}><option value="" disabled>수신 방식 선택</option><option value="ALL_APPROVERS">실제 신청 결정 담당자 전체</option><option value="DESIGNATED">지정한 수신자만 (0명 허용)</option></Select></FormField>
      <RequestMailTargetPicker options={baseline.selectionTargets} target={target} disabled={busy || blocked} onChange={(value) => { clearReview(); setTarget(value) }} />
      <p className="break-all text-sm">표시 결과 기준: {requestMailTargetLabel(eligibility.data?.selectionContext ?? target)}</p>
      {eligibility.isFetching && <p role="status" className="text-sm">대상별 수신 자격 조회 중</p>}
      {eligibility.isError && <Alert variant="danger">{eligibility.error.message}<Button variant="secondary" onClick={() => void eligibility.refetch()}>대상 수신 자격 다시 조회</Button></Alert>}
      <p className="text-xs">대상을 바꿔도 지정한 수신자는 유지돼요. 체크한 값은 기관 전체의 설정이에요.</p>
      <div className="space-y-2">{eligibility.data?.members.map((member) => <Checkbox key={member.userId} label={`${member.name} 메일 수신자 지정`}
        aria-label={`${member.name} 메일 수신자 지정`}
        description={member.inAppRecipient === true ? '현재 범위에서 신청 결정 가능' : orgRecipientReason(member.exclusionReason)}
        checked={recipients.includes(member.userId)} disabled={busy || blocked || revisionChanged || mode !== 'DESIGNATED' || member.inAppRecipient !== true && !recipients.includes(member.userId)}
        onChange={(event) => { clearReview(); setRecipients((rows) => event.target.checked ? [...rows, member.userId] : rows.filter((id) => id !== member.userId)) }} />)}</div>
      <p className="text-xs">"지정한 수신자만" 방식에서 0명으로 저장하면 메일을 보내지 않아요. 새로 접수하는 신청부터 적용돼요.</p>
      <FormField label="수신 설정 변경 사유"><Textarea value={reason} disabled={busy || blocked} maxLength={2000} onChange={(event) => { clearReview(); setReason(event.target.value) }} /></FormField>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>취소</Button><Button ref={actionRef} variant="secondary" loading={review.isPending} disabled={busy || blocked || conflict || requiresFresh || revisionChanged || !eligibility.data || eligibility.isError || !mode} onClick={() => mode && review.mutate({ body: { expectedRevision: baseline.revision, mailMode: mode, recipientIds: [...new Set(recipients)], reason: reason.trim() || null }, target })}>수신 변경안 미리보기</Button></div>
      {preview && <section className="space-y-3 rounded-md border p-4"><h3 ref={resultHeadingRef} tabIndex={-1} className="font-semibold">저장 전 수신 설정 확인</h3><p className="text-sm">현재 이메일 수신자 {preview.before.currentMailRecipientCount ?? '조회 불가'}명 → {preview.after.currentMailRecipientCount ?? '조회 불가'}명</p>
        <p className="break-all text-sm">미리보기 대상: {requestMailTargetLabel(preview.after.selectionContext)}</p>
        {preview.warnings.map((warning) => <Alert key={warning} variant="warning">{warning}</Alert>)}
        {preview.after.members.map((member) => <p className="text-sm" key={member.userId}>{member.name}: {member.currentMailRecipient === true ? '수신 가능' : '제외'} · {orgRecipientReason(member.currentMailRecipient ? member.selectionReason : member.exclusionReason)}</p>)}
        <Button loading={save.isPending} disabled={busy || blocked || conflict || revisionChanged || !reviewed} onClick={() => reviewed && save.mutate(reviewed)}>검토한 수신 설정 저장</Button>
      </section>}
    </div>
  </Modal>
}
