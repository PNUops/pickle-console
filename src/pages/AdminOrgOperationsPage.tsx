import { useLayoutEffect, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAdminUsers, fetchOrgOperations, previewOrgOperations, saveOrgOperations,
  type OrgOperations, type OrgOperationsMember, type OrgOperationsPreview, type SaveOrgOperations, type UserRole } from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canViewAudit } from '../auth/permissions'
import { OperationResult } from '../components/OperationResult'
import { Alert, Badge, Button, Card, Checkbox, FormField, Input, Modal, Pagination, Select, Spinner, Table, TBody, TD, TH, THead, TR, Textarea } from '../components/ui'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'
import { useListUrl } from '../lib/use-list-url'
import { useActiveResult } from '../lib/use-active-result'
import { orgMemberList, orgRecipientReason, ORG_ROLES } from '../lib/org-operations'
import { USER_ROLE_LABELS, USER_STATUS_LABELS } from '../lib/labels'
import { formatDateTime } from '../lib/format'
import { isUuid } from '../lib/validation'

export function AdminOrgOperationsPage() {
  const scope = useAdminScope()
  if (!scope.activeOrgId) return <div className="space-y-5">
    <h1 className="text-2xl font-bold">기관 운영</h1>
    <p className="text-sm text-neutral-600">기관을 선택해 기관별 역할 명단과 신청 알림 설정을 확인합니다.</p>
    {scope.catalogPending && <Spinner label="기관 목록 불러오는 중" />}
    {scope.error && <Alert variant="danger">기관 목록을 불러오지 못했습니다.<Button variant="secondary" onClick={scope.retry}>기관 목록 다시 조회</Button></Alert>}
    {!scope.catalogPending && !scope.error && <Card><Table><THead><TR><TH>기관</TH><TH>상태</TH><TH>운영</TH></TR></THead><TBody>
      {scope.options.map((org) => <TR key={org.id}><TD>{org.name}</TD><TD>{org.status === 'DISABLED' ? '비활성' : '활성'}</TD><TD>
        <Link className="text-primary-700 hover:underline" to={adminPaths.orgOperations(org.id)}>명단과 수신 설정 보기</Link>
      </TD></TR>)}
    </TBody></Table>{scope.options.length === 0 && <p className="p-5 text-sm">등록된 기관이 없습니다.</p>}</Card>}
  </div>
  return <OrgOperationsBody key={scope.activeOrgId} orgId={scope.activeOrgId} />
}

