import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAdminSummary,
  fetchAdminVmRequests,
  fetchSystemSummary,
  type OrgDashboardSummary,
} from '../api/queries'
import { useAuth } from '../auth/auth-context'
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
  StatTile,
} from '../components/ui'
import { formatDateTime, formatMemory } from '../lib/format'

/** VM 상태별 개수 맵에서 안전하게 꺼낸다 (없으면 0). */
function countOf(counts: Record<string, number>, key: string): number {
  return counts[key] ?? 0
}

/**
 * 관리자 홈 — 기관 요약 타일 + 자원 현황 + (SYS_ADMIN) 시스템 요약 + 승인 대기 미리보기.
 */
export function AdminDashboardPage() {
  const { user } = useAuth()
  const isSysAdmin = user?.role === 'SYS_ADMIN'

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
    queryKey: ['admin', 'vm-requests', { status: 'SUBMITTED', page: 0, size: 5 }],
    queryFn: () => fetchAdminVmRequests({ status: 'SUBMITTED', page: 0, size: 5 }),
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
              to="/admin/ips"
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
                            {request.requesterName} · {request.groupName}
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

function ResourceCard({ summary }: { summary: OrgDashboardSummary }) {
  const { resource } = summary
  return (
    <Card>
      <CardHeader>
        <CardTitle>자원 현황</CardTitle>
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
}: {
  label: string
  allocated: number
  allocatedLabel: string
  capacity: number | null
  capacityLabel: string | null
}) {
  const ratio = capacity != null && capacity > 0 ? allocated / capacity : null
  const percent = ratio != null ? Math.min(Math.round(ratio * 100), 100) : null
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-neutral-700">{label}</span>
        <span className="text-neutral-500">
          {allocatedLabel}
          {capacityLabel && ` / ${capacityLabel}`}
          {percent != null && ` (${percent}%)`}
        </span>
      </div>
      {percent != null && (
        <div
          role="progressbar"
          aria-label={`${label} 할당률`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 overflow-hidden rounded-full bg-neutral-100"
        >
          <div
            className={
              'h-full rounded-full ' +
              (ratio != null && ratio >= 0.85
                ? 'bg-danger-500'
                : ratio != null && ratio >= 0.7
                  ? 'bg-warning-500'
                  : 'bg-primary-500')
            }
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  )
}
