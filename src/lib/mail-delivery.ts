import { listPage } from './list-url'
import { adminPaths } from './paths'
import { isUuid } from './validation'
import { DELIVERY_STATUS_LABELS } from './status'

export const MAIL_SOURCE_LABELS: Record<string, string> = { NOTIFICATION: '업무 알림', ACCOUNT: '계정 메일' }
export const MAIL_MODE_LABELS: Record<string, string> = { DESIGNATED: '지정 수신자', ALL_APPROVERS: '활성 기관 승인자 전체', LEGACY: '기존 수신 정책' }
export const MAIL_STATUS_LABELS: Record<string, string> = DELIVERY_STATUS_LABELS
export const MAIL_QUEUE_LABELS: Record<string, string> = {
  NORMAL_WAIT: '일반 대기', BUNDLE_WAIT: '묶음 대기', RETRY_WAIT: '재시도 대기', ACCOUNT_WAIT: '계정 메일 대기',
  SENDING: 'SMTP 처리 중', SENT: 'SMTP 인계', FAILED: '발송 실패', SKIPPED: '발송 생략', UNKNOWN: '결과 확인 필요',
}
export const MAIL_QUEUE_FILTERS = Object.entries(MAIL_QUEUE_LABELS)

const MAIL_FAILURE_LABELS: Record<string, string> = {
  SMTP_TRANSIENT: 'SMTP 일시 오류', SMTP_PERMANENT: 'SMTP 영구 오류', SMTP_ERROR: 'SMTP 오류',
  QUEUE_FULL: '메모리 큐가 가득 참', CONTENT_EXPIRED: '발송 본문 보존 기간이 지남',
  ACCOUNT_RESEND_UNSUPPORTED: '계정 메일은 원래 요청 화면에서 다시 요청', LEGACY_ADDRESS_UNKNOWN: '발송 당시 주소가 기록되지 않음',
  NOT_FAILED: '실패 상태에서만 재발송 가능', UNKNOWN_OUTCOME: '기존 SMTP 처리 결과 확인 필요',
  PROCESS_UNCONFIRMED: '이 서버가 이어서 처리하는 메모리 큐인지 확인되지 않음',
  LEGACY_FAILURE_UNCONFIRMED: '기존 실패 기록의 SMTP 미인계 여부를 확인할 수 없음',
  ACCOUNT_SELF_RETRY: '계정 메일은 원래 요청 화면에서 다시 요청', ACCOUNT_INACTIVE: '계정 비활성으로 생략',
  MAIL_CONNECTION_FAILED: '메일 서버 연결 실패', MAIL_AUTHENTICATION_FAILED: '메일 서버 인증 실패',
  MAIL_PREPARATION_FAILED: '메일 구성 실패', SMTP_REJECTED: 'SMTP 발송 거절',
  MAIL_DELIVERY_DISABLED: '메일 발송이 비활성화됨', MAIL_DELIVERY_UNKNOWN: 'SMTP 인계 결과 확인 불가',
  ATTEMPT_INTERRUPTED: '처리 중단으로 SMTP 인계 결과 확인 불가', RESULT_NOT_RECORDED: 'SMTP 처리 결과가 기록되지 않음',
  QUEUE_STOPPED: '메모리 큐 종료로 생략', EXPIRED_MESSAGE: '계정 메일 유효기간이 지나 생략',
  PROCESS_STOPPED: '서버 처리 중단으로 인계 결과 확인 불가', RESULT_PERSISTENCE_FAILED: 'SMTP 처리 결과를 기록하지 못함',
  LEGACY_STATUS_IMPORT: '기존 누적 상태에서 보존한 기록',
}
export function mailFailureLabel(code?: string | null): string {
  return code ? MAIL_FAILURE_LABELS[code] ?? code : '기록 없음'
}
export function mailAttemptOutcomeLabel(outcome: string): string {
  return outcome === 'STARTED' ? '시도 시작 · 종료 기록 없음' : MAIL_STATUS_LABELS[outcome] ?? outcome
}

export function mayResendMail(delivery: { sourceKind: string; status: string; canResend: boolean; legacyAddressUnknown: boolean; recipientEmail?: string | null }): boolean {
  return delivery.sourceKind === 'NOTIFICATION' && delivery.status === 'FAILED' && delivery.canResend && !delivery.legacyAddressUnknown && !!delivery.recipientEmail
}

export function mailDeliveryListState(params: URLSearchParams) {
  const selected = params.get('selected')
  const target = (key: string) => {
    const value = params.get(key)
    return value && isUuid(value) ? value.toLowerCase() : value || undefined
  }
  return {
    sourceKind: Object.hasOwn(MAIL_SOURCE_LABELS, params.get('sourceKind') ?? '') ? params.get('sourceKind')! : undefined,
    status: Object.hasOwn(MAIL_STATUS_LABELS, params.get('status') ?? '') ? params.get('status')! : undefined,
    queueState: MAIL_QUEUE_FILTERS.some(([code]) => code === params.get('queueState')) ? params.get('queueState')! : undefined,
    event: params.get('event') || undefined, email: params.get('email') || undefined,
    requestId: target('requestId'), announcementId: target('announcementId'),
    orgId: target('orgId'),
    selected: selected && isUuid(selected) ? selected.toLowerCase() : undefined,
    invalidSelected: !!selected && !isUuid(selected),
    invalidTarget: ['requestId', 'announcementId', 'orgId'].some((key) => !!params.get(key) && !isUuid(params.get(key))),
    page: listPage(params.get('page')),
  }
}

export function mailDeliveryListParams(params: URLSearchParams): URLSearchParams {
  const state = mailDeliveryListState(params)
  const next = new URLSearchParams(params)
  for (const key of ['sourceKind', 'status', 'queueState'] as const) {
    if (state[key]) next.set(key, state[key])
    else next.delete(key)
  }
  if (state.page === 0) next.delete('page')
  else next.set('page', String(state.page))
  if (state.selected) next.set('selected', state.selected)
  for (const key of ['requestId', 'announcementId', 'orgId'] as const) if (state[key]) next.set(key, state[key])
  return next
}

/** Only known administrator detail routes are suitable for archived notification links. */
export function mailDeliveryResourcePath(linkPath: string | null | undefined, orgId?: string | null): string | null {
  if (!linkPath) return null
  let url: URL
  try { url = new URL(linkPath, 'https://pickle.invalid') } catch { return null }
  if (url.origin !== 'https://pickle.invalid') return null
  const match = /^\/(?:console|admin)\/(vms|llm-keys|llm\/keys|requests|gpus)\/([^/]+)$/.exec(url.pathname)
  if (!match || !isUuid(match[2])) return null
  const id = match[2].toLowerCase()
  const candidateOrg = orgId ?? url.searchParams.get('org')
  const targetOrg = candidateOrg && isUuid(candidateOrg) ? candidateOrg.toLowerCase() : undefined
  if (match[1] === 'vms') return adminPaths.vmDetail(id, targetOrg)
  if (match[1] === 'llm-keys' || match[1] === 'llm/keys') return adminPaths.llmKeyDetail(id, targetOrg)
  if (match[1] === 'requests') return adminPaths.requestDetail(id, targetOrg)
  if (match[1] === 'gpus') return adminPaths.gpuDetail(id, targetOrg)
  return null
}