function OrgOperationsBody({ orgId }: { orgId: string }) {
  const { user } = useAuth()
  const scope = useAdminScope()
  const active = useActiveResult()
  const queryClient = useQueryClient()
  const [params, change, normalize] = useListUrl()
  const [editing, setEditing] = useState<OrgOperations | null>(null)
  const [stored, setStored] = useState<number | null>(null)
  const [requesterInput, setRequesterInput] = useState('')
  const [requesterId, setRequesterId] = useState<string | undefined>()
  const canEdit = user?.role === 'SYS_ADMIN' || (scope.tier === 'org' && scope.activeOrgRole === 'ORG_ADMIN')
  const auditRole = scope.tier === 'org' ? scope.activeOrgRole : user?.role
  const operations = useQuery({ queryKey: ['admin', 'org-operations', orgId, requesterId ?? null], queryFn: () => fetchOrgOperations(orgId, requesterId) })
  const data = operations.data
  const list = orgMemberList(data?.members ?? [], params)
  useLayoutEffect(() => {
    if (!data) return
    const canonical = new URLSearchParams(params)
    if (list.page === 0) canonical.delete('page')
    else canonical.set('page', String(list.page))
    if (!list.role) canonical.delete('role')
    if (!list.status) canonical.delete('status')
    normalize(canonical.toString())
  }, [data, list.page, list.role, list.status, normalize, params])

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div>
      <h1 className="text-2xl font-bold text-neutral-900">기관 운영</h1>
      <p className="mt-1 text-sm text-neutral-600">{scope.activeOrg?.name}의 실제 기관 역할과 신청 알림을 관리합니다.</p>
    </div>{canEdit && data && <Button onClick={() => { setStored(null); setEditing(data) }}>명단과 수신 설정 편집</Button>}</div>
    <nav aria-label="기관 업무 연결" className="flex flex-wrap gap-4 text-sm text-primary-700">
      <Link to={adminPaths.requests(orgId)}>기관 신청 보기</Link>
      {auditRole && canViewAudit(auditRole) && <Link to={adminPaths.orgAudit(orgId)}>기관 변경 이력</Link>}
      {scope.tier === 'system' && <Link to={adminPaths.orgOperations()}>전체 기관 목록</Link>}
    </nav>
    {stored !== null && <OperationResult stage="stored">기관 명단과 수신 설정을 버전 {stored}로 저장했습니다. 변경 후 접수되는 신청부터 적용됩니다. 이미 큐에 들어간 수신자와 주소는 바뀌지 않습니다.</OperationResult>}
    {operations.isPending && <Spinner label="기관 운영 설정 불러오는 중" />}
    {operations.isError && <Alert variant="danger">{operations.error.message}<Button variant="secondary" onClick={() => void operations.refetch()}>다시 조회</Button></Alert>}
    {data && <>
      <Card className="space-y-3 p-5"><h2 className="font-semibold">현재 신청 알림 설정</h2>
        <p className="text-sm">메일 방식: {data.mailMode === 'ALL_APPROVERS' ? '활성 기관 승인자 전체' : data.mailMode === 'DESIGNATED' ? '지정한 수신자만' : '기존 수신 정책 유지'}</p>
        <p className="text-sm">활성 관리자 {data.activeAdminCount}명 · 활성 승인자 {data.activeApproverCount}명 · 현재 메일 수신자 {data.currentMailRecipientCount}명</p>
        <p className="text-xs text-neutral-500">설정 버전 {data.revision} · 조회 시각 {formatDateTime(data.observedAt)} · {data.org.status === 'DISABLED' ? '비활성 기관' : '활성 기관'}</p>
        <p className="text-sm text-neutral-600">기관 승인자 알림은 활성 기관 관리자와 기관 운영자 모두의 콘솔에 표시됩니다. 이메일은 기관 수신 설정으로 정합니다. 신청자 본인은 기관 승인자 알림 대상에서 제외되며 본인 신청 확인 알림은 별도로 받습니다.</p>
        {data.mailMode == null && <Alert variant="warning">아직 새 수신 방식을 저장하지 않은 기관입니다. 기존 지정 수신자가 없으면 기관 관리자에게 보내는 정책을 유지합니다. 새 방식을 선택하면 자동 대체 발송 없이 선택한 방식만 적용됩니다.</Alert>}
        {data.legacyFallback && <p className="text-sm">현재 조회에서는 기존 기관 관리자 대체 수신이 적용됩니다.</p>}
        {data.currentMailRecipientCount === 0 && <Alert variant="warning">신청 메일 수신자가 0명입니다. 신청 접수는 가능하며, 다른 사람에게 자동으로 보내지 않습니다.</Alert>}
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); if (!requesterInput || isUuid(requesterInput)) setRequesterId(requesterInput.toLowerCase() || undefined) }}>
          <FormField label="신청자 제외 미리보기" description="신청자의 사용자 ID를 넣어 본인 제외 결과를 조회합니다."><Input value={requesterInput} onChange={(event) => setRequesterInput(event.target.value)} placeholder="사용자 ID (선택)" aria-invalid={!!requesterInput && !isUuid(requesterInput)} /></FormField>
          <Button type="submit" variant="secondary" disabled={!!requesterInput && !isUuid(requesterInput)}>수신자 확인</Button>
        </form>
        {data.requesterId && <p className="text-sm">신청자 {data.requesterId}를 제외한 조회입니다. 저장된 명단은 변경되지 않았습니다.</p>}
      </Card>
      <section className="space-y-4"><h2 className="font-semibold">기관 역할 명단</h2>
        <p className="text-sm text-neutral-600">이 기관에 배정된 역할입니다. 계정의 최고 역할과 시스템 관리자의 전역 권한은 이 명단의 역할과 구분됩니다.</p>
        <div className="flex flex-wrap gap-3">
          <Input aria-label="기관 명단 검색" className="max-w-xs" value={list.q} placeholder="이름 또는 이메일" onChange={(event) => change({ q: event.target.value }, true)} />
          <Select aria-label="기관 역할 필터" className="w-44" value={list.role ?? ''} onChange={(event) => change({ role: event.target.value }, true)}><option value="">모든 기관 역할</option>{ORG_ROLES.map((role) => <option key={role} value={role}>{USER_ROLE_LABELS[role]}</option>)}</Select>
          <Select aria-label="계정 상태 필터" className="w-44" value={list.status ?? ''} onChange={(event) => change({ status: event.target.value }, true)}><option value="">모든 계정 상태</option>{Object.entries(USER_STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</Select>
        </div>
        <p className="text-sm">전체 기관 역할 {data.members.length}명 · 조건에 맞는 명단 {list.total}명</p>
        <Card><MemberTable members={list.rows} orgId={orgId} />{list.rows.length === 0 && <p className="p-6 text-sm text-neutral-500">조건에 맞는 기관 역할이 없습니다.</p>}</Card>
        <Pagination page={list.page} totalPages={list.totalPages} onPageChange={(page) => change({ page })} />
      </section>
    </>}
    {editing && <OperationsEditor key={`${orgId}:${editing.revision}`} initial={editing} sysAdmin={user?.role === 'SYS_ADMIN'} viewerId={user?.id} onClose={() => setEditing(null)} onSaved={async (saved) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin', 'org-operations', orgId] }), queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }), queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] })])
      if (active.current) { setEditing(null); setStored(saved.revision) }
    }} />}
  </div>
}

