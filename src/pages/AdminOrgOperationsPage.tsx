import { useLayoutEffect, useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchOrgOperations, type OrgOperations, type OrgOperationsMember, type RequestMailTarget } from '../api/org-operations'
import { useInstitutionPermissions } from '../auth/use-institution-permissions'
import { SYS_ADMIN, SYS_READERS } from '../auth/institution-authority'
import { OperationsEditor } from '../components/org-operations/OperationsEditor'
import { RequestMailEditor } from '../components/org-operations/RequestMailEditor'
import { RequestMailTargetPicker } from '../components/org-operations/RequestMailTargetPicker'
import { OperationResult } from '../components/OperationResult'
import { Alert, Badge, Button, Card, FormField, Input, Pagination, Select, Spinner, Table, TBody, TD, TH, THead, TR } from '../components/ui'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'
import { useListUrl } from '../lib/use-list-url'
import { useActiveResult } from '../lib/use-active-result'
import { orgMemberList, orgRecipientReason, permissionSummary, requestMailTargetLabel, ORG_ROLES, WORK_GROUP_LABELS } from '../lib/org-operations'
import type { WorkGroup } from '../auth/institution-authority'
import { USER_ROLE_LABELS, USER_STATUS_LABELS } from '../lib/labels'
import { formatDateTime } from '../lib/format'
import { isUuid } from '../lib/validation'

export function AdminOrgOperationsPage() {
  const scope = useAdminScope()
  if (!scope.activeOrgId) return <div className="space-y-5">
    <h1 className="text-2xl font-bold">기관 운영</h1>
    <p className="text-sm text-neutral-600">기관을 선택해 허용된 담당자 정보와 신청 알림 설정을 확인합니다.</p>
    {scope.catalogPending && <Spinner label="기관 목록 불러오는 중" />}
    {scope.error && <Alert variant="danger">기관 목록을 불러오지 못했습니다.<Button variant="secondary" onClick={scope.retry}>기관 목록 다시 조회</Button></Alert>}
    {!scope.catalogPending && !scope.error && <Card><Table><THead><TR><TH>기관</TH><TH>상태</TH><TH>운영</TH></TR></THead><TBody>
      {scope.options.map((org) => <TR key={org.id}><TD>{org.name}</TD><TD>{org.status === 'DISABLED' ? '비활성' : '활성'}</TD><TD><Link className="text-primary-700 hover:underline" to={adminPaths.orgOperations(org.id)}>명단과 수신 설정 보기</Link></TD></TR>)}
    </TBody></Table>{scope.options.length === 0 && <p className="p-5 text-sm">등록된 기관이 없습니다.</p>}</Card>}
  </div>
  return <OrgOperationsBody key={scope.activeOrgId} orgId={scope.activeOrgId} />
}

