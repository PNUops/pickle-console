import type { DomainKind } from '../../api/queries'
import { kstDateString } from '../../lib/format'
import { Button, DdayBadge, DomainConnectionBadge, DomainKindBadge } from '../ui'
import type { FoldedDomainStatus } from './domain-status'

interface DomainRowProps {
  fqdn: string
  kind: DomainKind
  /** 공개 포트 — 라우트가 아직 없으면 표기하지 않는다. */
  port?: number | null
  fold: FoldedDomainStatus
  /** 서빙 중인 도메인만 https 링크를 건다 (예약 중은 트래픽을 받지 않는다). */
  live: boolean
  reservedUntil?: string | null
  onDetail: () => void
  /** 예약 중 행 전용 — 이름이 풀리기 전에 같은 이름으로 다시 연결. */
  onReconnect?: () => void
}

/** 도메인 목록의 행 하나 — 주소·포트·종류·접힌 상태 배지와 행동 안내 한 줄. */
export function DomainRow({
  fqdn,
  kind,
  port,
  fold,
  live,
  reservedUntil,
  onDetail,
  onReconnect,
}: DomainRowProps) {
  return (
    <li className="space-y-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        {live ? (
          <a
            href={`https://${fqdn}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm font-medium text-primary-700 hover:underline"
          >
            {fqdn}
            <span aria-hidden="true"> ↗</span>
          </a>
        ) : (
          <span className="font-mono text-sm font-medium text-neutral-700">{fqdn}</span>
        )}
        {port != null && (
          <span className="font-mono text-xs text-neutral-500">→ :{port}</span>
        )}
        <DomainKindBadge kind={kind} />
        <DomainConnectionBadge status={fold} />
        {reservedUntil && <DdayBadge endDate={kstDateString(new Date(reservedUntil))} />}
        <span className="ml-auto flex items-center gap-2">
          {onReconnect && (
            <Button variant="secondary" size="sm" onClick={onReconnect}>
              다시 연결
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onDetail}>
            자세히
          </Button>
        </span>
      </div>
      {fold.hint && <p className="text-sm text-neutral-500">{fold.hint}</p>}
    </li>
  )
}
