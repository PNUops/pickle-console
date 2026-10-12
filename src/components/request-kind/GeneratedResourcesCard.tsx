import { Link } from 'react-router'
import type { GeneratedRequestResource } from '../../api/request-review'
import { useAuth } from '../../auth/auth-context'
import { isSysTier } from '../../auth/permissions'
import { adminPath, adminPaths } from '../../lib/paths'
import { withListReturn } from '../../lib/list-url'
import { formatDateTime } from '../../lib/format'
import { gpuPreviewEnabled } from '../../lib/gpu-preview'
import { Card, CardContent, CardHeader, CardTitle, DataTable, DomainStatusBadge, LlmKeyStatusBadge, TBody, TD, TH, THead, TR, VmStatusBadge } from '../ui'
import { GpuStatusBadge } from '../gpu/GpuStatus'
import type { DomainStatus, LlmApiKeyStatus, VmStatus } from '../../lib/status'

function resourcePath(resource: GeneratedRequestResource) {
  if (resource.canReadDetail !== true) return null
  switch (resource.type) {
    case 'VM': return adminPaths.vmDetail(resource.id, resource.orgId)
    case 'LLM_API_KEY': return adminPaths.llmKeyDetail(resource.id, resource.orgId)
    case 'GPU': return gpuPreviewEnabled() ? adminPaths.gpuDetail(resource.id, resource.orgId) : null
    case 'DOMAIN': return adminPaths.domainDetail(resource.id, resource.orgId)
  }
}

function GeneratedState({ resource }: { resource: GeneratedRequestResource }) {
  switch (resource.type) {
    case 'VM': return <VmStatusBadge status={resource.state as VmStatus} />
    case 'LLM_API_KEY': return <LlmKeyStatusBadge status={resource.state as LlmApiKeyStatus} />
    case 'GPU': return <GpuStatusBadge status={resource.state} />
    case 'DOMAIN': return <DomainStatusBadge status={resource.state as DomainStatus} />
  }
}

export function GeneratedResourcesCard({ resources, returnTo, unlinkedDomain = false }: { resources: GeneratedRequestResource[]; returnTo: string; unlinkedDomain?: boolean }) {
  const { user } = useAuth()
  if (resources.length === 0) return unlinkedDomain ? <Card>
    <CardHeader><CardTitle>도메인 발급 연결 기록</CardTitle></CardHeader>
    <CardContent><p className="text-sm text-foreground-muted">이 신청의 확정 자원 ID 연결 기록이 없습니다. 기존 발급 이름은 부여 내용에서 확인해 주세요. 연결 기록이 없다는 사실만으로 발급 실패를 뜻하지 않습니다.</p></CardContent>
  </Card> : null
  return <Card>
    <CardHeader><CardTitle>등록된 자원의 실제 상태</CardTitle></CardHeader>
    <CardContent className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
      <p className="text-sm text-foreground-muted">이 신청 ID로 연결된 서버 기록입니다. 등록됨과 VM 생성 진행, 실패, 실제 접속 성공은 구분합니다.</p>
      {resources.some((resource) => resource.type === 'DOMAIN') && <p className="text-sm text-foreground-muted">도메인은 저장된 상태와 갱신·해제·예약 기한을 각각 확인합니다. 현재 DNS 반영이나 실제 연결 성공을 뜻하지 않습니다.</p>}
      <DataTable caption="신청에서 등록된 자원 상태">
        <THead><TR><TH>자원</TH><TH>조회된 상태</TH><TH>기간·종료 기록</TH><TH>실제 배치 노드</TH><TH>기록 갱신</TH><TH>운영 작업</TH></TR></THead>
        <TBody>{resources.map((resource) => {
          const resourceDetail = resourcePath(resource)
          const path = resourceDetail && ['VM', 'DOMAIN', 'LLM_API_KEY'].includes(resource.type) ? withListReturn(resourceDetail, returnTo) : resourceDetail
          return <TR key={`${resource.type}-${resource.id}`}>
            <TD>{path ? <Link className="text-primary-700 hover:underline" to={path}>{resource.name}</Link> : <span>{resource.name}</span>}
              {resource.type === 'DOMAIN' && <span className="mt-1 block break-all text-xs text-foreground-muted">원본 ID: {resource.id}{!resource.canReadDetail && ' / 현재 상세 조회 불가'}</span>}
            </TD>
            <TD><GeneratedState resource={resource} /></TD>
            <TD>{resource.type === 'DOMAIN' ? <ul className="space-y-1 text-xs">
              <li>갱신 기한: {resource.renewDueAt ? formatDateTime(resource.renewDueAt) : '기록 없음'}</li>
              <li>해제 기록: {resource.releasedAt ? formatDateTime(resource.releasedAt) : '기록 없음'}</li>
              <li>예약 기한: {resource.reservedUntil ? formatDateTime(resource.reservedUntil) : '기록 없음'}</li>
            </ul> : '—'}</TD>
            <TD>{resource.type === 'VM' ? resource.nodeName ?? '아직 기록되지 않음' : '—'}</TD>
            <TD>{formatDateTime(resource.recordUpdatedAt)}</TD>
            <TD>{resource.type === 'VM' && ['ERROR', 'NEEDS_ADMIN'].includes(resource.state)
              ? user && isSysTier(user.role)
                ? <Link className="text-primary-700 hover:underline" to={adminPath(`/admin/tasks?${new URLSearchParams({ vmId: resource.id, returnTo })}`, resource.orgId)}>이 VM의 운영 작업</Link>
                : <span className="text-sm text-foreground-muted">시스템 운영자 확인 필요</span>
              : '—'}</TD>
          </TR>
        })}</TBody>
      </DataTable>
    </CardContent>
  </Card>
}
