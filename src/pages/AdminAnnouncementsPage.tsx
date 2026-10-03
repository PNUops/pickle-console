import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createAnnouncement, fetchAnnouncement, fetchAdminWorkspace, fetchAdminWorkspaces, fetchAnnouncements, previewAnnouncement, type AnnouncementCreateRequest, type AnnouncementPreview, type AnnouncementView } from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { administeredOrgs, canBroadcast, canViewAudit, isOrgTier, isSysTier } from '../auth/permissions'
import { OperationResult } from '../components/OperationResult'
import { Alert, AnnouncementScopeBadge, Button, Card, Drawer, FormField, Input, Modal, Pagination, Select, Spinner, Table, TBody, TD, TH, THead, TR, Textarea } from '../components/ui'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatDateTime } from '../lib/format'
import { useAdminScope } from '../lib/use-admin-scope'
import { adminPath, adminPaths } from '../lib/paths'
import { useListUrl } from '../lib/use-list-url'
import { listPage } from '../lib/list-url'
import { useActiveResult } from '../lib/use-active-result'
import { isUuid } from '../lib/validation'

type TargetKind = 'NONE' | 'ALL' | 'ORG' | 'WORKSPACE'
interface Reviewed { body: AnnouncementCreateRequest; preview: AnnouncementPreview }

