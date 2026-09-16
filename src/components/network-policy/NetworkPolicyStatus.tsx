import { Alert, Badge, type BadgeVariant } from '../ui'
import type { NetworkPolicyObservation } from './model'

const PRESENTATION: Record<NetworkPolicyObservation['state'], { label: string; variant: BadgeVariant }> = {
  NOT_CONFIGURED: { label: '미설정', variant: 'neutral' },
  DESIRED: { label: '반영 대기', variant: 'info' },
  CONFIG_CONFIRMED: { label: '설정 확인', variant: 'success' },
  FAILED: { label: '설정 실패', variant: 'danger' },
}

export function NetworkPolicyStatus({ observation }: { observation: NetworkPolicyObservation }) {
  const display = PRESENTATION[observation.state]
  return (
    <div className="space-y-2" aria-live="polite">
      <Badge variant={display.variant}>{display.label}</Badge>
      {observation.state === 'FAILED' && <Alert variant="danger">{observation.message}</Alert>}
    </div>
  )
}

export function NetworkSystemRules({ rules }: { rules: readonly string[] }) {
  if (rules.length === 0) return null
  return (
    <section aria-label="필수 규칙" className="rounded-control border border-stroke-subtle bg-surface-subtle p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-medium text-foreground-secondary">필수 규칙</h3>
        <Badge>변경 불가</Badge>
      </div>
      <ul className="list-inside list-disc space-y-1 text-sm text-foreground-muted">
        {rules.map((rule, index) => <li key={index}>{rule}</li>)}
      </ul>
    </section>
  )
}
