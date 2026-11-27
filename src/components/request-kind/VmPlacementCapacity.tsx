import type { VmPlacementPreview } from '../../api/request-review'
import { formatDateTime } from '../../lib/format'
import { Alert, Badge, Button } from '../ui'

type Candidate = VmPlacementPreview['candidates'][number]
type Resources = VmPlacementPreview['totals']['remaining']

const STATUS: Record<Candidate['status'], string> = {
  ACTIVE: '관리 상태: 활성', MAINTENANCE: '관리 상태: 점검', OFFLINE: '관리 상태: 오프라인',
}
const REASONS: Record<string, string> = {
  INACTIVE_NODE: '관리 상태로 배치 제외',
  IMAGE_UNAVAILABLE: '선택한 OS 이미지 없음',
  NODE_NOT_SELECTED: '지정한 서버가 아님',
  LIVE_STATUS_UNKNOWN: '서버 응답 확인 실패',
  INVALID_CAPACITY: '배치 한도 확인 필요',
  DISK_BELOW_MINIMUM: 'OS 이미지 최소 디스크 미달',
}
const LIMITS: Record<string, string> = { CPU: 'CPU', MEMORY: '메모리', DISK: '디스크' }

function resourceValue(value: number | null | undefined, unit: 'vcpu' | 'memoryMb' | 'diskGb') {
  if (value == null) return '한도 미설정'
  if (unit === 'memoryMb') return value >= 1024
    ? `${(value / 1024).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} GiB`
    : `${value.toLocaleString('ko-KR')} MiB`
  return `${value.toLocaleString('ko-KR')} ${unit === 'vcpu' ? 'vCPU' : 'GiB'}`
}

function ResourceAmount({ value, axis }: { value: number | null | undefined; axis: 'vcpu' | 'memoryMb' | 'diskGb' }) {
  return <span title={axis === 'memoryMb' && value != null ? `${value.toLocaleString('ko-KR')} MiB` : undefined}>{resourceValue(value, axis)}</span>
}

function ResourceChanges({ remaining, after }: { remaining: Resources | null | undefined; after: Resources | null | undefined }) {
  return <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
    {([['vcpu', '남은 CPU'], ['memoryMb', '남은 메모리'], ['diskGb', '남은 디스크']] as const).map(([axis, label]) => <div key={axis} className="min-w-0">
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="mt-1 break-words font-medium tabular-nums">
        {remaining == null ? '미확인' : <ResourceAmount value={remaining[axis]} axis={axis} />}
        <span className="mx-1 text-foreground-muted" aria-hidden="true">→</span><span className="sr-only">, 반영 후 </span>
        {after == null ? '미확인' : <ResourceAmount value={after[axis]} axis={axis} />}
      </dd>
    </div>)}
  </dl>
}

function NodeCapacity({ node }: { node: Candidate }) {
  return <li className="min-w-0 rounded-lg border border-stroke-subtle p-3">
    <div className="flex flex-wrap items-center gap-2">
      <h4 className="break-all font-semibold">{node.nodeName}</h4>
      <Badge variant={node.status === 'ACTIVE' ? 'neutral' : 'warning'}>{STATUS[node.status]}</Badge>
      <Badge variant={node.liveStatus === 'REACHABLE' ? 'success' : 'warning'}>{node.liveStatus === 'REACHABLE' ? '서버 응답 확인' : '응답 미확인'}</Badge>
    </div>
    {node.exclusionReasons.length > 0 && <p className="mt-2 text-sm text-foreground-muted">{node.exclusionReasons.map((reason) => REASONS[reason] ?? '배치 조건 확인 필요').join(' · ')}</p>}
    {node.eligible && <p className="my-2 text-sm">이번 신청은 최대 {node.placeableCount}대 · 예상 배치 {node.plannedCount}대{node.limitingResources.length > 0 && ` · 대수 제한: ${node.limitingResources.map((axis) => LIMITS[axis]).join(', ')}`}</p>}
    {node.eligible ? <div className="mt-2"><ResourceChanges remaining={node.remaining} after={node.after} /></div>
      : <p className="mt-2 text-sm">가용 합계에서 제외</p>}
    {node.capacityMode === 'LEGACY' && <p className="mt-2 text-xs text-foreground-muted">CPU와 디스크 배치 한도가 등록되지 않은 서버예요.</p>}
  </li>
}