function MemberTable({ members, orgId }: { members: OrgOperationsMember[]; orgId: string }) {
  return <Table><THead><TR><TH>사용자</TH><TH>기관 역할</TH><TH>계정</TH><TH>지정 설정</TH><TH>현재 이메일</TH><TH>콘솔 알림</TH></TR></THead><TBody>{members.map((member) => <TR key={member.userId}>
    <TD><Link className="font-medium text-primary-700 hover:underline" to={adminPaths.users(orgId, member.userId)}>{member.name}</Link><span className="block text-xs text-neutral-500">{member.email}</span></TD>
    <TD>{USER_ROLE_LABELS[member.role]}</TD><TD>{USER_STATUS_LABELS[member.status]}</TD><TD>{member.requestMail ? '지정됨' : '미지정'}</TD>
    <TD><Badge variant={member.currentMailRecipient ? 'success' : 'neutral'}>{member.currentMailRecipient ? '수신 가능' : '제외'}</Badge><span className="block text-xs">{orgRecipientReason(member.currentMailRecipient ? member.selectionReason : member.exclusionReason)}</span></TD>
    <TD>{member.inAppRecipient ? '대상' : '제외'}</TD>
  </TR>)}</TBody></Table>
}

function OperationsEditor({ initial, sysAdmin, viewerId, onClose, onSaved }: { initial: OrgOperations; sysAdmin: boolean; viewerId?: string; onClose: () => void; onSaved: (saved: OrgOperations) => Promise<void> }) {
  const active = useActiveResult()
  const [baseline, setBaseline] = useState(initial)
  const [members, setMembers] = useState(initial.members)
  const [mailMode, setMailMode] = useState(initial.mailMode ?? null)
  const [reason, setReason] = useState('')
  const [allowVacancy, setAllowVacancy] = useState(false)
  const [confirmedName, setConfirmedName] = useState('')
  const [preview, setPreview] = useState<OrgOperationsPreview | null>(null)
  const [reviewedBody, setReviewedBody] = useState<SaveOrgOperations | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [searchPage, setSearchPage] = useState(0)
  const candidates = useQuery({ queryKey: ['admin', 'users', 'org-candidates', userSearch, searchPage], queryFn: () => fetchAdminUsers({ q: userSearch.trim(), page: searchPage, size: 10 }), enabled: userSearch.trim().length > 0 })
  const clearReview = () => { setPreview(null); setReviewedBody(null); setAllowVacancy(false); setConfirmedName(''); setError(null) }
  const handleError = (err: unknown) => {
    if (!active.current) return
    const problem = toApiError(err, '기관 운영 변경을 처리하지 못했습니다.')
    setError(problem.message)
    if (problem.problem?.status === 409) { setConflict(true); setPreview(null); setReviewedBody(null) }
  }
  const review = useMutation({ mutationFn: (body: SaveOrgOperations) => previewOrgOperations(initial.org.id, body), onSuccess: (result, body) => { if (active.current) { setPreview(result); setReviewedBody(body); setError(null) } }, onError: handleError })
  const save = useMutation({ mutationFn: (body: SaveOrgOperations) => saveOrgOperations(initial.org.id, body), onSuccess: async (saved) => { await onSaved(saved) }, onError: handleError })
  const reload = useMutation({ mutationFn: () => fetchOrgOperations(initial.org.id), onSuccess: (data) => { if (active.current) { setBaseline(data); setConflict(false); clearReview() } }, onError: handleError })
  const busy = review.isPending || save.isPending || reload.isPending
  const update = (id: string, patch: Partial<OrgOperationsMember>) => { clearReview(); setMembers((rows) => rows.map((row) => row.userId === id ? { ...row, ...patch } : row)) }
  const body = (): SaveOrgOperations => ({ expectedRevision: baseline.revision, mailMode, members: members.map(({ userId, role, requestMail }) => ({ userId, role, requestMail })), reason: reason.trim() || null })
  const canSave = !!reviewedBody && !conflict && (!preview?.createsStaffVacancy || (sysAdmin && allowVacancy && reason.trim().length > 0 && confirmedName === initial.org.name))
  return <Modal open onClose={() => { if (!busy) onClose() }} title="기관 명단과 수신 설정 편집" className="max-w-5xl">
    <div className="space-y-5"><p className="text-sm">{initial.org.name} · 편집 기준 버전 {baseline.revision}. 검색 결과에 보이지 않는 사람까지 포함해 전체 명단을 한 번에 저장합니다.</p>
      {error && <Alert variant="danger">{error}</Alert>}
      {conflict && <Alert variant="warning" title="기관 설정이 다른 화면에서 변경됐습니다">변경안은 유지했습니다. 현재 명단을 다시 조회한 뒤 아래 현재값과 변경안을 비교하고 다시 미리보기하세요.<Button variant="secondary" loading={reload.isPending} onClick={() => reload.mutate()}>최신 현재값으로 다시 검토</Button></Alert>}
      <FormField label="신청 이메일 수신 방식"><Select value={mailMode ?? 'LEGACY'} disabled={busy} onChange={(event) => { clearReview(); setMailMode(event.target.value === 'LEGACY' ? null : event.target.value as 'DESIGNATED' | 'ALL_APPROVERS') }}>
        {(baseline.mailMode == null || mailMode == null) && <option value="LEGACY" disabled={baseline.mailMode != null}>{baseline.mailMode == null ? '기존 정책 유지' : '최신 명단은 이미 새 방식입니다. 수신 방식을 선택하세요'}</option>}<option value="DESIGNATED">지정한 수신자만 (0명 허용)</option><option value="ALL_APPROVERS">활성 기관 승인자 전체</option>
      </Select></FormField>
      <p className="text-xs text-neutral-600">지정 0명은 경고와 함께 저장할 수 있습니다. 전체 승인자 발송은 해당 방식을 선택한 경우에만 적용됩니다. 변경은 새로운 신청부터 적용되며 대기 메일은 다시 선정하지 않습니다.</p>
      {!sysAdmin && <p className="text-xs text-neutral-600">자신의 기관 역할은 변경하거나 회수할 수 없습니다. 자신의 메일 수신자 지정은 변경할 수 있습니다.</p>}
      <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border p-3" aria-label="변경할 전체 기관 명단">{members.map((member) => <div key={member.userId} className="flex flex-wrap items-center gap-3 border-b pb-3">
        <div className="min-w-0 flex-1 text-sm"><strong>{member.name}</strong><span className="block break-all text-xs">{member.email} · {USER_STATUS_LABELS[member.status]}</span></div>
        <Select aria-label={`${member.name} 기관 역할`} className="w-40" value={member.role} disabled={busy || (!sysAdmin && member.userId === viewerId)} onChange={(event) => { const role = event.target.value as UserRole; update(member.userId, { role, requestMail: role === 'ORG_VIEWER' ? false : member.requestMail }) }}>{ORG_ROLES.map((role) => <option key={role} value={role}>{USER_ROLE_LABELS[role]}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`${member.name} 메일 수신자 지정`} checked={member.requestMail} disabled={busy || member.role === 'ORG_VIEWER'} onChange={(event) => update(member.userId, { requestMail: event.target.checked })} />메일 지정</label>
        <Button variant="secondary" size="sm" disabled={busy || (!sysAdmin && member.userId === viewerId)} onClick={() => { clearReview(); setMembers((rows) => rows.filter((row) => row.userId !== member.userId)) }}>회수: {member.name}</Button>
      </div>)}{members.length === 0 && <p className="text-sm">변경안에 기관 역할이 없습니다.</p>}</div>
      <FormField label="명단에 추가할 사용자 검색"><Input value={userSearch} disabled={busy} onChange={(event) => { setUserSearch(event.target.value); setSearchPage(0) }} placeholder="이름 또는 이메일" /></FormField>
      {candidates.isFetching && <Spinner label="사용자 검색 중" />}{candidates.isError && <Alert variant="danger">{candidates.error.message}</Alert>}
      {candidates.data && userSearch.trim() && <div className="space-y-2">{candidates.data.content.filter((candidate) => !candidate.role.startsWith('SYS_') && !members.some((row) => row.userId === candidate.id)).map((candidate) => <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{candidate.name} · {candidate.email}</span><Button size="sm" variant="secondary" disabled={busy} onClick={() => { clearReview(); setMembers((rows) => [...rows, { userId: candidate.id, name: candidate.name, email: candidate.email, status: candidate.status, role: 'ORG_MANAGER', requestMail: false, currentMailRecipient: false, inAppRecipient: false }]) }}>추가: {candidate.name}</Button></div>)}<Pagination page={searchPage} totalPages={candidates.data.totalPages} onPageChange={setSearchPage} />{candidates.data.content.length === 0 && <p className="text-sm">검색 결과가 없습니다.</p>}</div>}
      <FormField label="변경 사유"><Textarea value={reason} disabled={busy} maxLength={1000} onChange={(event) => { clearReview(); setReason(event.target.value) }} /></FormField>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>취소</Button><Button variant="secondary" loading={review.isPending} disabled={busy || conflict || (baseline.mailMode != null && mailMode == null)} onClick={() => review.mutate(body())}>변경안 미리보기</Button></div>
      {preview && <section className="space-y-3 rounded-md border p-4"><h3 className="font-semibold">저장 전 변경안 확인</h3>
        <p className="text-sm">메일 수신자 {preview.before.currentMailRecipientCount}명 → {preview.after.currentMailRecipientCount}명 · 활성 관리자 {preview.before.activeAdminCount}명 → {preview.after.activeAdminCount}명 · 활성 승인자 {preview.before.activeApproverCount}명 → {preview.after.activeApproverCount}명</p>
        {preview.warnings.map((warning) => <Alert key={warning} variant="warning">{warning}</Alert>)}
        <details open><summary className="cursor-pointer text-sm font-semibold">현재 저장된 명단</summary><MemberTable members={preview.before.members} orgId={initial.org.id} /></details>
        <details open><summary className="cursor-pointer text-sm font-semibold">저장할 명단과 예상 수신자</summary><MemberTable members={preview.after.members} orgId={initial.org.id} /></details>
        {preview.createsStaffVacancy && (sysAdmin ? <div className="space-y-3"><Checkbox label="관리자 또는 승인자 공백 예외를 적용합니다" checked={allowVacancy} onChange={(event) => setAllowVacancy(event.target.checked)} /><FormField label="예외 대상 기관 이름 확인" description="변경 사유와 기관 이름 확인이 있어야 공백 예외를 저장할 수 있습니다."><Input value={confirmedName} onChange={(event) => setConfirmedName(event.target.value)} placeholder={initial.org.name} /></FormField></div> : <Alert variant="danger">마지막 활성 관리자 또는 승인자를 없애는 변경은 저장할 수 없습니다.</Alert>)}
        <Button loading={save.isPending} disabled={!canSave || busy} onClick={() => reviewedBody && save.mutate({ ...reviewedBody, allowVacancy: !!preview.createsStaffVacancy && allowVacancy, confirmedOrgId: preview.createsStaffVacancy && allowVacancy ? initial.org.id : null })}>검토한 전체 명단 저장</Button>
      </section>}
      {baseline.revision !== initial.revision && !preview && <details><summary>다시 조회한 현재 명단 (버전 {baseline.revision})</summary><MemberTable members={baseline.members} orgId={initial.org.id} /></details>}
    </div>
  </Modal>
}
