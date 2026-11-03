import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchGpuAllocations } from '../api/gpu'
import { GpuAllocationTable } from '../components/gpu/GpuAllocationTable'
import { Alert, EmptyState, LinkButton, PageHeader, Pagination, Spinner } from '../components/ui'
import { gpuListPollInterval } from '../lib/gpu-polling'
import { useScope } from '../lib/use-scope'
import { consolePaths } from '../lib/paths'

export function GpusPage() {
  const scope = useScope()
  const [pagination, setPagination] = useState({ scope, page: 0 })
  const page = pagination.scope === scope ? pagination.page : 0
  const setPage = (next: number) => setPagination({ scope, page: next })
  const allocations = useQuery({
    queryKey: ['gpu-allocations', { workspaceId: scope, page }],
    queryFn: () => fetchGpuAllocations({ workspaceId: scope ?? undefined, page }),
    refetchInterval: (result) => gpuListPollInterval(result.state.data?.content),
  })
  return <div className="space-y-6">
    <PageHeader title="GPU" actions={<LinkButton to={consolePaths.newRequest(scope, 'GPU')}>GPU 신청</LinkButton>} />
    {allocations.isPending && <Spinner label="GPU 할당 불러오는 중" />}
    {allocations.isError && <Alert variant="danger">{allocations.error.message}</Alert>}
    {allocations.data && (allocations.data.content.length === 0
      ? <EmptyState title="표시할 GPU 할당이 없어요" description={scope == null ? '접근 권한을 가진 GPU가 없어요. 워크스페이스를 고르면 그 워크스페이스의 GPU를 볼 수 있어요.' : undefined} />
      : <><GpuAllocationTable rows={allocations.data.content} /><Pagination page={allocations.data.page} totalPages={allocations.data.totalPages} onPageChange={setPage} /></>)}
  </div>
}
