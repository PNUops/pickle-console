import { Suspense, lazy } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAdminSummary,
  fetchAdminRequests,
  fetchSystemSummary,
  type NodeLive,
  type NodeRatio,
  type OrgDashboardSummary,
} from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { isSysTier } from '../auth/permissions'
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorBoundary,
  Spinner,
  StatTile,
} from '../components/ui'
import { formatBytes, formatDateTime, formatMemory } from '../lib/format'

// 할당 추이 카드는 uPlot을 끌어오므로 대시보드 진입 번들과 분리한다.
const OrgAllocationTrendCard = lazy(
  () => import('../components/capacity-trend/OrgAllocationTrendCard'),
)

/** VM 상태별 개수 맵에서 안전하게 꺼낸다 (없으면 0). */
function countOf(counts: Record<string, number>, key: string): number {
  return counts[key] ?? 0
}

/**
 * 사용/전체를 한 쌍으로 합산한다 — 둘 다 보고한 노드만 센다. 한쪽만 있는 노드를
 * 분자에 넣으면 분모에 없는 값이 섞여 비율이 틀어진다. 셀 값이 하나도 없으면 null.
 */
function sumLivePair(
  nodes: NodeLive[],
  usedKey: 'memUsedBytes' | 'storageUsedBytes',
  totalKey: 'memTotalBytes' | 'storageTotalBytes',
): { used: number; total: number } | null {
  const measured = nodes.filter((node) => node[usedKey] != null && node[totalKey] != null)
  if (measured.length === 0) return null
  return {
    used: measured.reduce((sum, node) => sum + (node[usedKey] ?? 0), 0),
    total: measured.reduce((sum, node) => sum + (node[totalKey] ?? 0), 0),
  }
}

/**
 * 관리자 홈 — 기관 요약 타일 + 리소스 현황 + (SYS_ADMIN) 시스템 요약 + 승인 대기 미리보기.
 */
