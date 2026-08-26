import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchAdminNodes,
  fetchIpAllocations,
  type IpAllocationStatus,
} from '../api/queries'
import { FilterBar } from './FilterBar'
import {
  Alert,
  Card,
  IpAllocationStatusBadge,
  Pagination,
  Select,
  Spinner,
  StatTile,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from './ui'
import { formatDateTime } from '../lib/format'
import { IP_ALLOCATION_STATUS_LABELS } from '../lib/status'

const PAGE_SIZE = 20

const TABS: { label: string; status: IpAllocationStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: IP_ALLOCATION_STATUS_LABELS.ALLOCATED, status: 'ALLOCATED' },
  { label: IP_ALLOCATION_STATUS_LABELS.RELEASED, status: 'RELEASED' },
]

/** IP 할당 현황 — 풀별 여유와 할당/해제 이력. 노드/IP 화면의 IP 탭. */
export function IpAllocationsSection() {
  const [status, setStatus] = useState<IpAllocationStatus | undefined>(undefined)
  const [poolId, setPoolId] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(0)

  // 풀 요약은 노드 현황의 ipPool 정보를 재사용한다 (별도 요약 API 불필요).
  const nodes = useQuery({ queryKey: ['admin', 'nodes'], queryFn: fetchAdminNodes })
  const allocations = useQuery({
    queryKey: ['admin', 'ip-allocations', { status: status ?? null, poolId: poolId ?? null, page }],
    queryFn: () => fetchIpAllocations({ status, poolId, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      {nodes.isSuccess && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {nodes.data.map((node) => (
            <StatTile
              key={node.ipPool.id}
              label={`${node.name} · ${node.ipPool.cidr}`}
              value={`여유 ${node.ipPool.freeCount.toLocaleString()}개`}
              hint={`할당 ${node.ipPool.allocatedCount.toLocaleString()}개`}
              tone={node.ipPool.freeCount < 16 ? 'danger' : 'normal'}
            />
          ))}
        </div>
      )}

      <FilterBar
        tabs={TABS}
        status={status}
        onStatus={(next) => {
          setStatus(next)
          setPage(0)
        }}
        showOrgFilter={false}
        orgId={undefined}
        onOrg={() => {}}
        orgs={[]}
      >
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          풀
          <Select
            aria-label="IP 풀 필터"
            className="w-56"
            value={poolId ?? ''}
            onChange={(event) => {
              setPoolId(event.target.value || undefined)
              setPage(0)
            }}
          >
            <option value="">전체 풀</option>
            {(nodes.data ?? []).map((node) => (
              <option key={node.ipPool.id} value={node.ipPool.id}>
                {node.name} ({node.ipPool.cidr})
              </option>
            ))}
          </Select>
        </label>
      </FilterBar>

      {allocations.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="IP 할당 목록 불러오는 중" />
        </div>
      )}
      {allocations.isError && <Alert variant="danger">{allocations.error.message}</Alert>}
      {allocations.isSuccess && allocations.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          조건에 맞는 할당 이력이 없습니다.
        </Card>
      )}
      {allocations.isSuccess && allocations.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>IP</TH>
                  <TH>풀</TH>
                  <TH>상태</TH>
                  <TH>VM</TH>
                  <TH>할당 시각</TH>
                  <TH>해제 시각</TH>
                </TR>
              </THead>
              <TBody>
                {allocations.data.content.map((allocation) => (
                  <TR key={allocation.id}>
                    <TD className="font-mono text-sm">{allocation.ip}</TD>
                    <TD>{allocation.poolName}</TD>
                    <TD>
                      <IpAllocationStatusBadge status={allocation.status} />
                    </TD>
                    <TD>
                      {allocation.vmName ?? '—'}
                      {allocation.hostname && allocation.hostname !== allocation.vmName && (
                        <span className="block font-mono text-xs text-neutral-500">
                          {allocation.hostname}
                        </span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {formatDateTime(allocation.allocatedAt)}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {allocation.releasedAt ? formatDateTime(allocation.releasedAt) : '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={allocations.data.page}
            totalPages={allocations.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
