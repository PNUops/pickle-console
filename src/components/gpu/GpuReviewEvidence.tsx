import { formatDateTime } from '../../lib/format'

const LABELS: Record<string, string> = {
  reviewHours: '미연결 검토 기준', unattachedSince: '미연결 시작', evaluatedAt: '평가 시각',
  windowHours: '판단 기간', thresholdPercent: '저사용 기준', coverage: '표본 확인 비율',
  averagePercent: '평균 이용률', latestSample: '최근 표본 시각', attachedAt: 'VM 연결 시각',
}
function evidenceValue(key: string, value: unknown): string {
  if (value == null) return '측정 불가'
  if (typeof value === 'number') {
    if (key === 'reviewHours' || key === 'windowHours') return `${value}시간`
    if (key === 'coverage') return `${(value * 100).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`
    if (key === 'averagePercent' || key === 'thresholdPercent') return `${value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`
    return String(value)
  }
  if (typeof value === 'string' && ['unattachedSince', 'evaluatedAt', 'latestSample', 'attachedAt'].includes(key) && !Number.isNaN(Date.parse(value))) return formatDateTime(value)
  return typeof value === 'string' ? value : JSON.stringify(value)
}
export function GpuReviewEvidence({ evidence }: { evidence: Record<string, unknown> }) {
  return <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{Object.entries(evidence).map(([key, value]) => <div key={key}>
    <dt className="text-xs text-neutral-500">{LABELS[key] ?? key}</dt>
    <dd className="mt-1 break-words text-sm">{evidenceValue(key, value)}</dd>
  </div>)}</dl>
}
