/** Mirrors the contract regex for signup email (openapi.yaml SignupRequest). */
export const PUSAN_EMAIL_RE = /^[A-Za-z0-9._%+-]+@pusan\.ac\.kr$/

export const PASSWORD_MIN_LENGTH = 10

/** Mirrors the contract regex for group slug (openapi.yaml CreateGroupRequest). */
export const GROUP_SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/

/** Mirrors the contract regex for org slug (openapi.yaml POST /admin/orgs). */
export const ORG_SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/

/** Mirrors the contract regex for desiredSubdomain (openapi.yaml CreateVmRequest, 3~40자). */
export const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

/**
 * Mirrors the contract `format: hostname` for customDomain (RFC 1123, 소문자 기준).
 * 입력은 trim + lowercase로 정규화한 뒤 검사/전송한다.
 */
export const HOSTNAME_RE =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/
