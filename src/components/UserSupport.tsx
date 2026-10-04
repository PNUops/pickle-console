import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchUserResourceAccess, fetchUserSupport, type ProfileImpact, type UserResourceAccess } from '../api/admin-user-support'
import { applyAdminBulkChange, fetchAdminUser, previewAdminBulkChange, type AdminBulkChangeApply, type AdminBulkChangePreview, type AdminBulkChangeRequest, type ResourceType } from '../api/queries'
import { Alert, Badge, Button, Card, DataTable, DomainStatusBadge, FormField, Input, LlmKeyStatusBadge, Modal, Select, Spinner, TBody, TD, TH, THead, TR, VmStatusBadge } from './ui'
import { GpuStatusBadge } from './gpu/GpuStatus'
import { RESOURCE_TYPES } from './resource/registry'
import { RESOURCE_ROLE_LABELS, USER_STATUS_LABELS, WORKSPACE_ROLE_LABELS, labelForBulkReason, labelForBulkResult, labelForWorkspaceKind } from '../lib/labels'
import { REQUEST_STATUS_LABELS, type DomainStatus, type LlmApiKeyStatus, type VmStatus } from '../lib/status'
import { requestRecipientStatusLabel } from '../lib/request-recipient-status'
import { adminPaths } from '../lib/paths'
import { formatDateTime } from '../lib/format'
import { useAdminScope } from '../lib/use-admin-scope'
import { useListUrl } from '../lib/use-list-url'
import { isUuid } from '../lib/validation'
import { useActiveResult } from '../lib/use-active-result'
import { gpuPreviewEnabled } from '../lib/gpu-preview'

const resourceName = (type: ResourceType) => RESOURCE_TYPES[type].label

function accessPath(path: string, type: ResourceType, id: string): string {
  const url = new URL(path, 'https://pickle.invalid')
  url.searchParams.set('resourceType', type)
  url.searchParams.set('resourceId', id)
  return `${url.pathname}${url.search}`
}

function adminResourcePath(type: ResourceType, id: string, orgId?: string): string | undefined {
  switch (type) {
    case 'VM': return adminPaths.vmDetail(id, orgId)
    case 'LLM_API_KEY': return adminPaths.llmKeyDetail(id, orgId)
    case 'GPU': return gpuPreviewEnabled() ? adminPaths.gpuDetail(id, orgId) : undefined
    case 'DOMAIN': return adminPaths.domains(orgId)
  }
}

function ResourceDetailLink({ resourceType, id, orgId, label }: { resourceType: ResourceType; id: string; orgId: string; label: string }) {
  const path = adminResourcePath(resourceType, id, orgId)
  return path ? <Link to={path} className="block text-primary-700 hover:underline">{label}</Link> : <p className="break-all text-neutral-500">자원 ID {id}</p>
}

function ResourceState({ resource }: { resource: UserResourceAccess }) {
  switch (resource.type) {
    case 'VM': return <VmStatusBadge status={resource.status as VmStatus} />
    case 'LLM_API_KEY': return <LlmKeyStatusBadge status={resource.status as LlmApiKeyStatus} />
    case 'DOMAIN': return <DomainStatusBadge status={resource.status as DomainStatus} />
    case 'GPU': return <GpuStatusBadge status={resource.status} />
  }
}