function OrgOperationsBody({ orgId }: { orgId: string }) {
  const scope = useAdminScope()
  const permissions = useInstitutionPermissions()
  const active = useActiveResult()
  const queryClient = useQueryClient()
  const [params, change, normalize] = useListUrl()
  const [editing, setEditing] = useState<{ kind: 'permission' | 'mail'; initial: OrgOperations } | null>(null)
  const [stored, setStored] = useState<{ kind: 'permission' | 'mail'; revision: number } | null>(null)
  const [requesterInput, setRequesterInput] = useState('')
  const [requesterId, setRequesterId] = useState<string | undefined>()
  const [selectionTarget, setSelectionTarget] = useState<RequestMailTarget | null>(null)
  const mayRead = ['institution.staff.read', 'institution.request-mail.read', 'institution.request-mail.configure'].some((id) => permissions.canWork(id, { orgId }, SYS_READERS))
  const canDelegate = permissions.canWork('institution.delegate', { orgId }, SYS_ADMIN)
  const canConfigureMail = permissions.canWork('institution.request-mail.configure', { orgId }, SYS_ADMIN)
  const canReadMail = canConfigureMail || permissions.canWork('institution.request-mail.read', { orgId }, SYS_READERS)
  const canAudit = permissions.canWork('institution.audit.read', { orgId }, SYS_READERS)
  const canProfile = permissions.canWork('student.support.read', {}, SYS_READERS)
  const effectiveTarget = canReadMail ? selectionTarget : null
  const operations = useQuery({ queryKey: ['admin', 'org-operations', orgId, permissions.fingerprint, requesterId ?? null, effectiveTarget], queryFn: () => fetchOrgOperations(orgId, requesterId, effectiveTarget), enabled: mayRead,
    placeholderData: (previous, query) => query?.queryKey[2] === orgId && query.queryKey[3] === permissions.fingerprint ? previous : undefined })
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
  const onSaved = async (saved: OrgOperations) => {
    const kind = editing?.kind ?? 'permission'
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin', 'org-operations', orgId] }), queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }), queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] })])
    if (active.current) { setEditing(null); setStored({ kind, revision: saved.revision }) }
  }
  return <div className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">기관 운영</h1><p className="mt-1 text-sm text-neutral-600">{scope.activeOrg?.name}의 담당 업무와 신청 알림을 각각 관리합니다.</p></div>
      {data && !operations.isError && <div className="flex flex-wrap gap-2">{canDelegate && <Button disabled={operations.isFetching} onClick={() => { setStored(null); setEditing({ kind: 'permission', initial: data }) }}>기관 권한 편집</Button>}{canConfigureMail && <Button variant="secondary" disabled={operations.isFetching} onClick={() => { setStored(null); setEditing({ kind: 'mail', initial: data }) }}>신청 메일 수신 설정</Button>}</div>}
    </div>
    <nav aria-label="기관 업무 연결" className="flex flex-wrap gap-4 text-sm text-primary-700">
      {permissions.canAnyWork(['vm.request.read', 'vm.request.support.read', 'llm.request.read', 'llm.request.support.read', 'domain.request.read', 'domain.request.support.read', 'gpu.request.read', 'gpu.request.support.read'], SYS_READERS) && <Link to={adminPaths.requests(orgId)}>기관 신청 보기</Link>}
      {canAudit && <Link to={adminPaths.orgAudit(orgId)}>기관 변경 이력</Link>}{scope.tier === 'system' && <Link to={adminPaths.orgOperations()}>전체 기관 목록</Link>}
    </nav>
    {stored && <OperationResult stage="stored">{stored.kind === 'permission' ? '기관 권한' : '신청 메일 수신 설정'}을 버전 {stored.revision}로 저장했습니다. 이미 큐에 들어간 수신자·주소·본문은 바뀌지 않습니다.</OperationResult>}
    {!mayRead && <Alert variant="warning">이 기관의 담당자 정보나 수신 설정을 조회할 권한이 없습니다.</Alert>}
    {mayRead && operations.isPending && <Spinner label="기관 운영 설정 불러오는 중" />}
    {operations.isError && <Alert variant="danger">{operations.error.message}<Button variant="secondary" onClick={() => void operations.refetch()}>다시 조회</Button>{effectiveTarget && <Button variant="secondary" onClick={() => setSelectionTarget(null)}>일반 자격 조회로 돌아가기</Button>}</Alert>}
    {data && !operations.isError && <>
      <Card className="space-y-3 p-5"><h2 className="font-semibold">현재 신청 알림 설정</h2>
        {data.currentMailRecipientCount != null ? <>
          <RequestMailTargetPicker options={data.selectionTargets} target={selectionTarget} disabled={operations.isFetching} onChange={setSelectionTarget} />
          {operations.isFetching && <Spinner label="대상별 수신자 조회 중" />}
          <p className="break-all text-sm">표시 결과 기준: {requestMailTargetLabel(data.selectionContext)}</p>
          <p className="text-sm">메일 방식: {data.mailMode === 'ALL_APPROVERS' ? '실제 신청 결정 담당자 전체' : data.mailMode === 'DESIGNATED' ? '지정한 수신자만' : '기존 수신 정책 유지'}</p>
          <p className="text-sm">기관 전체 활성 FULL 담당자 {data.activeAdminCount}명 · 일반 자격의 신청 결정 담당자 {data.activeApproverCount}명</p>
          <p className="text-sm">표시 대상의 현재 메일 수신자 {data.currentMailRecipientCount}명</p>
          <p className="text-sm">서버가 실제 신청 결정 업무와 현재 공간 범위·계정 상태로 수신 가능 여부를 판단합니다. 신청자 본인은 기관 알림 대상에서 제외됩니다.</p>
          {data.legacyFallback && <p className="text-sm">현재는 기존 FULL 담당자 대체 수신 정책이 적용됩니다.</p>}
          {data.currentMailRecipientCount === 0 && <Alert variant="warning">신청 메일 수신자가 0명입니다. 다른 사람에게 자동으로 보내지 않습니다.</Alert>}
          <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); if (!requesterInput || isUuid(requesterInput)) setRequesterId(requesterInput.toLowerCase() || undefined) }}><FormField label="신청자 제외 미리보기"><Input value={requesterInput} onChange={(event) => setRequesterInput(event.target.value)} placeholder="사용자 ID (선택)" aria-invalid={!!requesterInput && !isUuid(requesterInput)} /></FormField><Button type="submit" variant="secondary" disabled={!!requesterInput && !isUuid(requesterInput)}>수신자 확인</Button></form>
          {data.requesterId && <p className="break-all text-sm">신청자 {data.requesterId}를 제외한 조회입니다. 저장된 설정은 변경되지 않았습니다.</p>}
        </> : <p className="text-sm">수신 설정 조회 권한이 없습니다. 담당자 권한 정보만 확인할 수 있습니다.</p>}
        <p className="text-xs text-neutral-500">설정 버전 {data.revision} · 조회 시각 {formatDateTime(data.observedAt)} · {data.org.status === 'DISABLED' ? '비활성 기관' : '활성 기관'}</p>
      </Card>
      <section className="min-w-0 space-y-4"><h2 className="font-semibold">기관 담당자 명단</h2><p className="text-sm text-neutral-600">역할은 이 기관의 실제 업무에서 계산한 표시값입니다. 다른 기관 출처·개인 OWNER·ACL은 별도이며, 표시 역할만으로 업무를 허용하지 않습니다.</p>
        <div className="flex flex-wrap gap-3"><Input aria-label="기관 명단 검색" className="max-w-xs" value={list.q} placeholder="이름 또는 이메일" onChange={(event) => change({ q: event.target.value }, true)} />
          <Select aria-label="기관 표시 역할 필터" className="w-44" value={list.role ?? ''} onChange={(event) => change({ role: event.target.value }, true)}><option value="">모든 표시 역할</option>{ORG_ROLES.map((role) => <option key={role} value={role}>{USER_ROLE_LABELS[role]}</option>)}</Select>
          <Select aria-label="계정 상태 필터" className="w-44" value={list.status ?? ''} onChange={(event) => change({ status: event.target.value }, true)}><option value="">모든 계정 상태</option>{Object.entries(USER_STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</Select></div>
        <p className="text-sm">전체 담당자 {data.members.length}명 · 조건에 맞는 명단 {list.total}명</p>
        <Card><Table><THead><TR><TH>사용자</TH><TH>표시 역할·상태</TH><TH>이 기관의 권한</TH><TH>신청 메일</TH></TR></THead><TBody>{list.rows.map((member) => <TR key={member.userId}><TD>{canProfile ? <Link className="font-medium text-primary-700 hover:underline" to={adminPaths.users(orgId, member.userId)}>{member.name}</Link> : member.name}<span className="block text-xs">{member.email}</span></TD><TD>{USER_ROLE_LABELS[member.role]}<span className="block text-xs">{USER_STATUS_LABELS[member.status]}</span></TD><TD><PermissionDescription member={member} />{member.permission && <span className="block text-xs">부여 원천 버전 {member.permission.revision}</span>}</TD><TD>{member.currentMailRecipient == null ? '조회 권한 없음' : <><Badge variant={member.currentMailRecipient ? 'success' : 'neutral'}>{member.currentMailRecipient ? '수신 가능' : '제외'}</Badge><span className="block text-xs">{orgRecipientReason(member.currentMailRecipient ? member.selectionReason : member.exclusionReason)}</span></>}</TD></TR>)}</TBody></Table>{list.rows.length === 0 && <p className="p-6 text-sm">조건에 맞는 담당자가 없습니다.</p>}</Card>
        <Pagination page={list.page} totalPages={list.totalPages} onPageChange={(page) => change({ page })} />
      </section>
    </>}
    {editing?.kind === 'permission' && <OperationsEditor initial={editing.initial} onClose={() => setEditing(null)} onSaved={onSaved} />}
    {editing?.kind === 'mail' && <RequestMailEditor initial={editing.initial} onClose={() => setEditing(null)} onSaved={onSaved} />}
  </div>
}

function PermissionDescription({ member }: { member: OrgOperationsMember }) {
  const permissions = useInstitutionPermissions()
  return <div className="max-w-xl whitespace-normal break-words text-sm"><p>{permissionSummary(member.permission, permissions.authority?.catalogue ?? [])}</p>
    {member.permission?.mode === 'SELECTED' && Object.keys(member.permission.scopes).length > 0 && <details className="mt-2"><summary>그룹별 공간 범위</summary>{Object.entries(member.permission.scopes).map(([group, value]) => <p className="mt-1 break-all" key={group}>{WORK_GROUP_LABELS[group as WorkGroup] ?? group}: {value.mode === 'ALL' ? '모든 워크스페이스' : value.workspaceIds.join(', ') || '빈 지정 목록 (허용 공간 없음)'}</p>)}</details>}
  </div>
}
