import type { ApproveRequest, RequestDetail } from '../../api/queries'
import { formatMemory } from '../../lib/format'
import { gpuDurationLabel } from '../../lib/gpu-duration'
import { formatTokenDecision } from '../../lib/token-presentation'

export interface ApprovalComparison {
  label: string
  requested: string
  granted: string
  requestedTokens?: number
  grantedTokens?: number
  dailyTokenLimit?: boolean
}

export interface ApprovalTargetFacts {
  userId?: string | null
  name: string
  userStatus?: string
  member?: boolean
}

/** The same declared grant applies to every recipient still eligible to receive one. */
export function approvalTargetCounts(request: RequestDetail, facts: ApprovalTargetFacts[] = [], factsKnown = false) {
  const recipients = request.recipients ?? []
  if (recipients.length === 0) {
    const target = facts.find((item) => item.userId === request.requesterId)
    const excluded = factsKnown && !target || !!target && (target.member === false || target.userStatus != null && target.userStatus !== 'ACTIVE')
    return { total: 1, ready: excluded || !factsKnown ? 0 : 1, waiting: 0, excluded: excluded ? 1 : 0, unknown: excluded || factsKnown ? 0 : 1 }
  }
  let ready = 0
  let waiting = 0
  let excluded = 0
  let unknown = 0
  for (const recipient of recipients) {
    const target = facts.find((item) => item.userId && item.userId === recipient.userId)
    if (recipient.status === 'PENDING_JOIN') waiting += 1
    else if (recipient.status === 'QUEUED' && !(target && (target.member === false || target.userStatus != null && target.userStatus !== 'ACTIVE'))) {
      if (factsKnown && target) ready += 1
      else unknown += 1
    }
    else excluded += 1
  }
  return { total: recipients.length, ready, waiting, excluded, unknown }
}

function numberText(value: number | null | undefined, fallback: string): string {
  return value == null ? fallback : value.toLocaleString('ko-KR')
}

export function commonApprovalComparisons(request: RequestDetail, approval: ApproveRequest): ApprovalComparison[] {
  const rows: ApprovalComparison[] = []
  if (request.type === 'VM') {
    rows.push(
      { label: 'vCPU (1명당)', requested: numberText(request.vm?.reqVcpu, '희망값 없음'), granted: numberText(approval.vm?.grantedVcpu, '입력 필요') },
      { label: '메모리 (1명당)', requested: request.vm?.reqMemoryMb == null ? '희망값 기록 없음' : formatMemory(request.vm.reqMemoryMb), granted: approval.vm?.grantedMemoryMb == null ? '입력 필요' : formatMemory(approval.vm.grantedMemoryMb) },
      { label: '디스크 (1명당)', requested: `${numberText(request.vm?.reqDiskGb, '희망값 없음')} GiB`, granted: `${numberText(approval.vm?.grantedDiskGb, '입력 필요')} GiB` },
    )
  } else if (request.type === 'LLM_API_KEY') {
    const axes = [
      ['분당 요청 수 (키당)', request.llmKey?.reqRpm, approval.llmKey?.grantedRpm],
      ['분당 토큰 수 (키당)', request.llmKey?.reqTpm, approval.llmKey?.grantedTpm],
      ['일일 토큰 수 (키당)', request.llmKey?.reqDailyTokens, approval.llmKey?.grantedDailyTokens],
      ['동시 요청 수 (키당)', undefined, approval.llmKey?.grantedConcurrency],
    ] as const
    for (const [label, requested, granted] of axes) {
      const token = label === '분당 토큰 수 (키당)' || label === '일일 토큰 수 (키당)'
      rows.push({ label,
        requested: token && requested != null ? formatTokenDecision(requested) : numberText(requested, '희망값 없음'),
        granted: token && granted != null ? formatTokenDecision(granted) : numberText(granted, label === '일일 토큰 수 (키당)' ? '무제한' : '서비스 기본값'),
        ...(token && requested != null ? { requestedTokens: requested } : {}),
        ...(token && granted != null ? { grantedTokens: granted } : {}),
        ...(label === '일일 토큰 수 (키당)' ? { dailyTokenLimit: true } : {}),
      })
    }
    rows.push({ label: '금액 한도 (키당)', requested: request.llmKey?.reqCreditLimit == null ? '희망값 없음' : `$${request.llmKey.reqCreditLimit}`,
      granted: approval.llmKey?.grantedCreditLimit == null || Number(approval.llmKey.grantedCreditLimit) === 0 ? '미부여' : `$${approval.llmKey.grantedCreditLimit}` })
  } else if (request.type === 'GPU') {
    rows.push({ label: 'GPU 임대 기간', requested: gpuDurationLabel(request.gpu?.leaseHours), granted: gpuDurationLabel(approval.gpu?.leaseHours) })
  }
  rows.push({ label: '사용 종료일', requested: request.type === 'DOMAIN' ? '도메인 사용 기한' : request.reqEndDate === null ? '무기한' : request.reqEndDate ?? '종료일 기록 없음',
    granted: request.type === 'DOMAIN' ? '발급 시점의 갱신 기한' : approval.grantedEndDate === null ? '무기한' : approval.grantedEndDate ?? '부여 종료일 미지정' })
  return rows
}
