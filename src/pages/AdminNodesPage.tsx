import { useQuery } from '@tanstack/react-query'
import { fetchAdminNodes, type NodeSummary } from '../api/queries'
import {
  Alert,
  Badge,
  Card,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type BadgeVariant,
} from '../components/ui'
import { formatMemory } from '../lib/format'

const NODE_STATUS_LABELS: Record<NodeSummary['status'], string> = {
  ACTIVE: '활성',
  MAINTENANCE: '점검 중',
  OFFLINE: '오프라인',
}

const NODE_STATUS_VARIANTS: Record<NodeSummary['status'], BadgeVariant> = {
  ACTIVE: 'success',
  MAINTENANCE: 'warning',
  OFFLINE: 'danger',
}

export function AdminNodesPage() {
  const nodes = useQuery({ queryKey: ['admin', 'nodes'], queryFn: fetchAdminNodes })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">노드/용량</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Proxmox 노드별 물리 용량과 할당 합계, IP 풀 여유입니다. 수치는 30초 주기
          상태 폴러가 갱신합니다.
        </p>
      </div>

      {nodes.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="노드 현황 불러오는 중" />
        </div>
      )}
      {nodes.isError && <Alert variant="danger">{nodes.error.message}</Alert>}
      {nodes.isSuccess && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>노드</TH>
                <TH>상태</TH>
                <TH>실행 VM</TH>
                <TH>vCPU 할당</TH>
                <TH>메모리 할당</TH>
                <TH>IP 풀 여유</TH>
                <TH>브리지 / 스토리지</TH>
              </TR>
            </THead>
            <TBody>
              {nodes.data.map((node) => (
                <TR key={node.id}>
                  <TD className="font-medium text-neutral-900">{node.name}</TD>
                  <TD>
                    <Badge variant={NODE_STATUS_VARIANTS[node.status]}>
                      {NODE_STATUS_LABELS[node.status]}
                    </Badge>
                  </TD>
                  <TD>{node.runningVms}대</TD>
                  <TD className="whitespace-nowrap">
                    <RatioCell
                      allocated={`${node.allocatedVcpu} vCPU`}
                      capacity={`${node.cpuThreads} 스레드`}
                      ratio={node.cpuOvercommitRatio}
                      threshold={node.cpuWarnThreshold}
                    />
                  </TD>
                  <TD className="whitespace-nowrap">
                    <RatioCell
                      allocated={formatMemory(node.allocatedMemoryMb)}
                      capacity={formatMemory(node.memoryMb)}
                      ratio={node.memoryAllocRatio}
                      threshold={node.memoryWarnThreshold}
                    />
                  </TD>
                  <TD className="whitespace-nowrap">
                    {node.ipPool.freeCount.toLocaleString()}개
                    <span className="block text-xs text-neutral-500">
                      {node.ipPool.cidr} · 사용 {node.ipPool.allocatedCount.toLocaleString()}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-neutral-500">
                    {node.vmBridge} / {node.storage}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

/** 할당/용량과 비율을 표시하고, 경고 임계값을 넘으면 배지를 붙인다. */
function RatioCell({
  allocated,
  capacity,
  ratio,
  threshold,
}: {
  allocated: string
  capacity: string
  ratio: number
  threshold: number
}) {
  const over = ratio > threshold
  return (
    <div className="flex items-center gap-2">
      <div>
        <span>
          {allocated} / {capacity}
        </span>
        <span className="block text-xs text-neutral-500">
          비율 {ratio.toFixed(2)} (임계 {threshold})
        </span>
      </div>
      {over && <Badge variant="warning">임계 초과</Badge>}
    </div>
  )
}
