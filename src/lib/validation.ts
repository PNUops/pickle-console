/** Mirrors the contract regex for signup email (openapi.yaml SignupRequest). */
export const PUSAN_EMAIL_RE = /^[A-Za-z0-9._%+-]+@(pusan\.ac\.kr|pnuops\.com)$/

export const PASSWORD_MIN_LENGTH = 8

/** BCrypt는 72바이트까지만 해시하므로 서버·클라이언트 모두 72를 상한으로 쓴다. */
export const PASSWORD_MAX_LENGTH = 72
export const PASSWORD_MAX_BYTES = 72

/**
 * 서버 비밀번호 정책을 그대로 옮긴 클라이언트 미리보기 결과. 서버도 이 네 가지
 * 외에는 검사하지 않는다 — 유출 코퍼스 차단목록과 이메일 포함 검사는 폐기됐다.
 */
export interface PasswordRuleStatus {
  /** 8자 이상 72자 이하. */
  length: boolean
  /** UTF-8 기준 72바이트 이하(한글은 글자당 3바이트). */
  byteLimit: boolean
  /** 서로 다른 문자가 3종 이상(같은 문자 반복 금지). */
  noRepetition: boolean
  /** 연속된 문자·숫자로만 이루어지지 않음. */
  noSequence: boolean
}

/** UTF-8 바이트 길이(서버의 getBytes(UTF_8).length와 같은 값). */
export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length
}

/** 소문자화 후 영숫자만 남긴 형태 — 반복·연속 판정의 입력(서버와 동일). */
function strip(lowerPassword: string): string {
  return lowerPassword.replace(/[^a-z0-9]/g, '')
}

/** 영숫자만 남긴 문자열이 6자 이상이면서 전부 오름차순 또는 내림차순인지. */
function isSequential(stripped: string): boolean {
  if (stripped.length < 6) return false
  let ascending = true
  let descending = true
  for (let i = 1; i < stripped.length; i += 1) {
    const current = stripped.charCodeAt(i)
    const previous = stripped.charCodeAt(i - 1)
    if (current !== previous + 1) ascending = false
    if (current !== previous - 1) descending = false
  }
  return ascending || descending
}

/**
 * 서버 정책을 미리 계산한다(제출 전 안내용). 판정 권한은 여전히 서버에 있지만,
 * 서버가 보는 규칙이 이제 이 네 가지뿐이라 결과가 갈리지 않는다.
 */
export function passwordRuleStatus(password: string): PasswordRuleStatus {
  const lower = password.toLowerCase()
  const stripped = strip(lower)
  return {
    length: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    byteLimit: passwordByteLength(password) <= PASSWORD_MAX_BYTES,
    noRepetition: new Set(lower).size > 2,
    noSequence: !isSequential(stripped),
  }
}

/** 체크리스트 항목 문구 — 제출 차단 메시지와 같은 문장을 쓴다. */
export const PASSWORD_RULE_LABELS: Record<keyof PasswordRuleStatus, string> = {
  length: `${PASSWORD_MIN_LENGTH}자 이상 ${PASSWORD_MAX_LENGTH}자 이하`,
  byteLimit: `UTF-8 ${PASSWORD_MAX_BYTES}바이트 이하 (한글은 한 글자가 3바이트)`,
  noRepetition: '같은 문자만 반복하지 않기',
  noSequence: '연속된 문자·숫자로만 이루어지지 않기',
}

/** 규칙 순서(체크리스트 표시 순서 = 서버 검사 순서에 맞춘 순서). */
export const PASSWORD_RULE_ORDER: (keyof PasswordRuleStatus)[] = [
  'length',
  'byteLimit',
  'noRepetition',
  'noSequence',
]

/** 규칙 위반 시 폼에 표시할 첫 번째 오류 문구(없으면 null). */
export function passwordRuleError(password: string): string | null {
  const status = passwordRuleStatus(password)
  if (!status.length) {
    return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상 ${PASSWORD_MAX_LENGTH}자 이하여야 합니다.`
  }
  if (!status.byteLimit) {
    return `비밀번호가 너무 깁니다. 한글 등 다국어 문자를 포함하면 더 짧게 입력해 주세요. (UTF-8 ${PASSWORD_MAX_BYTES}바이트 이하)`
  }
  if (!status.noRepetition) return '같은 문자가 반복되는 비밀번호는 사용할 수 없습니다.'
  if (!status.noSequence) return '연속된 문자·숫자로만 이루어진 비밀번호는 사용할 수 없습니다.'
  return null
}

/**
 * 아주 단순한 강도 추정치(0~3). 사전 공격 내성을 계산하지 않으므로 정밀한 점수가
 * 아니라 대략적인 힌트로만 쓴다.
 *
 * 서버 차단목록이 사라진 뒤로 이 막대가 "흔한 비밀번호"에 대해 사용자가 받는
 * 유일한 신호이므로, 길이를 문자 종류보다 무겁게 본다. 종류 수만 높은 짧은
 * 비밀번호(`aaaAAA111!!!` 같은)가 "강함"을 받던 것을 서로 다른 문자 수 상한으로
 * 막는다.
 */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length < PASSWORD_MIN_LENGTH) return 0
  const status = passwordRuleStatus(password)
  if (!status.byteLimit || !status.noRepetition || !status.noSequence) return 0

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length
  const lengthPoints = password.length >= 20 ? 3 : password.length >= 16 ? 2 : password.length >= 12 ? 1 : 0
  const varietyPoints = classes >= 3 ? 1 : 0
  const score = Math.min(3, lengthPoints + varietyPoints)
  // 서로 다른 문자가 적으면 길이·종류와 무관하게 '약함' 이상으로 올리지 않는다.
  return (new Set(password).size < 6 ? Math.min(1, score) : score) as 0 | 1 | 2 | 3
}

/** 강도 점수 표시 문구. */
export const PASSWORD_STRENGTH_LABELS = ['매우 약함', '약함', '보통', '강함'] as const


/**
 * Every identifier that crosses the API boundary is a UUID (contract
 * `format: uuid`), so a route segment that is not one cannot name a row.
 *
 * The console reads ids out of the URL, where anything at all can appear. A
 * malformed id used to be a number that parsed to NaN and silently fetched
 * nothing; matching the shape up front lets a page say "없는 주소" instead of
 * rendering an empty screen.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | undefined | null): value is string {
  return value != null && UUID_RE.test(value)
}

/** 주소의 식별자가 UUID 형식이 아닐 때 상세 화면이 공통으로 쓰는 문구. */
export const INVALID_ID_MESSAGE = '올바르지 않은 주소입니다. 주소를 확인해 주세요.'

/** Mirrors the contract regex for desiredSubdomain (openapi.yaml CreateRequest, 3~40자). */
export const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

/**
 * Mirrors the contract `format: hostname` for customDomain (RFC 1123, 소문자 기준).
 * 입력은 trim + lowercase로 정규화한 뒤 검사/전송한다.
 */
export const HOSTNAME_RE =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/

/** 커스텀 도메인 입력 정규화: 앞뒤 공백 제거 + 소문자화 (전송·검증 공통). */
export function normalizeCustomDomain(value: string): string {
  return value.trim().toLowerCase()
}

/** HOSTNAME_RE 불일치 시 신청서·공개 폼이 공통으로 쓰는 필드 오류 문구. */
export const CUSTOM_DOMAIN_FORMAT_MESSAGE =
  '커스텀 도메인 형식이 올바르지 않습니다. (예: myapp.example.com)'