export function ProfileImpactView({ impact }: { impact: ProfileImpact }) {
  return <section aria-label="변경 영향" className="space-y-3 rounded-lg border border-neutral-200 p-3 text-sm [overflow-wrap:anywhere]">
    <h3 className="font-semibold">변경 영향</h3>
    <p>변경 후 계정 상태: {impact.candidateStatus === 'ACTIVE' ? '활성' : impact.candidateStatus === 'PENDING_VERIFICATION' ? '인증 대기' : impact.candidateStatus === 'DISABLED' ? '비활성' : '탈퇴'}</p>
    <p>{impact.claimsPossible
      ? '일치하는 대기 초대를 수락할 수 있습니다. 승인된 신청의 자원 생성은 대상자별 조건에 따라 접수됩니다.'
      : '이 변경만으로 초대 수락이나 자원 생성이 진행되지 않습니다.'}</p>
    {impact.invitations.length === 0 ? <p className="text-neutral-500">이 변경과 연결된 초대가 없습니다.</p>
      : <ul className="space-y-3">{impact.invitations.map((invitation) => <li key={invitation.id}>
        <span className="font-medium">{invitation.workspaceName}</span>{' '}
        <span>{labelForWorkspaceKind(invitation.workspaceKind)} / {WORKSPACE_ROLE_LABELS[invitation.role]}</span>
        {invitation.alreadyMember && <span className="block text-neutral-500">이미 구성원인 워크스페이스입니다.</span>}
        {invitation.recipients.length > 0 && <ul className="mt-1 space-y-1">{invitation.recipients.map((recipient, index) => <li key={`${recipient.requestId}-${index}`}>
          <Link to={adminPaths.requestDetail(recipient.requestId, recipient.orgId)} className="text-primary-700 hover:underline">{resourceName(recipient.type)} 신청</Link>{' '}
          {REQUEST_STATUS_LABELS[recipient.requestStatus]} / 현재 {requestRecipientStatusLabel(recipient.requestStatus, recipient.status, true)} → 예상 {requestRecipientStatusLabel(recipient.requestStatus, recipient.projectedStatus, true)}
          <span className="block text-neutral-500">부여 종료일 {recipient.grantedEndDate ?? (recipient.requestStatus === 'APPROVED' ? '무기한' : '승인 전')}</span>
        </li>)}</ul>}
      </li>)}</ul>}
    <p className="text-xs text-neutral-500">{formatDateTime(impact.observedAt)} 조회 기준입니다. 변경 후 관계와 신청 결과에서 실제 가입과 생성 상태를 확인해 주세요.</p>
  </section>
}

export function UserChangeOutcome({ impact, actualStatus }: { impact: ProfileImpact; actualStatus: keyof typeof USER_STATUS_LABELS }) {
  const invitationIds = new Set(impact.invitations.map((invitation) => invitation.id))
  const requestIds = new Set(impact.invitations.flatMap((invitation) => invitation.recipients.map((recipient) => recipient.requestId)))
  const results = useQuery({
    queryKey: ['admin', 'users', 'change-result', impact.userId, impact.observedAt],
    queryFn: () => fetchUserSupport(impact.userId),
    enabled: invitationIds.size > 0,
    refetchInterval: (query) => query.state.data?.requests.some((request) => requestIds.has(request.id) && (request.recipientStatus === 'QUEUED' || request.recipientStatus === 'CREATING'))
      || query.state.data?.resources.some((resource) => resource.requestId && requestIds.has(resource.requestId) && resource.status === 'CREATING') ? 5_000 : false,
  })
  const requests = results.data?.requests.filter((request) => requestIds.has(request.id)) ?? []
  return <Card className="space-y-3 p-4 text-sm [overflow-wrap:anywhere]">
    <section aria-label="계정 변경 후 연결 결과" className="space-y-3">
      <h2 className="font-semibold">계정 변경 후 연결 결과</h2>
      <p>변경 응답의 계정 상태: {USER_STATUS_LABELS[actualStatus]}</p>
      <p className="text-neutral-500">변경 전 확인한 초대와 신청의 현재 결과를 전체 기관에서 조회합니다.</p>
      <Link to={adminPaths.userSupport(impact.userId)} className="inline-flex text-primary-700 hover:underline">플랫폼 전체에서 사용자 관계 다시 조회</Link>
      {invitationIds.size === 0 ? <p>이 변경에서 확인한 초대 대상이 없습니다.</p>
        : results.isPending ? <Spinner label="계정 변경 후 실제 연결 결과 확인 중" />
          : results.isError ? <Alert variant="danger">{results.error.message}</Alert>
            : <>
              <ul className="space-y-2">{impact.invitations.map((before) => {
                const actual = results.data.invitations.find((invitation) => invitation.id === before.id)
                return <li key={before.id}>{before.workspaceName}: {actual ? actual.status === 'ACCEPTED' ? '가입 완료' : actual.status === 'PENDING' ? '초대 대기' : '초대 취소' : '현재 조회에서 초대를 확인하지 못했습니다.'}</li>
              })}</ul>
              {requests.length === 0 && requestIds.size > 0 && <p>현재 조회에서 연결된 신청 결과를 확인하지 못했습니다.</p>}
              <ul className="space-y-3">{requests.map((request) => <li key={`${request.id}-${request.recipientId ?? 'none'}`}>
                <Link className="text-primary-700 hover:underline" to={adminPaths.requestDetail(request.id, request.orgId)}>{request.orgName} / {resourceName(request.type)} 신청</Link>{' '}
                {request.recipientStatus ? requestRecipientStatusLabel(request.status, request.recipientStatus, true) : '대상자별 생성 상태 없음'}
                {request.resourceId && <ResourceDetailLink resourceType={request.type} id={request.resourceId} orgId={request.orgId} label="실제 자원 보기" />}
                {request.resourceId && results.data.resources.filter((resource) => resource.id === request.resourceId && resource.type === request.type).map((resource) => <ResourceState key={resource.id} resource={resource} />)}
                {request.reason && <p className="text-neutral-500">{request.reason}</p>}
              </li>)}</ul>
              <p className="text-xs text-neutral-500">{formatDateTime(results.data.observedAt)} 조회 기준</p>
              <Button size="sm" variant="secondary" loading={results.isFetching} onClick={() => void results.refetch()}>변경 후 결과 새로고침</Button>
            </>}
    </section>
  </Card>
}