export function AdminAnnouncementsPage() {
  const { user } = useAuth()
  const scope = useAdminScope()
  const role = scope.tier === 'org' ? scope.activeOrgRole : user?.role
  const canSend = !!role && canBroadcast(role)
  const [params, change, normalize] = useListUrl()
  const page = listPage(params.get('page'))
  const rawSelected = params.get('selected')
  const selected = rawSelected && isUuid(rawSelected) ? rawSelected.toLowerCase() : null
  const listRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const next = new URLSearchParams(params)
    if (page === 0) next.delete('page')
    else next.set('page', String(page))
    if (selected) next.set('selected', selected)
    normalize(next.toString())
  }, [normalize, page, params, selected])
  const recent = useQuery({ queryKey: ['admin', 'announcements', 'list', page], queryFn: () => fetchAnnouncements({ page, size: 10 }) })
  const close = () => {
    change({ selected: undefined })
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-announcement-id="${selected}"]`)?.focus())
  }
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-neutral-900">알림 보내기</h1><p className="mt-1 text-sm text-neutral-500">대상 미리보기 후 발송건과 콘솔 알림을 저장하고 이메일 큐에 접수합니다. SMTP 인계 결과는 발송 이력에서 확인합니다.</p></div>
    {canSend && <AnnouncementEditor onSelected={(id) => change({ selected: id })} />}
    <section className="space-y-4" ref={listRef}><h2 className="font-semibold">발송한 알림</h2>
      {recent.isPending && <Spinner label="발송 목록 불러오는 중" />}
      {recent.isError && <Alert variant="danger">{recent.error.message}<Button variant="secondary" onClick={() => void recent.refetch()}>발송 목록 다시 조회</Button></Alert>}
      {recent.isSuccess && <><Card><Table><THead><TR><TH>제목</TH><TH>저장된 대상</TH><TH>발송 당시 인원</TH><TH>저장 시각</TH><TH>결과</TH></TR></THead><TBody>{recent.data.content.map((announcement) => <TR key={announcement.id}>
        <TD><button type="button" data-announcement-id={announcement.id} className="cursor-pointer text-left font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring" onClick={() => change({ selected: announcement.id })}>{announcement.title}</button></TD>
        <TD><AnnouncementScopeBadge scope={announcement.scope} /></TD><TD>{announcement.recipientCount}명</TD><TD className="text-xs">{formatDateTime(announcement.createdAt)}</TD>
        <TD>{user && isSysTier(user.role) && <Link className="text-primary-700 hover:underline" to={adminPaths.mailDeliveries({ announcementId: announcement.id })}>수신자별 발송 결과</Link>}</TD>
      </TR>)}</TBody></Table>{recent.data.content.length === 0 && <p className="p-5 text-sm text-neutral-500">발송한 알림이 없습니다.</p>}</Card><Pagination page={recent.data.page} totalPages={recent.data.totalPages} onPageChange={(nextPage) => change({ page: nextPage, selected: undefined })} /></>}
    </section>
    {rawSelected && !selected && <Alert variant="danger">발송건 ID가 올바르지 않습니다.<Button variant="secondary" onClick={close}>상세 선택 지우기</Button></Alert>}
    <Drawer open={!!selected} onClose={close} title="알림 발송건 상세">{selected && <AnnouncementDetail key={selected} announcementId={selected} />}</Drawer>
  </div>
}

function AnnouncementEditor({ onSelected }: { onSelected: (id: string) => void }) {
  const { user } = useAuth()
  const scope = useAdminScope()
  const active = useActiveResult()
  const isSysAdmin = user?.role === 'SYS_ADMIN'
  const administered = administeredOrgs(user?.managedOrgs ?? []).filter((org) => scope.tier === 'system' || org.orgId === scope.activeOrgId)
  const orgOptions = isSysAdmin ? scope.options : administered.map((org) => ({ id: org.orgId, name: org.orgName }))
  const initialOrgId = scope.activeOrgId ?? (orgOptions.length === 1 ? orgOptions[0].id : '')
  const [target, setTarget] = useState<TargetKind>(initialOrgId ? 'ORG' : 'NONE')
  const [orgId, setOrgId] = useState(initialOrgId)
  const [workspaceId, setWorkspaceId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState<Reviewed | null>(null)
  const [confirming, setConfirming] = useState<Reviewed | null>(null)
  const [saved, setSaved] = useState<AnnouncementView | null>(null)
  const generation = useRef(0)
  const edit = () => { generation.current += 1; setReviewed(null); setConfirming(null); setSaved(null); setError(null) }
  const workspaces = useQuery({ queryKey: ['admin', 'workspaces', { orgId: orgId || null }], queryFn: () => fetchAdminWorkspaces({ orgId: orgId || undefined }), enabled: target === 'WORKSPACE' && !!orgId })
  const preview = useMutation({ mutationFn: ({ request }: { request: AnnouncementCreateRequest; generation: number }) => previewAnnouncement(request), onSuccess: (result, variables) => {
    if (!active.current || variables.generation !== generation.current) return
    setReviewed({ body: variables.request, preview: result }); setError(null)
  }, onError: (err, variables) => {
    if (!active.current || variables.generation !== generation.current) return
    const problem = toApiError(err, '발송 대상을 확인하지 못했습니다.')
    setFieldErrors(fieldErrorsOf(problem.problem)); setError(problem.message)
  } })
  const targetLabel = (request: AnnouncementCreateRequest) => request.scope === 'ALL' ? '전체 사용자' : request.scope === 'ORG' ? `기관 '${orgOptions.find((org) => org.id === request.orgId)?.name ?? request.orgId}'` : `워크스페이스 '${workspaces.data?.find((workspace) => workspace.id === request.workspaceId)?.name ?? request.workspaceId}'`
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError(null); setSaved(null)
    const errors: Record<string, string> = {}
    if (!title.trim()) errors.title = '제목을 입력해 주세요.'
    else if (title.length > 200) errors.title = '제목은 200자 이하여야 합니다.'
    if (!body.trim()) errors.body = '내용을 입력해 주세요.'
    else if (body.length > 10_000) errors.body = '본문은 10,000자 이하여야 합니다.'
    if (target === 'NONE') errors.target = '발송 대상을 선택해 주세요.'
    if ((target === 'ORG' || target === 'WORKSPACE') && !orgId) errors.orgId = '대상 기관을 선택해 주세요.'
    if (target === 'WORKSPACE' && !workspaceId) errors.workspaceId = '대상 워크스페이스를 선택해 주세요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    const request: AnnouncementCreateRequest = target === 'ALL' ? { title: title.trim(), body: body.trim(), scope: 'ALL' } : target === 'ORG' ? { title: title.trim(), body: body.trim(), scope: 'ORG', orgId } : { title: title.trim(), body: body.trim(), scope: 'WORKSPACE', workspaceId }
    preview.mutate({ request, generation: generation.current })
  }
  return <Card className="space-y-5 p-5">
    {saved && <OperationResult stage="stored">발송건 '{saved.title}'과 {saved.recipientCount}명의 콘솔 알림을 저장하고 이메일 큐에 접수했습니다. SMTP 인계 완료를 뜻하지 않습니다. <Button size="sm" variant="secondary" onClick={() => onSelected(saved.id)}>저장한 발송건 보기</Button>{user && isSysTier(user.role) && <Link className="ml-3 text-primary-700 underline" to={adminPaths.mailDeliveries({ announcementId: saved.id })}>수신자별 발송 결과</Link>}</OperationResult>}
    {error && <Alert variant="danger">{error}</Alert>}
    <form className="space-y-4" onSubmit={submit} noValidate>
      <FormField label="제목" required error={fieldErrors.title}><Input value={title} maxLength={200} onChange={(event) => { edit(); setTitle(event.target.value) }} placeholder="예: 서비스 점검 안내" /></FormField>
      <FormField label="내용" required error={fieldErrors.body} description="서식 없는 평문으로 콘솔 알림과 이메일에 사용됩니다."><Textarea value={body} maxLength={10_000} rows={5} onChange={(event) => { edit(); setBody(event.target.value) }} /></FormField>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">대상</legend><div className="flex flex-wrap gap-4">
        {isSysAdmin && <label className="text-sm"><input type="radio" name="announcement-target" checked={target === 'ALL'} onChange={() => { edit(); setTarget('ALL'); setWorkspaceId('') }} /> 전체</label>}
        <label className="text-sm"><input type="radio" name="announcement-target" checked={target === 'ORG'} onChange={() => { edit(); setTarget('ORG'); setWorkspaceId('') }} /> {isSysAdmin || orgOptions.length !== 1 ? '특정 기관' : `${orgOptions[0].name} 전체`}</label>
        <label className="text-sm"><input type="radio" name="announcement-target" checked={target === 'WORKSPACE'} onChange={() => { edit(); setTarget('WORKSPACE'); setWorkspaceId('') }} /> 특정 워크스페이스</label>
      </div>{fieldErrors.target && <p role="alert" className="text-sm text-danger-700">{fieldErrors.target}</p>}</fieldset>
      {(target === 'ORG' || target === 'WORKSPACE') && <FormField label="대상 기관" required error={fieldErrors.orgId}><Select value={orgId} onChange={(event) => { edit(); setOrgId(event.target.value); setWorkspaceId('') }}><option value="">기관 선택</option>{orgOptions.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</Select></FormField>}
      {target === 'WORKSPACE' && <FormField label="대상 워크스페이스" required error={fieldErrors.workspaceId}><Select value={workspaceId} disabled={!orgId || workspaces.isPending} onChange={(event) => { edit(); setWorkspaceId(event.target.value) }}><option value="">워크스페이스 선택</option>{workspaces.data?.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</Select>{workspaces.isError && <Alert variant="danger">{workspaces.error.message}</Alert>}</FormField>}
      <Button type="submit" loading={preview.isPending}>발송 대상 미리보기</Button>
    </form>
    {reviewed && <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">발송 전 대상 확인</h2><p className="text-sm">{targetLabel(reviewed.body)} · 예상 {reviewed.preview.recipientCount}명 · 조회 {formatDateTime(reviewed.preview.observedAt)}</p>
      <p className="text-xs text-neutral-600">미리보기는 현재 예상 대상입니다. 실제 발송건 저장 시 활성 명단과 주소를 다시 선정하므로 인원은 달라질 수 있습니다. 큐 접수 후에는 수신자와 주소를 유지합니다.</p>
      <h3 className="font-medium">{reviewed.body.title}</h3><p className="whitespace-pre-line text-sm">{reviewed.body.body}</p>
      {reviewed.preview.warnings.map((warning) => <Alert key={warning} variant="warning">{warning}</Alert>)}
      {reviewed.preview.sample.length > 0 && <Table><THead><TR><TH>예상 수신자</TH><TH>현재 이메일</TH></TR></THead><TBody>{reviewed.preview.sample.map((recipient) => <TR key={recipient.userId}><TD>{recipient.name}</TD><TD className="break-all">{recipient.email}</TD></TR>)}</TBody></Table>}
      {reviewed.preview.truncated && <p className="text-xs">조회 가능한 수신자 일부를 표시합니다.</p>}
      <Button onClick={() => setConfirming(reviewed)}>검토한 알림 발송</Button>
    </section>}
    {confirming && <AnnouncementSendConfirmation key={generation.current} reviewed={confirming} label={targetLabel(confirming.body)} onClose={() => setConfirming(null)} onStored={(created) => { setConfirming(null); setReviewed(null); setSaved(created); setTitle(''); setBody('') }} />}
  </Card>
}

function AnnouncementSendConfirmation({ reviewed, label, onClose, onStored }: { reviewed: Reviewed; label: string; onClose: () => void; onStored: (created: AnnouncementView) => void }) {
  const active = useActiveResult()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const send = useMutation({ mutationFn: () => createAnnouncement(reviewed.body), onSuccess: async (created) => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] })
    if (active.current) onStored(created)
  }, onError: (err) => { if (active.current) setError(toApiError(err, '알림을 발송하지 못했습니다.').message) } })
  return <Modal open onClose={onClose} title="알림 발송 확인" footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button loading={send.isPending} onClick={() => send.mutate()}>발송</Button></>}>
    <div className="space-y-3"><p className="text-sm"><strong>{label}</strong>에게 <strong>{reviewed.body.title}</strong> 발송건을 저장합니다. 예상 대상 {reviewed.preview.recipientCount}명이며 실제 저장 시 인원과 주소를 확정합니다. 발송 후 이메일을 회수할 수 없습니다.</p>{error && <Alert variant="danger">{error}</Alert>}</div>
  </Modal>
}

function AnnouncementDetail({ announcementId }: { announcementId: string }) {
  const { user } = useAuth()
  const scope = useAdminScope()
  const query = useQuery({ queryKey: ['admin', 'announcements', 'detail', announcementId], queryFn: () => fetchAnnouncement(announcementId) })
  const workspaceId = query.data?.workspaceId
  const workspace = useQuery({ queryKey: ['admin', 'workspaces', 'detail', workspaceId ?? null], queryFn: () => fetchAdminWorkspace(workspaceId!), enabled: !!workspaceId && !!user && (isSysTier(user.role) || isOrgTier(user.role)) })
  if (query.isPending) return <Spinner label="발송건 상세 불러오는 중" />
  if (query.isError) return <Alert variant="danger">{query.error.message}<Button variant="secondary" onClick={() => void query.refetch()}>발송건 상세 다시 조회</Button></Alert>
  const saved = query.data
  const sys = !!user && isSysTier(user.role)
  const mayReadOrg = !!saved.orgId && (sys || !!user?.managedOrgs.some((org) => org.orgId === saved.orgId))
  const auditRole = scope.tier === 'org' ? scope.activeOrgRole : user?.role
  const orgName = scope.options.find((org) => org.id === saved.orgId)?.name
  return <div className="space-y-5"><h3 className="text-lg font-semibold">{saved.title}</h3><AnnouncementScopeBadge scope={saved.scope} />
    <p className="text-sm">발송 당시 수신자 {saved.recipientCount}명 · 저장 {formatDateTime(saved.createdAt)}</p>
    <dl className="space-y-2 text-sm">
      {saved.orgId && <div><dt className="text-neutral-500">대상 기관</dt><dd>{orgName ?? '이름 확인 불가'}</dd></div>}
      {saved.workspaceId && <div><dt className="text-neutral-500">대상 워크스페이스</dt><dd>{!workspace.isError && workspace.data?.name ? workspace.data.name : workspace.isPending ? '이름 조회 중' : '이름 확인 불가'}</dd></div>}
    </dl>
    <p className="whitespace-pre-line text-sm leading-relaxed">{saved.body}</p>
    <p className="text-xs text-neutral-600">저장된 발송 대상과 인원입니다. 현재 명단으로 다시 계산하지 않으며 SMTP 인계 결과는 별도 이력입니다.</p>
    <nav aria-label="발송건 관련 업무" className="flex flex-wrap gap-3 text-sm text-primary-700">
      {sys && <Link to={adminPaths.mailDeliveries({ announcementId: saved.id })}>수신자별 발송 결과</Link>}
      {mayReadOrg && <Link to={adminPaths.orgOperations(saved.orgId!)}>대상 기관 운영</Link>}
      {saved.workspaceId && <Link to={adminPath(`/admin/workspaces?workspaceId=${saved.workspaceId}`, saved.orgId ?? undefined)}>대상 워크스페이스</Link>}
      {auditRole && canViewAudit(auditRole) && <Link to={adminPath(adminPaths.auditTarget('announcement', saved.id), sys ? undefined : scope.activeOrgId)}>발송건 감사</Link>}
    </nav>
  </div>
}
