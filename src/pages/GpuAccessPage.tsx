import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchGpuAccessGrants } from '../api/gpu'
import { ResourceAccessSection } from '../components/resource/ResourceAccessSection'
import { GpuStatusBadge } from '../components/gpu/GpuStatus'
import { Alert, PageHeader, Spinner } from '../components/ui'
import { consolePaths } from '../lib/paths'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

export function GpuAccessPage() {
  const allocationId = useParams().allocationId ?? ''
  const access = useQuery({ queryKey: ['gpu-allocations', allocationId, 'access'], queryFn: () => fetchGpuAccessGrants(allocationId), enabled: isUuid(allocationId) })
  return <div className="space-y-6">
    {/* 워크스페이스 목록으로 돌아간다 — 부여가 없는 행은 범위를 고르지 않은 목록에 없다. */}
    <Link to={consolePaths.gpus(access.data?.resource.workspaceId ?? null)} className="text-sm text-primary-700 hover:underline">← GPU</Link>
    {!isUuid(allocationId) ? <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
      : access.isPending ? <Spinner label="접근 권한 불러오는 중" />
      : access.isError ? <Alert variant="danger">{access.error.message}</Alert>
      : <><PageHeader title={access.data.resource.name} description={access.data.resource.workspaceName} actions={<GpuStatusBadge status={access.data.resource.status} />} /><ResourceAccessSection type="GPU" resourceId={allocationId} /></>}
  </div>
}