export function UserSupportRelationships({ userId }: { userId: string }) {
  const { activeOrgId, activeOrg } = useAdminScope()
  const location = useLocation()
  const returnPath = `${location.pathname}${location.search}`
  const [receipt, setReceipt] = useState<GrantReceipt | null>(null)
  const support = useQuery({
    queryKey: ['admin', 'users', 'support', userId, activeOrgId ?? null],
    queryFn: () => fetchUserSupport(userId, activeOrgId),
    refetchInterval: (query) => query.state.data?.requests.some((request) => request.recipientStatus === 'QUEUED' || request.recipientStatus === 'CREATING')
      || query.state.data?.resources.some((resource) => resource.status === 'CREATING' || resource.status === 'DELETING') ? 5_000 : false,
  })
  if (support.isPending) return <><GrantReceiptCard receipt={receipt} /><Spinner label="사용자 관계와 신청 결과 불러오는 중" /></>
  if (support.isError) return <><GrantReceiptCard receipt={receipt} /><Alert variant="danger">{support.error.message}<Button variant="secondary" size="sm" onClick={() => void support.refetch()}>다시 조회</Button></Alert></>
  const data = support.data
  return <div className="space-y-6 [overflow-wrap:anywhere]">
    <GrantReceiptCard receipt={receipt} />
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p>{activeOrg?.name ?? '플랫폼 전체'} 자원과 신청 결과 / {formatDateTime(data.observedAt)} 조회</p>
      <Button variant="secondary" size="sm" loading={support.isFetching} onClick={() => void support.refetch()}>관계와 결과 새로고침</Button>
    </div>
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">워크스페이스 관계</h2>
      <p className="text-sm text-neutral-500">자원 개수에는 종료 이력을 포함하며 도메인은 VM에 연결한 이름도 포함합니다.</p>
      {data.memberships.length === 0 ? <p className="text-sm text-neutral-500">소속된 워크스페이스가 없습니다.</p> : <ul className="space-y-3 text-sm">{data.memberships.map((membership) => <li key={membership.workspaceId}>
        <Link to={adminPaths.workspaceDetail(membership.workspaceId, activeOrgId, 'members')} className="font-medium text-primary-700 hover:underline">{membership.workspaceName}</Link>{' '}
        {labelForWorkspaceKind(membership.workspaceKind)} / {WORKSPACE_ROLE_LABELS[membership.role]}
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-neutral-600">{membership.resourceCounts.map((count) => <li key={count.type}>{resourceName(count.type)} {count.count}개</li>)}</ul>
      </li>)}</ul>}
    </Card>
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">초대와 가입 결과</h2>
      {!data.invitationsVisible ? <p className="text-sm text-neutral-500">이 역할에서는 초대 대상 정보를 조회할 수 없습니다.</p>
        : data.invitations.length === 0 ? <p className="text-sm text-neutral-500">조회 가능한 연결 초대가 없습니다.</p>
          : <ul className="space-y-3 text-sm">{data.invitations.map((invitation) => <li key={invitation.id}>
            <Link to={adminPaths.workspaceDetail(invitation.workspaceId, activeOrgId, 'members')} className="text-primary-700 hover:underline">{invitation.workspaceName}</Link>{' '}
            <Badge variant={invitation.status === 'ACCEPTED' ? 'success' : 'warning'}>{invitation.status === 'ACCEPTED' ? '가입 완료' : invitation.status === 'PENDING' ? '초대 대기' : '초대 취소'}</Badge>
            {invitation.acceptedAt && <p className="mt-1 text-neutral-500">가입 시각 {formatDateTime(invitation.acceptedAt)}</p>}
          </li>)}</ul>}
    </Card>
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">신청과 대상자별 결과</h2>
      {data.requests.length === 0 ? <p className="text-sm text-neutral-500">현재 관리 범위에서 연결된 신청이 없습니다.</p> : <DataTable caption="사용자 관련 신청 결과">
        <THead><TR><TH>신청</TH><TH>관계</TH><TH>검토</TH><TH>생성 결과</TH><TH>기간</TH></TR></THead>
        <TBody>{data.requests.map((request) => <TR key={`${request.id}-${request.recipientId ?? 'applicant'}`}>
          <TD><Link to={adminPaths.requestDetail(request.id, request.orgId)} className="text-primary-700 hover:underline">{resourceName(request.type)} 신청</Link><span className="block text-xs text-neutral-500">{request.workspaceName} / {request.orgName}</span></TD>
          <TD>{request.applicant ? '신청자' : request.recipientId ? '대상자' : '워크스페이스 구성원'}{request.applicant && request.recipientId && ' / 대상자'}</TD>
          <TD>{REQUEST_STATUS_LABELS[request.status]}</TD>
          <TD>{request.recipientStatus ? requestRecipientStatusLabel(request.status, request.recipientStatus, true) : '대상자별 생성 상태 없음'}
            {request.resourceId && <ResourceDetailLink resourceType={request.type} id={request.resourceId} orgId={request.orgId} label={request.type === 'DOMAIN' ? '도메인 목록' : '실제 자원 보기'} />}
            {request.reason && <p className="mt-1 text-xs text-neutral-500">{request.reason}</p>}
          </TD>
          <TD>{request.grantedEndDate ?? (request.status === 'APPROVED' ? '무기한' : '부여 전')}</TD>
        </TR>)}</TBody>
      </DataTable>}
    </Card>
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">자원 접근과 남은 권한</h2>
      <p className="text-sm text-neutral-500">도메인 접근 조건은 VM에 연결하지 않은 독립 도메인을 대상으로 합니다.</p>
      {data.resources.length === 0 ? <p className="text-sm text-neutral-500">현재 관리 범위에서 연결된 자원이 없습니다.</p> : <ul className="space-y-3 text-sm">{data.resources.map((resource) => <li key={`${resource.type}-${resource.id}`} className="rounded border border-neutral-200 p-3">
        <Link to={accessPath(returnPath, resource.type, resource.id)} className="font-medium text-primary-700 hover:underline">{resource.name} 접근 조건</Link>
        <p className="mt-1 text-neutral-500">{resourceName(resource.type)} / {resource.orgName} / {resource.workspaceName}</p>
        <AccessSummary resource={resource} userId={userId} onRevokeResult={setReceipt} />
      </li>)}</ul>}
    </Card>
  </div>
}

