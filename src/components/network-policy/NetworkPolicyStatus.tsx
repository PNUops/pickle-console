import { Alert, Badge, type BadgeVariant } from '../ui'
import type { NetworkPolicyObservation } from './model'
import type { VmSystemRule } from './model'

const SYSTEM_RULE_LABELS: Record<string, string> = {
  SSH_GATEWAY: 'SSH gateway',
  WEB_TERMINAL: '웹 터미널',
  HTTP_PUBLISHING: 'HTTP 공개',
  PORT_FORWARDING: '포트포워딩',
}

const PRESENTATION: Record<NetworkPolicyObservation['state'], { label: string; variant: BadgeVariant }> = {
  INACTIVE: { label: '비활성', variant: 'neutral' },
  PENDING: { label: '반영 대기', variant: 'info' },
  APPLIED: { label: '설정 확인', variant: 'success' },
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

export function NetworkSystemRules({ rules }: { rules: readonly VmSystemRule[] }) {
  if (rules.length === 0) return null
  return (
    <section aria-label="필수 규칙" className="rounded-control border border-stroke-subtle bg-surface-subtle p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-medium text-foreground-secondary">필수 규칙</h3>
        <Badge>변경 불가</Badge>
      </div>
      <dl className="space-y-2 text-sm">
        {rules.map((rule) => (
          <div key={rule.key}>
            <dt className="font-medium text-foreground-secondary">
              {SYSTEM_RULE_LABELS[rule.key] ?? rule.key}
            </dt>
            <dd className="text-foreground-muted">{rule.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
