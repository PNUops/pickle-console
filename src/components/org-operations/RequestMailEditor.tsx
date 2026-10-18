import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchOrgOperations, previewRequestMail, saveRequestMail, type OrgOperations, type OrgOperationsPreview, type SaveRequestMail, type RequestMailTarget } from '../../api/org-operations'
import { toApiError } from '../../api/problem'
import { useInstitutionPermissions } from '../../auth/use-institution-permissions'
import { SYS_ADMIN } from '../../auth/institution-authority'
import { orgRecipientReason, requestMailTargetLabel } from '../../lib/org-operations'
import { useActiveResult } from '../../lib/use-active-result'
import { Alert, Button, Checkbox, FormField, Modal, Select, Textarea } from '../ui'
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
    const problem = toApiError(value, '신청 메일 수신 설정을 변경하지 못했습니다.')
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
  const requiresFresh = baseline.requesterId != null
  return <Modal open title="신청 메일 수신 설정" className="max-w-2xl" dismissible={!busy} onClose={onClose}>
    <div className="min-w-0 space-y-5">
      <p className="text-sm">{initial.org.name} · 설정 버전 {baseline.revision}. 이 저장은 기관 권한·업무·공간 범위를 변경하지 않습니다.</p>
      {blocked && <Alert variant="danger">편집 중 권한 문맥이 바뀌었거나 수신 설정 권한이 없어졌습니다. 초안은 확인할 수 있지만 저장할 수 없습니다. 닫고 최신 권한으로 다시 시작하세요.</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}
      {(conflict || requiresFresh || revisionChanged) && <Alert variant="warning">최신 수신 설정을 다시 불러오고 새 기준에서 검토하세요. 이전 변경안은 자동으로 덮어쓰지 않습니다.<Button variant="secondary" disabled={busy || blocked} onClick={() => reload.mutate()}>최신 수신 설정 다시 조회</Button></Alert>}
      {retained && <details><summary>이전에 선택한 수신자 (비교용)</summary><p className="break-all text-sm">{retained.map((id) => initial.members.find((member) => member.userId === id)?.name ?? id).join(', ') || '지정 없음'}</p></details>}
      <FormField label="신청 이메일 수신 방식"><Select disabled={busy || blocked} value={mode} onChange={(event) => { clearReview(); setMode(event.target.value as 'ALL_APPROVERS' | 'DESIGNATED') }}><option value="" disabled>새 수신 방식을 선택하세요</option><option value="ALL_APPROVERS">실제 신청 결정 담당자 전체</option><option value="DESIGNATED">지정한 수신자만 (0명 허용)</option></Select></FormField>
      <p className="text-sm">수신 가능 여부는 서버가 현재 신청 결정 업무와 공간 범위·계정 상태로 확인한 결과입니다. 표시 역할이나 메일 지정만으로 신청 결정 권한이 생기지 않습니다.</p>
      <RequestMailTargetPicker options={baseline.selectionTargets} target={target} disabled={busy || blocked} onChange={(value) => { clearReview(); setTarget(value) }} />
      <p className="break-all text-sm">표시 결과 기준: {requestMailTargetLabel(eligibility.data?.selectionContext ?? target)}</p>
      {eligibility.isFetching && <p role="status" className="text-sm">대상별 수신 자격 조회 중</p>}
      {eligibility.isError && <Alert variant="danger">{eligibility.error.message}<Button variant="secondary" onClick={() => void eligibility.refetch()}>대상 수신 자격 다시 조회</Button></Alert>}
      <p className="text-xs">대상을 바꿔도 다른 종류·공간에서 지정한 수신자는 자동으로 해제하지 않습니다. 아래 체크는 기관 전체의 지정값입니다.</p>
      <div className="space-y-2">{eligibility.data?.members.map((member) => <Checkbox key={member.userId} label={`${member.name} 메일 수신자 지정`}
        aria-label={`${member.name} 메일 수신자 지정`}
        description={member.inAppRecipient === true ? '현재 범위에서 신청 결정 가능' : orgRecipientReason(member.exclusionReason)}
        checked={recipients.includes(member.userId)} disabled={busy || blocked || revisionChanged || mode !== 'DESIGNATED' || member.inAppRecipient !== true && !recipients.includes(member.userId)}
        onChange={(event) => { clearReview(); setRecipients((rows) => event.target.checked ? [...rows, member.userId] : rows.filter((id) => id !== member.userId)) }} />)}</div>
      <p className="text-xs">지정 0명도 저장할 수 있으며 대체 수신자를 자동 선정하지 않습니다. 변경 후 접수되는 신청에 적용되고 이미 큐에 등록한 수신자·주소·본문은 바뀌지 않습니다.</p>
      <FormField label="수신 설정 변경 사유"><Textarea value={reason} disabled={busy || blocked} maxLength={2000} onChange={(event) => { clearReview(); setReason(event.target.value) }} /></FormField>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>취소</Button><Button variant="secondary" loading={review.isPending} disabled={busy || blocked || conflict || requiresFresh || revisionChanged || !eligibility.data || eligibility.isError || !mode} onClick={() => mode && review.mutate({ body: { expectedRevision: baseline.revision, mailMode: mode, recipientIds: [...new Set(recipients)], reason: reason.trim() || null }, target })}>수신 변경안 미리보기</Button></div>
      {preview && <section className="space-y-3 rounded-md border p-4"><h3 className="font-semibold">저장 전 수신 설정 확인</h3><p className="text-sm">현재 이메일 수신자 {preview.before.currentMailRecipientCount ?? '조회 불가'}명 → {preview.after.currentMailRecipientCount ?? '조회 불가'}명</p>
        <p className="break-all text-sm">미리보기 대상: {requestMailTargetLabel(preview.after.selectionContext)}</p>
        {preview.warnings.map((warning) => <Alert key={warning} variant="warning">{warning}</Alert>)}
        {preview.after.members.map((member) => <p className="text-sm" key={member.userId}>{member.name}: {member.currentMailRecipient === true ? '수신 가능' : '제외'} · {orgRecipientReason(member.currentMailRecipient ? member.selectionReason : member.exclusionReason)}</p>)}
        <Button loading={save.isPending} disabled={busy || blocked || conflict || revisionChanged || !reviewed} onClick={() => reviewed && save.mutate(reviewed)}>검토한 수신 설정 저장</Button>
      </section>}
    </div>
  </Modal>
}