const REASONS: Record<string, string> = {
  ACCOUNT_INACTIVE: '계정이 활성 상태가 아닙니다.',
  NOT_WORKSPACE_MEMBER: '이 자원의 워크스페이스 구성원이 아닙니다.',
  NO_RESOURCE_GRANT: '실효 자원 접근 권한이 없습니다.',
  RESOURCE_ENDED: '사용 기간이 지났거나 종료 상태입니다.',
  RESOURCE_NOT_READY: '이 자원은 아직 이용 준비가 완료되지 않았습니다.',
}

const REVOKE_REASONS: Record<string, string> = {
  FORBIDDEN: '이 역할과 관리 기관에서는 사용자 지정 권한을 회수할 수 없습니다.',
  RESOURCE_NOT_FOUND: '이미 제거된 자원의 사용자 지정 권한은 이 화면에서 회수할 수 없습니다.',
  NO_PERSONAL_GRANT: '이 사용자에게 직접 부여된 권한이 없습니다.',
  ALLOWED: '현재 사용자 지정 권한을 회수할 수 있습니다.',
}

type GrantReceipt = { userId: string; type: ResourceType; resourceId: string; name: string; result: AdminBulkChangeApply }

function GrantReceiptCard({ receipt }: { receipt: GrantReceipt | null }) {
  return receipt && <Card className="space-y-2 p-4 text-sm">
    <section aria-label="최근 권한 회수 결과" className="space-y-2">
      <h2 className="font-semibold">최근 권한 회수 결과</h2>
      <p>{resourceName(receipt.type)} / {receipt.name}</p>
      <p className="break-all text-neutral-500">사용자 ID {receipt.userId} / 자원 ID {receipt.resourceId}</p>
      {receipt.result.items.map((item) => <p key={item.targetId} role="status">{item.name ?? receipt.name}: {labelForBulkResult(item.result)}{item.reason && ` / ${labelForBulkReason(item.reason)}`}</p>)}
      <p className="break-all text-neutral-500">처리 ID {receipt.result.batchId}</p>
    </section>
  </Card>
}

