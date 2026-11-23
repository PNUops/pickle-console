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
      <dd className="mt-1 break-words font-medium">
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
    <p className="mt-1 text-xs text-foreground-muted">{formatDateTime(node.liveObservedAt)} 확인</p>
    {node.exclusionReasons.length > 0 && <p className="mt-2 text-sm text-foreground-muted">{node.exclusionReasons.map((reason) => REASONS[reason] ?? '배치 조건 확인 필요').join(' · ')}</p>}
    {node.eligible && <p className="my-2 text-sm">이번 신청 중 {node.placeableCount}대 배치 가능 · 예상 배치 {node.plannedCount}대{node.limitingResources.length > 0 && ` · 대수 제한: ${node.limitingResources.map((axis) => LIMITS[axis]).join(', ')}`}</p>}
    {node.eligible ? <div className="mt-2"><ResourceChanges remaining={node.remaining} after={node.after} /></div>
      : <p className="mt-2 text-sm">가용 합계에서 제외</p>}
    {node.budget && <p className="mt-2 text-xs text-foreground-muted">배치 한도: CPU {resourceValue(node.budget.vcpu, 'vcpu')} · 메모리 <ResourceAmount value={node.budget.memoryMb} axis="memoryMb" /> · 디스크 {resourceValue(node.budget.diskGb, 'diskGb')}</p>}
    {node.capacityMode === 'LEGACY' && <p className="mt-2 text-xs text-foreground-muted">CPU와 디스크 배치 한도가 등록되지 않은 서버예요.</p>}
  </li>
}

export function VmPlacementCapacity({ preview, onRefresh }: { preview: VmPlacementPreview; onRefresh?: () => void }) {
  const eligibleCount = preview.candidates.filter((node) => node.eligible).length
  return <section aria-label="VM 배치 가능 자원" className="min-w-0 space-y-3 rounded-lg border border-stroke-subtle p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">VM 배치 가능 자원</h3>
      {onRefresh && <Button size="sm" variant="secondary" onClick={onRefresh}>자원 다시 조회</Button>}
    </div>
    <Alert variant={preview.fitsAllNow ? 'success' : 'warning'}>
      {preview.fitsAllNow ? `${preview.count}대 모두 배치 가능해요.` : `${preview.count}대 중 ${preview.placeableCount}대 배치 가능 · ${preview.shortfallCount}대 부족해요.`}
    </Alert>
    {eligibleCount === 0 ? <p className="text-sm">응답과 배치 조건이 확인된 서버가 없어요.</p> : <>
      <p className="text-xs text-foreground-muted">확인된 서버 {eligibleCount}대 합계 · 현재 잔여 → {preview.placeableCount}대 반영 후 예상</p>
      <ResourceChanges remaining={preview.totals.remaining} after={preview.totals.after} />
    </>}
    <ul className="space-y-2" aria-label="서버별 배치 자원">{preview.candidates.map((node) => <NodeCapacity key={node.nodeId} node={node} />)}</ul>
    <p className="text-xs text-foreground-muted">{preview.image.name} revision {preview.image.version} · {formatDateTime(preview.observedAt)} 조회</p>
    <p className="text-xs text-foreground-muted">현재 사양과 생성 예정 대수의 예상이에요. 용량을 예약하지 않으며 생성 시점에 다시 확인해요.</p>
  </section>
}
