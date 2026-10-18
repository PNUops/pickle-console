import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchAdminUsers, fetchAdminWorkspaces } from '../../api/queries'
import { fetchOrgOperations, previewOrgOperations, saveOrgOperations, type OrgOperations, type OrgOperationsPreview, type SaveOrgOperations } from '../../api/org-operations'
import { toApiError } from '../../api/problem'
import { useAuth } from '../../auth/auth-context'
import { useInstitutionPermissions } from '../../auth/use-institution-permissions'
import { SYS_ADMIN } from '../../auth/institution-authority'
import { permissionInput, permissionProblem, permissionSaveBody, permissionSummary, WORK_GROUP_LABELS, type PermissionMember } from '../../lib/org-operations'
import type { WorkGroup } from '../../auth/institution-authority'
import { useActiveResult } from '../../lib/use-active-result'
import { Alert, Button, Checkbox, FormField, Input, Modal, Pagination, Spinner, Textarea } from '../ui'
import { PermissionAssignmentEditor } from './PermissionAssignmentEditor'

export function OperationsEditor({ initial, onClose, onSaved }: { initial: OrgOperations; onClose: () => void; onSaved: (data: OrgOperations) => Promise<void> }) {
  const { user } = useAuth()
  const permissions = useInstitutionPermissions()
  const active = useActiveResult()
  const [initialFingerprint] = useState(permissions.fingerprint)
  const [baseline, setBaseline] = useState(initial)
  const draftFrom = (data: OrgOperations): PermissionMember[] => data.members.flatMap((member) => member.permission ? [{ ...member, permission: permissionInput(member.permission) }] : [])
  const [members, setMembers] = useState(() => draftFrom(initial))
  const [retained, setRetained] = useState<PermissionMember[] | null>(null)
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<OrgOperationsPreview | null>(null)
  const [reviewed, setReviewed] = useState<SaveOrgOperations | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [allowVacancy, setAllowVacancy] = useState(false)
  const [confirmedName, setConfirmedName] = useState('')
  const [search, setSearch] = useState('')
  const [searchPage, setSearchPage] = useState(0)
  const catalogue = permissions.authority?.catalogue ?? []
  const sysAdmin = permissions.role === 'SYS_ADMIN'
  const changedAuthority = permissions.fingerprint !== initialFingerprint
  const mayDelegate = permissions.canWork('institution.delegate', { orgId: initial.org.id }, SYS_ADMIN)
  const incomplete = baseline.members.some((member) => !member.permission) || !catalogue.length || permissions.authority?.state === 'INVALID'
  const blocked = changedAuthority || !mayDelegate || incomplete
  const workspaces = useQuery({ queryKey: ['admin', 'workspaces', 'institution-permission-editor', initialFingerprint], queryFn: () => fetchAdminWorkspaces({ all: true }), enabled: !blocked })
  const candidates = useQuery({ queryKey: ['admin', 'users', 'institution-permission-editor', initialFingerprint, search, searchPage], queryFn: () => fetchAdminUsers({ q: search.trim(), page: searchPage, size: 10 }), enabled: !blocked && search.trim().length > 0 })
  const clearReview = () => { setPreview(null); setReviewed(null); setError(null); setAllowVacancy(false); setConfirmedName('') }
  const handleError = (failure: unknown) => {
    if (!active.current) return
    const problem = toApiError(failure, '기관 권한 변경을 처리하지 못했습니다.')
    setError(problem.message)
    if (problem.problem?.status === 409) { setConflict(true); setPreview(null); setReviewed(null) }
  }
  const review = useMutation({ mutationFn: (body: SaveOrgOperations) => previewOrgOperations(initial.org.id, body), onSuccess: (value, body) => { if (active.current) { setPreview(value); setReviewed(body); setError(null) } }, onError: handleError })
  const save = useMutation({ mutationFn: (body: SaveOrgOperations) => saveOrgOperations(initial.org.id, body), onSuccess: onSaved, onError: handleError })
  const reload = useMutation({ mutationFn: () => fetchOrgOperations(initial.org.id), onSuccess: (data) => {
    if (!active.current) return
    setRetained(structuredClone(members)); setBaseline(data); setMembers(draftFrom(data)); setConflict(false); clearReview()
  }, onError: handleError })
  const busy = review.isPending || save.isPending || reload.isPending
  const invalid = members.some((member) => permissionProblem(member.permission, catalogue))
  const changeMember = (id: string, permission: PermissionMember['permission']) => {
    clearReview()
    setMembers((rows) => rows.map((member) => member.userId === id ? { ...member, permission,
      requestMail: member.requestMail === true && (permission.mode === 'FULL' || permission.work.some((workId) => ['vm.request.decide', 'llm.request.decide', 'domain.request.decide', 'gpu.request.decide'].includes(workId))) } : member))
  }
  const canSave = !!reviewed && !blocked && !conflict && !invalid && (!preview?.createsStaffVacancy || sysAdmin && allowVacancy && reason.trim().length > 0 && confirmedName === initial.org.name)
  return <Modal open title="기관 권한 편집" className="max-w-5xl" dismissible={!busy} onClose={onClose}>
    <div className="min-w-0 space-y-5">
      <p className="text-sm">{initial.org.name} · 설정 버전 {baseline.revision}. 각 담당자의 업무·공간 범위와 원천 버전을 함께 확인합니다. 메일 설정은 별도 화면에서 변경합니다.</p>
      {blocked && <Alert variant="danger">{changedAuthority ? '편집 중 본인의 권한 문맥이 변경됐습니다. 초안은 확인할 수 있지만 저장할 수 없습니다. 닫고 최신 권한으로 다시 시작하세요.' : '현재 기관 위임 권한이나 명시된 권한 정보를 확인할 수 없어 저장을 차단했습니다.'}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}
      {conflict && <Alert variant="warning" title="기관 설정이 다른 화면에서 변경됐습니다">이전 전체 명단을 다시 보내지 않습니다. 최신값을 불러오면 초안을 비교용으로 보관하고 최신 명단에서 다시 작성합니다.<Button variant="secondary" disabled={busy || blocked} onClick={() => reload.mutate()}>최신 현재값으로 다시 검토</Button></Alert>}
      {retained && <details className="rounded-md border p-3"><summary>충돌 전에 작성한 초안 (비교용 · 자동 적용 안 함)</summary>{retained.map((member) => <p className="mt-2 break-words text-sm" key={member.userId}>{member.name}: {permissionSummary(member.permission, catalogue)}{Object.entries(member.permission.scopes).map(([group, scope]) => <span key={group} className="block break-all">{group}: {scope.mode === 'ALL' ? '모든 공간' : scope.workspaceIds.join(', ') || '빈 지정 목록'}</span>)}</p>)}</details>}
      {!sysAdmin && <p className="text-sm">본인의 기관 권한은 변경하거나 회수할 수 없습니다. 시스템 계정의 기관 권한도 변경할 수 없습니다.</p>}
      {members.map((member) => <section key={member.userId} className="min-w-0 space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold">{member.name}</h3><p className="break-all text-xs">{member.email}</p><p className="text-xs">부여 원천 버전 {member.permission.expectedRevision === 0 ? '신규' : member.permission.expectedRevision}</p></div>
          <Button size="sm" variant="secondary" className="h-auto min-h-8 max-w-full break-all whitespace-normal py-2" disabled={blocked || busy || !sysAdmin && member.userId === user?.id || member.role.startsWith('SYS_')} onClick={() => { clearReview(); setMembers((rows) => rows.filter((row) => row.userId !== member.userId)) }}>이 기관 담당 자격 회수: {member.name}</Button></div>
        <PermissionAssignmentEditor name={member.name} value={member.permission} catalogue={catalogue} workspaces={workspaces.data ?? []}
          disabled={blocked || busy || !sysAdmin && member.userId === user?.id || member.role.startsWith('SYS_')} onChange={(permission) => changeMember(member.userId, permission)} />
      </section>)}
      {members.length === 0 && <p>변경안에 기관 담당자가 없습니다.</p>}
      {workspaces.isFetching && <Spinner label="범위 워크스페이스 조회 중" />}{workspaces.isError && <Alert variant="warning">{workspaces.error.message} 기존 지정 ID는 그대로 보존합니다.<Button variant="secondary" onClick={() => void workspaces.refetch()}>공간 목록 다시 조회</Button></Alert>}
      <FormField label="명단에 추가할 사용자 검색"><Input disabled={blocked || busy} value={search} onChange={(event) => { setSearch(event.target.value); setSearchPage(0) }} placeholder="이름 또는 이메일" /></FormField>
      {candidates.isFetching && <Spinner label="사용자 검색 중" />}{candidates.isError && <Alert variant="danger">{candidates.error.message}</Alert>}
      {search.trim() && candidates.data && <div className="space-y-2">{candidates.data.content.filter((candidate) => !candidate.role.startsWith('SYS_') && candidate.id !== user?.id && !members.some((member) => member.userId === candidate.id)).map((candidate) => <div key={candidate.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3"><span className="break-all text-sm">{candidate.name} · {candidate.email}</span><Button size="sm" variant="secondary" disabled={blocked || busy} onClick={() => { clearReview(); setMembers((rows) => [...rows, {
        userId: candidate.id, name: candidate.name, email: candidate.email, status: candidate.status, role: 'ORG_VIEWER',
        permission: { mode: 'SELECTED', work: [], scopes: {}, expectedRevision: 0 }, requestMail: false, currentMailRecipient: false, inAppRecipient: false,
      }]) }}>추가: {candidate.name}</Button></div>)}<Pagination page={searchPage} totalPages={candidates.data.totalPages} onPageChange={setSearchPage} /></div>}
      <FormField label="권한 변경 사유"><Textarea disabled={blocked || busy} value={reason} maxLength={2000} onChange={(event) => { clearReview(); setReason(event.target.value) }} /></FormField>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>취소</Button><Button variant="secondary" loading={review.isPending} disabled={blocked || busy || conflict || invalid} onClick={() => {
        try { review.mutate(permissionSaveBody(baseline, members, reason)) } catch (failure) { handleError(failure) }
      }}>권한 변경안 미리보기</Button></div>
      {preview && <section className="min-w-0 space-y-3 rounded-md border p-4"><h3 className="font-semibold">저장 전 권한 변경 확인</h3>
        <p className="text-sm">활성 FULL 담당자 {preview.before.activeAdminCount}명 → {preview.after.activeAdminCount}명 · 실제 신청 결정 담당자 {preview.before.activeApproverCount}명 → {preview.after.activeApproverCount}명</p>
        {preview.warnings.map((warning) => <Alert key={warning} variant="warning">{warning}</Alert>)}
        {[{ title: '현재 저장된 권한', value: preview.before }, { title: '저장할 권한', value: preview.after }].map(({ title, value }) => <details open key={title}><summary>{title}</summary>{value.members.map((member) => <div key={member.userId} className="break-words py-2 text-sm"><p>{member.name}: {permissionSummary(member.permission, catalogue)}</p>
          {member.permission && <p className="text-xs">비교 기준 원천 버전 {member.permission.revision}</p>}
          {Object.entries(member.permission?.scopes ?? {}).map(([group, scope]) => <p key={group} className="break-all text-xs">{WORK_GROUP_LABELS[group as WorkGroup] ?? group}: {scope.mode === 'ALL' ? '모든 워크스페이스' : scope.workspaceIds.map((id) => workspaces.data?.find((workspace) => workspace.id === id)?.name ? `${workspaces.data.find((workspace) => workspace.id === id)!.name} (${id})` : id).join(', ') || '빈 지정 목록 (허용 공간 없음)'}</p>)}
        </div>)}</details>)}
        {preview.createsStaffVacancy && (sysAdmin ? <div className="space-y-3"><Checkbox label="FULL 담당자 또는 신청 결정 담당자 공백 예외를 적용합니다" checked={allowVacancy} onChange={(event) => setAllowVacancy(event.target.checked)} /><FormField label="예외 대상 기관 이름 확인"><Input value={confirmedName} onChange={(event) => setConfirmedName(event.target.value)} placeholder={initial.org.name} /></FormField></div> : <Alert variant="danger">마지막 활성 FULL 담당자 또는 실제 신청 결정 담당자를 없애는 변경은 저장할 수 없습니다.</Alert>)}
        <Button loading={save.isPending} disabled={busy || !canSave} onClick={() => reviewed && save.mutate({ ...reviewed, allowVacancy: !!preview.createsStaffVacancy && allowVacancy, confirmedOrgId: preview.createsStaffVacancy && allowVacancy ? initial.org.id : null })}>검토한 기관 권한 저장</Button>
      </section>}
    </div>
  </Modal>
}