function AccessSummary({ resource, userId, onRevokeResult }: { resource: UserResourceAccess; userId: string; onRevokeResult?: (receipt: GrantReceipt) => void }) {
  return <div className="mt-2 space-y-2">
    <ResourceState resource={resource} />
    <p>구성원: {resource.workspaceRole ? WORKSPACE_ROLE_LABELS[resource.workspaceRole] : '아님'} / 실효 등급: {resource.effectiveRole ? RESOURCE_ROLE_LABELS[resource.effectiveRole] : '없음'}</p>
    <p>사용자 지정 권한: {resource.personalGrantRole ? RESOURCE_ROLE_LABELS[resource.personalGrantRole] : '없음'} / 워크스페이스 전체 권한: {resource.workspaceGrantRole ? RESOURCE_ROLE_LABELS[resource.workspaceGrantRole] : '없음'}</p>
    {resource.reasons.length > 0 ? <ul className="list-inside list-disc text-danger-700">{resource.reasons.map((reason) => <li key={reason}>{REASONS[reason] ?? reason}</li>)}</ul>
      : <p className="text-neutral-600">계정과 구성원, 자원 권한의 기본 조건을 충족합니다. 실제 접속 조건은 자원 상세에서 확인해 주세요.</p>}
    {resource.standingRights && <p className="text-neutral-600">워크스페이스 소유자의 상시권은 접근 권한 목록과 삭제에 관한 권한이며 자원 이용 등급과 별개입니다.</p>}
    {resource.personalGrantRole && <p className="text-neutral-500">{resource.canRevoke ? '사용자 지정 권한은 현재 계정 상태와 구성원 여부에 관계없이 회수할 수 있습니다.' : REVOKE_REASONS[resource.revokeReason] ?? '현재 조건에서는 사용자 지정 권한을 회수할 수 없습니다.'}</p>}
    <RevokeUserGrant resource={resource} userId={userId} onResult={onRevokeResult} />
  </div>
}

