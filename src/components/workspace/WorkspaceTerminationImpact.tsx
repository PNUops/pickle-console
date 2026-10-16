import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import type { components } from '../../api/schema'
import { requestReaderKey } from '../../api/request-review'
import { fetchWorkspaceTerminationImpact } from '../../api/workspace-termination'
import { useAuth } from '../../auth/auth-context'
import { useActiveResult } from '../../lib/use-active-result'
import { formatDateTime } from '../../lib/format'
import { adminPaths, consolePaths } from '../../lib/paths'
import { withListReturn } from '../../lib/list-url'
import { DOMAIN_STATUS_LABELS, LLM_KEY_STATUS_LABELS, REQUEST_STATUS_LABELS, VM_STATUS_LABELS } from '../../lib/status'
import { GPU_ALLOCATION_LABELS } from '../gpu/GpuStatus'
import { gpuPreviewEnabled } from '../../lib/gpu-preview'
import { requestRecipientStatusLabel } from '../../lib/request-recipient-status'
import { resourceTypeEntry } from '../resource/registry'
import { Alert, Badge, Button, Modal, Spinner } from '../ui'

type Impact = components['schemas']['WorkspaceTerminationImpactResponse']
type Target = components['schemas']['WorkspaceTerminationTargetResponse']
type BlockingResource = components['schemas']['WorkspaceTerminationResourceResponse']

export function WorkspaceTerminationImpactButton({ workspaceId, invitationId, admin = false, targetLabel }: {
  workspaceId: string
  invitationId?: string
  admin?: boolean
  targetLabel?: string
}) {
  const { user } = useAuth()
  const location = useLocation()
  const source = `${location.pathname}${location.search}`
  const org = new URLSearchParams(location.search).get('org') ?? 'all'
  return <TerminationImpactAction key={`${admin ? 'support' : 'owner'}:${workspaceId}:${invitationId ?? 'workspace'}:${requestReaderKey(user)}:${location.pathname}:${org}`}
    workspaceId={workspaceId} invitationId={invitationId} admin={admin} targetLabel={targetLabel} source={source} />
}

