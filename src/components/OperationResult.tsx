import type { ReactNode } from 'react'
import { Alert } from './ui'

export type ResultStage = 'accepted' | 'stored' | 'reported' | 'completed'

const STAGE_LABELS: Record<ResultStage, string> = {
  accepted: '작업 접수',
  stored: '저장됨',
  reported: '외부 반영 보고',
  completed: '실제 완료',
}

/** The stage states what the available evidence proves, not the desired outcome. */
export function OperationResult({ stage, children, variant = 'info' }: {
  stage: ResultStage
  children: ReactNode
  variant?: 'info' | 'warning' | 'danger'
}) {
  return <Alert variant={variant} title={STAGE_LABELS[stage]}>{children}</Alert>
}