function RevokeUserGrant({ resource, userId, onResult }: { resource: UserResourceAccess; userId: string; onResult?: (receipt: GrantReceipt) => void }) {
  const client = useQueryClient()
  const active = useActiveResult()
  const surface = useRef(0)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<AdminBulkChangePreview | null>(null)
  const [result, setResult] = useState<AdminBulkChangeApply | null>(null)
  const user = useQuery({ queryKey: ['admin', 'users', 'detail', userId], queryFn: () => fetchAdminUser(userId), enabled: open })
  const request: AdminBulkChangeRequest = {
    targetType: resource.type === 'LLM_API_KEY' ? 'LLM_KEY' : resource.type === 'GPU' ? 'GPU_ALLOCATION' : resource.type,
    targetIds: [resource.id], change: { kind: 'ACCESS', access: { action: 'REVOKE', userId } },
  }
  const read = useMutation({ mutationFn: (_version: number) => previewAdminBulkChange(request), onSuccess: (data, version) => {
    if (active.current && surface.current === version) setPreview(data)
  } })
  const apply = useMutation({
    mutationFn: ({ judged }: { judged: AdminBulkChangePreview; version: number }) => applyAdminBulkChange({ ...request, fingerprints: Object.fromEntries(judged.items.map((item) => [item.targetId, item.fingerprint])) }),
    onSuccess: async (data, { version }) => {
      if (active.current && surface.current === version) {
        setResult(data); setPreview(null)
        onResult?.({ userId, type: resource.type, resourceId: resource.id, name: data.items[0]?.name ?? resource.name, result: data })
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin', 'users'] }),
        client.invalidateQueries({ queryKey: ['admin', 'audit'] }),
      ])
    },
  })
  const close = () => { if (!apply.isPending) { surface.current += 1; setOpen(false); setPreview(null); read.reset(); apply.reset() } }
  const previousRole = preview?.items[0]?.fields.find((field) => field.field === 'role')?.oldValue
  const previousRoleLabel = typeof previousRole === 'string' && Object.hasOwn(RESOURCE_ROLE_LABELS, previousRole)
    ? RESOURCE_ROLE_LABELS[previousRole as keyof typeof RESOURCE_ROLE_LABELS] : '현재 등급 확인 필요'
  return <>
    {resource.canRevoke && <Button variant="secondary" size="sm" onClick={() => {
      surface.current += 1; setOpen(true); setResult(null); setPreview(null); apply.reset(); read.mutate(surface.current)
    }}>사용자 지정 권한 회수</Button>}
    {result && !open && <p role="status">{result.items.map((item) => labelForBulkResult(item.result)).join(', ')} / 처리 ID {result.batchId}</p>}
    <Modal open={open} onClose={close} title="사용자 지정 권한 회수" footer={<>
      <Button variant="secondary" disabled={apply.isPending} onClick={close}>{result ? '결과 닫기' : '취소'}</Button>
      {!result && <Button variant="danger" disabled={!preview?.items[0]?.applicable || user.isPending || user.isError} loading={apply.isPending}
        onClick={() => preview && apply.mutate({ judged: preview, version: surface.current })}>미리보기 확인 후 회수</Button>}
    </>}>
      <div className="space-y-3 text-sm [overflow-wrap:anywhere]">
        <p className="break-all">대상 사용자: {user.data?.name ?? userId} / {userId}</p>
        <p className="break-all">대상 자원: {preview?.items[0]?.name ?? resource.name} / {resourceName(resource.type)} / {resource.id}</p>
        <p>{resource.orgName} / {resource.workspaceName}</p>
        <p>이 사용자에게 직접 부여된 권한을 회수합니다. 워크스페이스 전체 권한은 유지됩니다.</p>
        {read.isPending && <Spinner label="현재 권한과 회수 조건 확인 중" />}
        {read.isError && <Alert variant="danger">{read.error.message}</Alert>}
        {preview && <p>{preview.items[0]?.applicable ? `회수할 등급: ${previousRoleLabel}` : preview.items[0]?.reason ? labelForBulkReason(preview.items[0].reason) : '이 대상의 회수 결과를 확인하지 못했습니다.'}</p>}
        {apply.isError && <Alert variant="danger">{apply.error.message}</Alert>}
        {result && <section aria-label="권한 회수 결과" className="space-y-2">
          {result.items.map((item) => <p key={item.targetId} role="status">{item.name ?? resource.name}: {labelForBulkResult(item.result)}{item.reason && ` / ${labelForBulkReason(item.reason)}`}</p>)}
          <p className="break-all text-neutral-500">처리 ID {result.batchId}</p>
          {result.items.some((item) => item.result === 'STALE') && <Button variant="secondary" onClick={() => { setResult(null); read.mutate(surface.current) }}>최신 권한 다시 비교</Button>}
        </section>}
      </div>
    </Modal>
  </>
}