export function AdminDashboardPage() {
  const { user } = useAuth()
  const isSysAdmin = !!user && isSysTier(user.role)

  const summary = useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: () => fetchAdminSummary(),
  })
  const system = useQuery({
    queryKey: ['admin', 'system-summary'],
    queryFn: fetchSystemSummary,
    enabled: isSysAdmin,
  })
  const pending = useQuery({
    queryKey: ['admin', 'requests', { status: 'SUBMITTED', page: 0, size: 5 }],
    queryFn: () => fetchAdminRequests({ status: 'SUBMITTED', page: 0, size: 5 }),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">관리자 대시보드</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {user?.name}님, 환영합니다. {isSysAdmin ? '플랫폼 전체' : '우리 기관'} 운영
          현황입니다.
        </p>
      </div>

      {summary.isPending && (
        <div className="flex justify-center py-8">
          <Spinner label="요약 불러오는 중" />
        </div>
      )}
      {summary.isError && <Alert variant="danger">{summary.error.message}</Alert>}
      {summary.isSuccess && (
        <>
          <OrgSummaryTiles summary={summary.data} />
          <ResourceCard summary={summary.data} />
          <ErrorBoundary label="할당 추이">
            <Suspense
              fallback={
                <div className="flex justify-center py-8">
                  <Spinner label="할당 추이 불러오는 중" />
                </div>
              }
            >
              <OrgAllocationTrendCard />
            </Suspense>
          </ErrorBoundary>
        </>
      )}

      {isSysAdmin && system.isError && (
        <Alert variant="danger">{system.error.message}</Alert>
      )}
      {isSysAdmin && system.isSuccess && (
        <section aria-label="시스템 요약" className="space-y-2">
          <h2 className="text-sm font-semibold text-neutral-700">시스템</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatTile
              label="노드"
              value={`${system.data.nodes.length}대`}
              hint={`경고 ${system.data.nodes.filter((n) => n.warn).length}대`}
              to="/admin/nodes"
              tone={system.data.nodes.some((n) => n.warn) ? 'danger' : 'normal'}
            />
            <StatTile
              label="IP 여유"
              value={`${system.data.ipPools
                .reduce((sum, pool) => sum + pool.freeCount, 0)
                .toLocaleString()}개`}
              hint={`${system.data.ipPools.length}개 풀`}
              to="/admin/nodes?tab=ips"
            />
            <StatTile
              label="드리프트 미해결"
              value={`${system.data.openDriftFindingCount}건`}
              to="/admin/drift"
              tone={system.data.openDriftFindingCount > 0 ? 'danger' : 'normal'}
            />
            <StatTile
              label="알림 발송 실패"
              value={`${system.data.notificationFailureCount}건`}
              to="/admin/notification-log"
              tone={system.data.notificationFailureCount > 0 ? 'danger' : 'normal'}
            />
            <StatTile
              label="작업"
              value={`진행 ${system.data.tasks.runningCount + system.data.tasks.retryingCount}`}
              hint={`관리자 확인 ${system.data.tasks.needsAdminCount}건`}
              to="/admin/tasks"
              tone={system.data.tasks.needsAdminCount > 0 ? 'danger' : 'normal'}
            />
            <StatTile
              label="비밀번호 SSH 허용"
              value={`${system.data.sshPasswordEnabledVmCount}대`}
              hint="VM별 설정으로 허용된 VM"
              to="/admin/vms"
              tone={system.data.sshPasswordEnabledVmCount > 0 ? 'danger' : 'normal'}
            />
          </div>
          <NodesLiveTiles live={system.data.nodesLive} nodes={system.data.nodes} />
        </section>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <CardTitle>승인 대기</CardTitle>
          <Link
            to="/admin/requests"
            className="text-sm font-medium text-primary-700 hover:underline"
          >
            전체 보기 →
          </Link>
        </CardHeader>
        <CardContent>
          {pending.isPending && (
            <div className="flex justify-center py-6">
              <Spinner label="승인 대기 현황 불러오는 중" />
            </div>
          )}
          {pending.isError && <Alert variant="danger">{pending.error.message}</Alert>}
          {pending.isSuccess && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">
                검토를 기다리는 신청이{' '}
                <strong className="text-lg font-bold text-primary-700">
                  {pending.data.totalElements}건
                </strong>{' '}
                있습니다.
              </p>
              {pending.data.content.length > 0 && (
                <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                  {pending.data.content.map((request) => (
                    <li key={request.id}>
                      <Link
                        to={`/admin/requests/${request.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-primary-600"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-neutral-900">
                            {request.purpose}
                          </span>
                          <span className="mt-0.5 block text-xs text-neutral-500">
                            {request.requesterName} · {request.workspaceName}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-neutral-400">
                          {formatDateTime(request.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function OrgSummaryTiles({ summary }: { summary: OrgDashboardSummary }) {
  const counts = summary.vmCountsByStatus
  const attentionCount =
    summary.attention.failedTaskCount + summary.attention.needsAdminVmCount
  return (
    <div
      role="region"
      aria-label="기관 요약"
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
    >
      <StatTile
        label="승인 대기"
        value={`${summary.pendingRequestCount}건`}
        hint={`최근 14일 승인 ${summary.recentDecisions14d.approvedCount} · 반려 ${summary.recentDecisions14d.rejectedCount}`}
        to="/admin/requests"
      />
      <StatTile
        label="VM 현황"
        value={`실행 ${countOf(counts, 'RUNNING')}대`}
        hint={`중지 ${countOf(counts, 'STOPPED')} · 오류·확인 필요 ${
          countOf(counts, 'ERROR') + countOf(counts, 'NEEDS_ADMIN')
        }`}
        to="/admin/vms"
      />
      <StatTile
        label="만료 예정 (30일)"
        value={`${summary.expiringVmCount30d}대`}
        hint={`만료됨 ${summary.attention.expiredVmCount}대`}
        to="/admin/expiry"
      />
      <StatTile
        label="확인 필요"
        value={`${attentionCount}건`}
        hint="실패 작업·관리자 확인 VM"
        to="/admin/vms"
        tone={attentionCount > 0 ? 'danger' : 'normal'}
      />
    </div>
  )
}

/**
 * 하이퍼바이저에서 방금 읽어 온 실측 타일 — 할당 합계(위 타일)와 달리 지금 실제로
 * 쓰이고 있는 값이다. 응답하지 않는 노드는 수치 대신 연결 끊김으로 표시하되,
 * 운영자가 오프라인으로 지정해 둔 노드가 응답하지 않는 것은 예정된 상태이므로
 * 경보로 올리지 않는다 — 그러지 않으면 진짜 장애가 상시 경보에 묻힌다.
 */
function NodesLiveTiles({ live, nodes }: { live: NodeLive[]; nodes: NodeRatio[] }) {
  const statusById = new Map(nodes.map((node) => [node.id, node.status]))
  const reachable = live.filter((node) => node.reachable)
  const unreachable = live.filter((node) => !node.reachable)
  const offline = unreachable.filter((node) => statusById.get(node.nodeId) === 'OFFLINE')
  const unexpected = unreachable.length - offline.length
  const lastChecked = reachable
    .map((node) => node.checkedAt)
    .filter((at): at is string => at != null)
    .sort()
    .at(-1)
  const hint = [
    lastChecked ? `마지막 확인 ${formatDateTime(lastChecked)}` : '확인 기록 없음',
    offline.length > 0 ? `끊김 ${offline.length}대는 오프라인으로 지정된 노드` : null,
  ]
    .filter((part): part is string => part != null)
    .join(' · ')

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <StatTile
        label="Proxmox 연결"
        value={`정상 ${reachable.length} / 끊김 ${unreachable.length}`}
        hint={hint}
        tone={unexpected > 0 ? 'danger' : 'normal'}
      />
      <LiveUsageTile
        label="물리 메모리"
        usage={sumLivePair(reachable, 'memUsedBytes', 'memTotalBytes')}
        anyReachable={reachable.length > 0}
        unexpectedOutage={unexpected > 0}
      />
      <LiveUsageTile
        label="스토리지"
        usage={sumLivePair(reachable, 'storageUsedBytes', 'storageTotalBytes')}
        anyReachable={reachable.length > 0}
        unexpectedOutage={unexpected > 0}
        hint="게스트 디스크가 놓이는 풀"
      />
    </div>
  )
}

/**
 * 노드가 모두 응답하지 않으면 연결 끊김, 응답은 했는데 그 값을 못 읽었으면
 * 측정값 없음 — 둘은 원인이 다르므로 같은 문구로 뭉뚱그리지 않는다. 오프라인으로
 * 지정된 노드만 남아 조용한 경우는 장애가 아니므로 붉게 칠하지 않는다.
 */
function LiveUsageTile({
  label,
  usage,
  anyReachable,
  unexpectedOutage,
  hint,
}: {
  label: string
  usage: { used: number; total: number } | null
  anyReachable: boolean
  /** 끊긴 노드 중 오프라인 지정이 아닌 것이 있는가 — 그때만 장애로 읽는다. */
  unexpectedOutage: boolean
  hint?: string
}) {
  const outage = usage == null && !anyReachable
  return (
    <Card className={outage && unexpectedOutage ? 'border-danger-200' : undefined}>
      <div className="space-y-2 px-5 py-4">
        {usage == null ? (
          <>
            <div className="text-xs font-medium text-neutral-500">{label}</div>
            {anyReachable ? (
              <p className="text-sm text-neutral-500">측정값 없음</p>
            ) : unexpectedOutage ? (
              <p className="text-sm font-semibold text-danger-600">연결 끊김</p>
            ) : (
              <p className="text-sm text-neutral-500">
                오프라인 노드만 있어 측정값이 없습니다
              </p>
            )}
          </>
        ) : (
          <>
            <ResourceBar
              label={label}
              ratioNoun="사용률"
              allocated={usage.used}
              allocatedLabel={formatBytes(usage.used)}
              capacity={usage.total}
              capacityLabel={formatBytes(usage.total)}
            />
            {hint && <p className="text-xs text-neutral-500">{hint}</p>}
          </>
        )}
      </div>
    </Card>
  )
}

function ResourceCard({ summary }: { summary: OrgDashboardSummary }) {
  const { resource } = summary
  return (
    <Card>
      <CardHeader>
        <CardTitle>리소스 현황</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResourceBar
          label="vCPU"
          allocatedLabel={`${resource.allocatedVcpu} vCPU`}
          allocated={resource.allocatedVcpu}
          capacity={resource.capacityVcpu ?? null}
          capacityLabel={
            resource.capacityVcpu != null ? `${resource.capacityVcpu} 스레드` : null
          }
        />
        <ResourceBar
          label="메모리"
          allocatedLabel={formatMemory(resource.allocatedMemoryMb)}
          allocated={resource.allocatedMemoryMb}
          capacity={resource.capacityMemoryMb ?? null}
          capacityLabel={
            resource.capacityMemoryMb != null
              ? formatMemory(resource.capacityMemoryMb)
              : null
          }
        />
        {/* 디스크 풀은 씬 프로비저닝이라 할당 합계가 풀 용량을 넘을 수 있다 —
            분모는 참고용이지 배치를 막는 한계가 아니므로 경고색을 입히지 않는다. */}
        <ResourceBar
          label="디스크"
          allocatedLabel={`${resource.allocatedDiskGb} GiB`}
          allocated={resource.allocatedDiskGb}
          capacity={resource.capacityDiskGb ?? null}
          capacityLabel={
            resource.capacityDiskGb != null ? `${resource.capacityDiskGb} GiB` : null
          }
          advisory
          overNote="디스크 할당 합계가 풀 용량을 넘었습니다. 씬 프로비저닝 풀이라 참고용 수치이며, 배치를 막는 한계는 아닙니다."
        />
        <p className="text-sm text-neutral-600">{resource.guidance}</p>
      </CardContent>
    </Card>
  )
}

function ResourceBar({
  label,
  allocated,
  allocatedLabel,
  capacity,
  capacityLabel,
  ratioNoun = '할당률',
  advisory = false,
  overNote,
}: {
  label: string
  allocated: number
  allocatedLabel: string
  capacity: number | null
  capacityLabel: string | null
  /** 막대가 나타내는 비율의 이름 — 할당 합계는 할당률, 실측치는 사용률. */
  ratioNoun?: string
  /** 분모가 넘어설 수 없는 한계가 아니라 참고값인가 — 경고색을 입히지 않는다. */
  advisory?: boolean
  /** 100%를 넘었을 때 덧붙이는 설명 (참고용 분모에서만 쓴다). */
  overNote?: string
}) {
  const ratio = capacity != null && capacity > 0 ? allocated / capacity : null
  // 비율은 있는 그대로 적는다 — 120%를 100%로 줄여 쓰면 넘어선 사실이 사라진다.
  const percent = ratio != null ? Math.round(ratio * 100) : null
  // 막대는 자기 폭을 넘을 수 없으므로 그림만 잘라 그리고, 넘어선 사실은 글로 밝힌다.
  const barPercent = percent != null ? Math.min(percent, 100) : null
  const over = percent != null && percent > 100
  const valueLabel = `${allocatedLabel}${capacityLabel ? ` / ${capacityLabel}` : ''}${
    percent != null ? ` (${percent}%)` : ''
  }`
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-neutral-700">{label}</span>
        <span className="text-neutral-500">{valueLabel}</span>
      </div>
      {barPercent != null && (
        <div
          role="progressbar"
          aria-label={`${label} ${ratioNoun}`}
          aria-valuenow={percent ?? undefined}
          aria-valuemin={0}
          aria-valuemax={Math.max(100, percent ?? 0)}
          aria-valuetext={valueLabel}
          className="h-2 overflow-hidden rounded-full bg-neutral-100"
        >
          <div
            className={
              'h-full rounded-full ' +
              (advisory
                ? 'bg-primary-500'
                : ratio != null && ratio >= 0.85
                  ? 'bg-danger-500'
                  : ratio != null && ratio >= 0.7
                    ? 'bg-warning-500'
                    : 'bg-primary-500')
            }
            style={{ width: `${barPercent}%` }}
          />
        </div>
      )}
      {over && overNote && <p className="text-xs text-neutral-500">{overNote}</p>}
    </div>
  )
}