function TerminationImpactAction({ workspaceId, invitationId, admin, targetLabel, source }: {
  workspaceId: string
  invitationId?: string
  admin: boolean
  targetLabel?: string
  source: string
}) {
  const active = useActiveResult()
  const generation = useRef(0)
  const loadingRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [impact, setImpact] = useState<Impact | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [resources, setResources] = useState<BlockingResource[]>([])
  const [page, setPage] = useState(0)
  const [resourcePage, setResourcePage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const title = invitationId ? '초대 취소 영향' : '워크스페이스 삭제 영향'

  const load = async (part: 'refresh' | 'targets' | 'resources' = 'refresh') => {
    if (loadingRef.current) return
    loadingRef.current = true
    const issued = ++generation.current
    const fresh = part === 'refresh'
    const nextPage = fresh ? 0 : part === 'targets' ? page + 1 : page
    const nextResourcePage = fresh ? 0 : part === 'resources' ? resourcePage + 1 : resourcePage
    const expectedFingerprint = fresh ? undefined : impact?.fingerprint
    setLoading(true)
    setError(null)
    if (fresh) { setImpact(null); setTargets([]); setResources([]); setStale(false); setPage(0); setResourcePage(0) }
    try {
      const next = await fetchWorkspaceTerminationImpact(workspaceId, { invitationId, admin, page: nextPage, resourcePage: nextResourcePage })
      if (!active.current || generation.current !== issued) return
      if (next.workspaceId !== workspaceId || (next.invitationId ?? undefined) !== invitationId || next.action !== (invitationId ? 'CANCEL_INVITATION' : 'DELETE_WORKSPACE') || next.targets.page !== nextPage || next.blockingResources.page !== nextResourcePage) {
        setImpact(null)
        setTargets([])
        setResources([])
        setError('요청한 대상이나 페이지와 조회 결과가 일치하지 않습니다. 전체 영향을 다시 조회해 주세요.')
        return
      }
      if (expectedFingerprint && next.fingerprint !== expectedFingerprint) {
        setImpact(null)
        setTargets([])
        setResources([])
        setStale(true)
        return
      }
      setImpact(next)
      if (fresh || part === 'targets') setTargets((previous) => fresh ? next.targets.content : [...previous, ...next.targets.content])
      if (fresh || part === 'resources') setResources((previous) => fresh ? next.blockingResources.content : [...previous, ...next.blockingResources.content])
      setPage(nextPage)
      setResourcePage(nextResourcePage)
    } catch (failure) {
      if (active.current && generation.current === issued) setError(failure instanceof Error ? failure.message : '종료 영향을 불러오지 못했습니다.')
    } finally {
      if (active.current && generation.current === issued) { loadingRef.current = false; setLoading(false) }
    }
  }

  const close = () => {
    ++generation.current
    loadingRef.current = false
    setLoading(false)
    setOpen(false)
    setImpact(null)
    setTargets([])
    setResources([])
    setError(null)
    setStale(false)
  }

  return <>
    <Button variant="secondary" size={invitationId ? 'sm' : 'md'} aria-label={targetLabel ? `${targetLabel} 종료 영향 보기` : '종료 영향 보기'}
      onClick={() => { setOpen(true); void load() }}>종료 영향 보기</Button>
    <Modal open={open} onClose={close} title={title} className="max-w-3xl" footer={<Button variant="secondary" onClick={close}>닫기</Button>}>
      <div className="space-y-4 [overflow-wrap:anywhere]">
        <Alert variant="info">현재 종료 영향을 조회합니다. 이 조회로 신청이나 대상자가 취소되거나 리소스가 생성되지 않습니다. 실제 변경 시점의 상태는 달라질 수 있습니다.</Alert>
        {targetLabel && <p className="text-sm font-medium">대상 초대: {targetLabel}</p>}
        {loading && <Spinner label="종료 영향 불러오는 중" />}
        {error && <Alert variant="danger">{error}</Alert>}
        {stale && <Alert variant="warning">대상이나 상태, 권한 또는 남은 리소스가 바뀌어 이전 페이지와 합칠 수 없습니다. 전체 영향을 다시 조회해 주세요.</Alert>}
        {(error || stale) && <Button variant="secondary" disabled={loading} onClick={() => void load()}>전체 영향 다시 조회</Button>}
        {impact && <>
          <div className="space-y-1 text-sm">
            <h3 className="font-semibold">{impact.workspaceName}</h3>
            <p>워크스페이스 ID: <code>{impact.workspaceId}</code></p>
            {impact.invitationId && <p>초대 ID: <code>{impact.invitationId}</code></p>}
            <p>조회: {formatDateTime(impact.observedAt)}</p>
            <p className="font-medium">{invitationId ? '이 초대 ID에 연결된 모든 신청 기준' : '선택한 기관과 목록 페이지에 관계없는 전체 워크스페이스 기준'}</p>
          </div>
          <WorkspaceTerminationImpactSummary impact={impact} />
          <section className="space-y-2" aria-label="삭제를 막는 실제 리소스 목록">
            <h3 className="font-semibold">실제 리소스 ({resources.length} / {impact.blockingResources.totalElements}개)</h3>
            <p className="text-sm">저장 상태는 실제 외부 적용이나 접속 성공을 뜻하지 않습니다. 도메인 갱신·해제·예약 기한은 별도 관측 정보입니다.</p>
            {resources.length === 0 ? <p className="text-sm">{impact.blockingResources.totalElements === 0 ? '이 종료 작업을 막는 실제 리소스가 없습니다.' : '전체 수와 리소스 목록을 함께 확인하지 못했습니다. 전체 영향을 다시 조회해 주세요.'}</p>
              : <ul className="space-y-3">{resources.map((resource) => <TerminationResource key={`${resource.type}:${resource.id}`} resource={resource} admin={admin} source={source} />)}</ul>}
            {resourcePage + 1 < impact.blockingResources.totalPages && <Button variant="secondary" loading={loading} disabled={stale} onClick={() => void load('resources')}>다음 리소스 더 보기</Button>}
          </section>
          <section className="space-y-2" aria-label="실제 영향 대상">
            <h3 className="font-semibold">신청과 대상자 ({targets.length} / {impact.targets.totalElements}건)</h3>
            {targets.length === 0 ? <p className="text-sm">{impact.targets.totalElements === 0 ? '현재 연결된 종료 대상이나 실패 이력이 없습니다.' : '전체 수와 대상 목록을 함께 확인하지 못했습니다. 전체 영향을 다시 조회해 주세요.'}</p>
              : <ul className="space-y-3">{targets.map((target) => <TerminationTarget key={`${target.kind}:${target.recipientId ?? target.requestId}`} target={target} admin={admin} source={source} />)}</ul>}
            {page + 1 < impact.targets.totalPages && <Button variant="secondary" loading={loading} disabled={stale} onClick={() => void load('targets')}>다음 대상 더 보기</Button>}
          </section>
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>전체 영향 새로 조회</Button>
        </>}
      </div>
    </Modal>
  </>
}

function TerminationResource({ resource, admin, source }: { resource: BlockingResource; admin: boolean; source: string }) {
  const gpuHidden = resource.type === 'GPU' && !gpuPreviewEnabled()
  const href = terminationResourceHref(resource, admin)
  const labels: Readonly<Partial<Record<string, string>>> = resource.type === 'VM' ? VM_STATUS_LABELS : resource.type === 'LLM_API_KEY' ? LLM_KEY_STATUS_LABELS : resource.type === 'DOMAIN' ? DOMAIN_STATUS_LABELS : GPU_ALLOCATION_LABELS
  const state = resource.type === 'DOMAIN' && resource.status === 'ACTIVE' ? '활성 (ACTIVE)' : labels[resource.status] ?? resource.status
  return <li className="space-y-1 rounded border border-stroke-subtle p-3 text-sm">
    <p>{href ? <Link className="text-primary-700 underline" to={withListReturn(href, source)}>{resource.name}</Link> : resource.name}</p>
    <p>{resourceTypeEntry(resource.type).label} · {resource.orgName ?? '기관 정보 미표시'}</p>
    <p>저장 상태: {state}</p>
    <p>리소스 ID: <code>{resource.id}</code></p>
    {gpuHidden ? <p>이 빌드에서는 GPU 조회 화면을 제공하지 않습니다. 정확한 ID로 운영자에게 확인해 주세요.</p> : !resource.resourceReadable && <p>현재 권한에서는 상세를 열 수 없습니다.</p>}
  </li>
}

function terminationResourceHref(resource: BlockingResource, admin: boolean): string | null {
  if (!resource.resourceReadable || resource.type === 'GPU' && !gpuPreviewEnabled()) return null
  if (!admin) return resourceTypeEntry(resource.type).detailPath?.(resource.id) ?? null
  const org = resource.orgId ?? undefined
  switch (resource.type) {
    case 'VM': return adminPaths.vmDetail(resource.id, org)
    case 'LLM_API_KEY': return adminPaths.llmKeyDetail(resource.id, org)
    case 'DOMAIN': return adminPaths.domainDetail(resource.id, org)
    case 'GPU': return adminPaths.gpuDetail(resource.id, org)
    default: return null
  }
}

export function WorkspaceTerminationImpactSummary({ impact }: { impact: Impact }) {
  const counts = impact.summary
  return <div className="space-y-3 text-sm">
    {impact.executable
      ? <Alert variant="info">현재 조회된 조건에서는 {impact.action === 'DELETE_WORKSPACE' ? '워크스페이스 삭제' : '초대 취소'}가 가능합니다. 아직 실행한 결과는 아닙니다.</Alert>
      : <Alert variant="warning">{impact.blockedReason === 'PERSONAL' ? '개인 워크스페이스는 이 경로로 삭제할 수 없습니다.' : impact.blockedReason === 'REMAINING_RESOURCES' ? '남은 실제 리소스를 먼저 정리해야 워크스페이스를 삭제할 수 있습니다.' : '현재 조건에서는 이 종료 작업을 실행할 수 없습니다.'}</Alert>}
    <p>아래 자동 정리는 종료 작업이 성공할 때 함께 반영됩니다. 차단 조건이 있으면 신청과 대상자도 종료되지 않습니다.</p>
    <dl className="grid grid-cols-1 gap-2 rounded border border-stroke-subtle p-3 sm:grid-cols-2">
      <Count label="취소될 승인 대기 신청" value={counts.submittedRequests} unit="건" />
      <Count label="자동 종료될 대상자" value={counts.closingRecipients} unit="명" />
      <Count label="종료 대상 중 가입 대기" value={counts.pendingJoinRecipients} unit="명" />
      <Count label="종료 대상 중 승인·생성 대기" value={counts.queuedRecipients} unit="명" />
      <Count label="종료 대상 중 승인된 신청 대상자" value={counts.approvedRecipients} unit="명" />
      <Count label="종료 대상 중 승인 전 신청 대상자" value={counts.undecidedRecipients} unit="명" />
      <Count label="자동 종료되지 않는 실패 이력" value={counts.failedRecipients} unit="명" />
    </dl>
    {impact.recipientCounts.length > 0 && <ul className="space-y-1" aria-label="상태별 대상자 수">{impact.recipientCounts.map((item) => <li key={`${item.requestStatus}:${item.recipientStatus}`}>
      {REQUEST_STATUS_LABELS[item.requestStatus]} / {requestRecipientStatusLabel(item.requestStatus, item.recipientStatus, true)}: {item.count}명 · {item.willClose ? '자동 종료 대상' : '실패 이력 유지'}
    </li>)}</ul>}
    <p>실패 이력은 생성 대기와 다르며 이 종료 작업으로 자동 취소되지 않습니다. 승인 이력과 이미 등록된 리소스의 처리 결과는 별도로 유지됩니다.</p>
    {impact.resourceBlockers.some((blocker) => blocker.count > 0) && <section aria-label="남은 실제 리소스" className="space-y-1">
      <h3 className="font-semibold">삭제를 막는 실제 리소스</h3>
      <ul>{impact.resourceBlockers.filter((blocker) => blocker.count > 0).map((blocker) => <li key={blocker.type}>{resourceTypeEntry(blocker.type).label}: {blocker.count}개</li>)}</ul>
    </section>}
  </div>
}

function Count({ label, value, unit }: { label: string; value: number; unit: string }) {
  return <div><dt className="text-foreground-muted">{label}</dt><dd className="font-semibold">{value}{unit}</dd></div>
}

function TerminationTarget({ target, admin, source }: { target: Target; admin: boolean; source: string }) {
  const requestHref = withListReturn(admin ? adminPaths.requestDetail(target.requestId, target.orgId) : consolePaths.requestDetail(target.requestId), source)
  const name = target.name ?? target.invitee ?? '대상자 이름 정보 없음'
  return <li className="space-y-2 rounded border border-stroke-subtle p-3 text-sm">
    <div className="flex flex-wrap gap-2"><Badge variant={target.willClose ? 'warning' : 'neutral'}>{target.kind === 'REQUEST' ? '신청 취소 대상' : target.willClose ? '대상자 자동 종료' : '실패 이력 유지'}</Badge><span>{resourceTypeEntry(target.type).label} · {target.orgName}</span></div>
    <p>{target.requestReadable ? <Link className="text-primary-700 underline" to={requestHref}>{target.requestName}</Link> : <span>{target.requestName}</span>} · {REQUEST_STATUS_LABELS[target.requestStatus]}</p>
    <p>신청 ID: <code>{target.requestId}</code></p>
    {target.kind === 'RECIPIENT' && <>
      <p>{admin && target.userReadable && target.userId ? <Link className="text-primary-700 underline" to={adminPaths.userSupport(target.userId, target.orgId)}>{name}</Link> : name} · {target.recipientStatus ? requestRecipientStatusLabel(target.requestStatus, target.recipientStatus, true) : '상태 정보 없음'}</p>
      <p>대상자 ID: <code>{target.recipientId}</code></p>
      {target.invitationId && <p>연결된 초대 ID: <code>{target.invitationId}</code></p>}
      {target.resourceId && <p>등록된 리소스 ID: <code>{target.resourceId}</code></p>}
      {target.reason && <p>현재 사유: {target.reason}</p>}
    </>}
  </li>
}