export function UserAccessDiagnostic({ userId }: { userId: string }) {
  const { activeOrgId } = useAdminScope()
  const [params, change] = useListUrl()
  const targetType = Object.keys(RESOURCE_TYPES).find((type) => type === params.get('resourceType')) as ResourceType | undefined
  const targetId = params.get('resourceId') ?? ''
  const [inputType, setInputType] = useState<ResourceType>(targetType ?? 'VM')
  const [inputId, setInputId] = useState(targetId)
  const [validation, setValidation] = useState(false)
  const diagnostic = useQuery({
    queryKey: ['admin', 'users', 'access', userId, activeOrgId ?? null, targetType, targetId],
    queryFn: () => fetchUserResourceAccess(userId, targetType!, targetId, activeOrgId),
    enabled: !!targetType && isUuid(targetId),
  })
  return <Card className="space-y-4 p-4">
    <h2 className="font-semibold">이 사용자의 접근 조건</h2>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault()
      setValidation(!isUuid(inputId.trim()))
      if (isUuid(inputId.trim())) change({ resourceType: inputType, resourceId: inputId.trim().toLowerCase() })
    }}>
      <FormField label="자원 종류"><Select value={inputType} onChange={(event) => setInputType(event.target.value as ResourceType)}>{Object.entries(RESOURCE_TYPES).map(([type, view]) => <option key={type} value={type}>{view.label}</option>)}</Select></FormField>
      <FormField label="자원 ID" error={validation ? '자원 ID를 UUID 형식으로 입력해 주세요.' : undefined}><Input value={inputId} onChange={(event) => setInputId(event.target.value)} autoComplete="off" className="w-full sm:w-80" /></FormField>
      <Button type="submit">접근 조건 조회</Button>
    </form>
    {targetId && (!targetType || !isUuid(targetId)) && <Alert variant="danger">자원 종류와 ID를 확인해 주세요.</Alert>}
    {diagnostic.isFetching && <Spinner label="자원 접근 조건 확인 중" />}
    {diagnostic.isError && <Alert variant="danger">{diagnostic.error.message}</Alert>}
    {diagnostic.isSuccess && <section className="rounded border border-neutral-200 p-3 text-sm" aria-label="자원 접근 조회 결과">
      <h3 className="font-semibold">{diagnostic.data.name}</h3>
      <p className="break-all text-neutral-500">{resourceName(diagnostic.data.type)} / {diagnostic.data.id}</p>
      <p className="mt-1">{diagnostic.data.workspaceName} / {diagnostic.data.orgName}</p>
      <AccessSummary resource={diagnostic.data} userId={userId} />
      <ResourceDetailLink resourceType={diagnostic.data.type} id={diagnostic.data.id} orgId={diagnostic.data.orgId} label={diagnostic.data.type === 'DOMAIN' ? '도메인 목록 열기' : '자원 상세 열기'} />
    </section>}
  </Card>
}
