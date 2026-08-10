import { Suspense, lazy, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAdminNodes, updateAdminNode, type NodeSummary } from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { isSysAdminOnly, isSysTier } from '../auth/permissions'
import { IpAllocationsSection } from '../components/IpAllocationsSection'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorBoundary,
  Modal,
  PermissionNotice,
  Select,
  Spinner,
  Table,
  TabPanel,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type BadgeVariant,
} from '../components/ui'
import { formatMemory } from '../lib/format'

// 차트 화면은 uPlot을 끌어오므로 해당 탭·영역을 여는 사용자에게만 로드한다.
const NodeMetricsSection = lazy(
  () => import('../components/node-monitoring/NodeMetricsSection'),
)
const CapacityTrendSection = lazy(
  () => import('../components/capacity-trend/CapacityTrendSection'),
)

/** 탭 id는 기존 `?tab=` 링크가 계속 열리도록 유지한다. */
const SCREEN_TABS = [
  { id: 'nodes', label: '노드' },
  { id: 'ips', label: 'IP 할당' },
  { id: 'trend', label: '용량 추이' },
]

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
  const { user } = useAuth()
  // 상태 전환은 SYS_ADMIN 전용이지만, 용량 추이 조회·기관 좁혀 보기는 SYS 티어
  // 전체가 가진 권한이다 — 쓰기 게이트를 읽기 게이트로 돌려쓰지 않는다.
  const isSysAdmin = !!user && isSysAdminOnly(user.role)
  const canFilterTrendByOrg = !!user && isSysTier(user.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab = SCREEN_TABS.some((tab) => tab.id === rawTab) ? rawTab! : 'nodes'
  const nodes = useQuery({ queryKey: ['admin', 'nodes'], queryFn: fetchAdminNodes })
  const [message, setMessage] = useState<string | null>(null)
  const [statusTarget, setStatusTarget] = useState<NodeSummary | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">노드/IP</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Proxmox 노드별 물리 용량·할당 합계와 IP 풀 할당 현황입니다. 수치는 30초
          주기 상태 폴러가 갱신합니다.
        </p>
      </div>

      <Tabs
        aria-label="노드/IP 탭"
        tabs={SCREEN_TABS}
        value={activeTab}
        onChange={(id) => setSearchParams(id === 'nodes' ? {} : { tab: id }, { replace: true })}
      />

      <TabPanel id="ips" active={activeTab === 'ips'}>
        <IpAllocationsSection />
      </TabPanel>

      <TabPanel id="trend" active={activeTab === 'trend'}>
        <ErrorBoundary label="용량 추이">
          <Suspense
            fallback={
              <div className="flex justify-center py-12">
                <Spinner label="용량 추이 불러오는 중" />
              </div>
            }
          >
            <CapacityTrendSection canFilterByOrg={canFilterTrendByOrg} />
          </Suspense>
        </ErrorBoundary>
      </TabPanel>

      <TabPanel id="nodes" active={activeTab === 'nodes'} className="space-y-6">
      {!isSysAdmin && (
        <PermissionNotice>노드 상태 전환은 시스템 관리자만 수행할 수 있습니다.</PermissionNotice>
      )}
      {message && <Alert variant="info">{message}</Alert>}

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
                <TH>
                  <span className="sr-only">작업</span>
                </TH>
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
                    <span className="block">
                      풀 용량{' '}
                      {node.diskCapacityGb != null ? `${node.diskCapacityGb} GiB` : '미측정'}
                    </span>
                  </TD>
                  <TD className="text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!isSysAdmin}
                      onClick={() => setStatusTarget(node)}
                    >
                      상태 전환
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {/* 노드별 실측 사용량 — 노드가 하나뿐인 지금은 항상 펼쳐 둔다. 오프라인으로
          지정된 노드는 물어볼 대상이 아니므로 폴링을 걸지 않고 사실만 적는다. */}
      {nodes.isSuccess &&
        nodes.data.map((node) =>
          node.status === 'OFFLINE' ? (
            <Card key={node.id}>
              <CardHeader>
                <CardTitle>{node.name} 사용량</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-neutral-500">
                  오프라인으로 지정된 노드여서 사용량을 수집하지 않습니다.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ErrorBoundary key={node.id} label={`${node.name} 사용량`}>
              <Suspense
                fallback={
                  <div className="flex justify-center py-8">
                    <Spinner label="노드 사용량 불러오는 중" />
                  </div>
                }
              >
                <NodeMetricsSection nodeId={node.id} nodeName={node.name} />
              </Suspense>
            </ErrorBoundary>
          ),
        )}

      {statusTarget && (
        <NodeStatusModal
          node={statusTarget}
          onClose={() => setStatusTarget(null)}
          onDone={(text) => {
            setStatusTarget(null)
            setMessage(text)
          }}
        />
      )}
      </TabPanel>
    </div>
  )
}

/* ─── 상태 전환 (SYS_ADMIN — 배치가 ACTIVE만 선택하므로 전환만으로 배치 제외) ─── */

function NodeStatusModal({
  node,
  onClose,
  onDone,
}: {
  node: NodeSummary
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<NodeSummary['status']>(node.status)
  const [error, setError] = useState<string | null>(null)

  const update = useMutation({
    mutationFn: () => updateAdminNode(node.id, { status }),
    onSuccess: async (updated) => {
      setError(null)
      onDone(`노드 ${updated.name}의 상태를 ${NODE_STATUS_LABELS[updated.status]}(으)로 전환했습니다.`)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'nodes'] })
    },
    onError: (err) => setError(toApiError(err, '노드 상태를 변경하지 못했습니다.').message),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={`노드 상태 전환 — ${node.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            돌아가기
          </Button>
          <Button
            variant={status === 'ACTIVE' ? 'primary' : 'danger'}
            loading={update.isPending}
            disabled={status === node.status}
            onClick={() => update.mutate()}
          >
            전환
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">
          배치는 ACTIVE 노드만 선택합니다 — 점검 중/오프라인으로 전환하면 신규 VM
          배치에서 제외되며, 기존 게스트는 영향받지 않습니다.
        </p>
        <Select
          aria-label="노드 상태"
          value={status}
          onChange={(event) => setStatus(event.target.value as NodeSummary['status'])}
        >
          {(Object.keys(NODE_STATUS_LABELS) as NodeSummary['status'][]).map((value) => (
            <option key={value} value={value}>
              {NODE_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        {status !== 'ACTIVE' && (
          <Alert variant="warning">
            이 노드가 유일한 ACTIVE 노드라면 전환 시 신규 VM 배치가 불가능해집니다.
          </Alert>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
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
