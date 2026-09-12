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
    <PageHeader title="내 GPU" actions={<LinkButton to={consolePaths.newRequest(scope, 'GPU')}>GPU 신청</LinkButton>} />
    {allocations.isPending && <Spinner label="GPU 할당 불러오는 중" />}
    {allocations.isError && <Alert variant="danger">{allocations.error.message}</Alert>}
    {allocations.data && (allocations.data.content.length === 0
      ? <EmptyState title="할당받은 GPU가 없습니다" description="신청이 승인되면 이곳에서 대기 순서와 할당 상태를 확인할 수 있습니다." />
      : <><GpuAllocationTable rows={allocations.data.content} /><Pagination page={allocations.data.page} totalPages={allocations.data.totalPages} onPageChange={setPage} /></>)}
  </div>
}