function PlacementResults({ preview, automaticCapacityInvalid }: { preview: VmPlacementPreview; automaticCapacityInvalid: boolean }) {
  const eligibleCount = preview.candidates.filter((node) => node.eligible).length
  const automaticConnectivityUnknown = preview.nodeId == null && preview.candidates.some((node) =>
    node.status === 'ACTIVE' && node.liveStatus === 'UNKNOWN' && node.capacityMode !== 'INVALID' && node.budget != null
    && node.exclusionReasons.every((reason) => reason === 'LIVE_STATUS_UNKNOWN' || reason === 'NODE_NOT_SELECTED'),
  )
  const verdict = preview.fitsAllNow
    ? `확인된 서버 기준으로 ${preview.count}대 모두 배치 가능한 용량이 있어요.`
    : `확인된 서버 기준으로 ${preview.count}대 중 ${preview.placeableCount}대분의 용량이 있어요. ${preview.shortfallCount}대 부족해요.`
  return (
    <>
        {automaticCapacityInvalid ? <Alert variant="danger" title="자동 배치를 진행할 수 없어요">
          <p>후보 서버의 배치 한도에 문제가 있어요. 배치 노드에서 정상 서버를 선택하거나 서버 설정을 확인해 주세요.</p>
          {eligibleCount > 0 && <p className="mt-1">확인된 서버에는 {preview.count}대 중 {preview.placeableCount}대분의 자원이 있어요.</p>}
        </Alert> : <Alert variant={automaticConnectivityUnknown || !preview.fitsAllNow ? 'warning' : 'success'}>
          <p>{verdict}</p>
          {automaticConnectivityUnknown && <p className="mt-1">응답 미확인 서버가 자동 배치에 선택될 수 있어요. 응답이 확인된 서버를 직접 선택하거나 서버 관리 상태를 확인해 주세요.</p>}
        </Alert>}
        {eligibleCount === 0 ? <p className="text-sm">응답과 배치 조건이 확인된 서버가 없어요.</p> : <>
          <p className="text-xs text-foreground-muted">확인된 서버 {eligibleCount}대 합계 · 현재 잔여 → {preview.placeableCount}대 반영 후 예상</p>
          <ResourceChanges remaining={preview.totals.remaining} after={preview.totals.after} />
        </>}
        <ul className="space-y-2" aria-label="서버별 배치 자원">{preview.candidates.map((node) => <NodeCapacity key={node.nodeId} node={node} />)}</ul>
        <p className="text-xs text-foreground-muted">용량을 예약하지 않으며 생성 시점에 다시 확인해요.</p>
        <details className="text-xs text-foreground-muted">
          <summary className="cursor-pointer font-medium">조회 상세</summary>
          <p className="mt-2">{preview.image.name} (리비전 {preview.image.version}) · {formatDateTime(preview.observedAt)} 조회</p>
          <ul className="mt-2 space-y-1">
            {preview.candidates.map((node) => <li key={node.nodeId}>
              {node.nodeName} · {formatDateTime(node.liveObservedAt)} {node.liveStatus === 'REACHABLE' ? '응답 확인' : '응답 미확인'}
              {node.budget && <> · 배치 한도 CPU {resourceValue(node.budget.vcpu, 'vcpu')} · 메모리 <ResourceAmount value={node.budget.memoryMb} axis="memoryMb" /> · 디스크 {resourceValue(node.budget.diskGb, 'diskGb')}</>}
            </li>)}
          </ul>
        </details>
    </>
  )
}

export function VmPlacementCapacity({ preview, onRefresh, refreshing = false, refreshError, automaticCapacityInvalid = false }: {
  preview?: VmPlacementPreview
  onRefresh?: () => void
  refreshing?: boolean
  refreshError?: string
  automaticCapacityInvalid?: boolean
}) {
  return <section aria-label={preview ? 'VM 배치 가능 자원' : 'VM 배치 자원 조회'} className="min-w-0 space-y-3 rounded-lg border border-stroke-subtle p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">VM 배치 가능 자원</h3>
      {onRefresh && <Button size="sm" variant="secondary" aria-disabled={refreshing || undefined} onClick={() => { if (!refreshing) onRefresh() }}>자원 다시 조회</Button>}
    </div>
    {refreshError ? <Alert variant="warning" title="배치 자원을 조회하지 못했어요">{refreshError}</Alert> : (
      <>
        {refreshing && <p role="status" className="text-sm text-foreground-muted">{preview ? '이전 조회 결과예요. 새로 확인하고 있어요.' : '배치 자원을 확인하고 있어요.'}</p>}
        {preview && <PlacementResults preview={preview} automaticCapacityInvalid={automaticCapacityInvalid} />}
      </>
    )}
  </section>
}
