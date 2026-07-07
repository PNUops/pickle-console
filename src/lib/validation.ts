/** Mirrors the contract regex for signup email (openapi.yaml SignupRequest). */
export const PUSAN_EMAIL_RE = /^[A-Za-z0-9._%+-]+@pusan\.ac\.kr$/

export const PASSWORD_MIN_LENGTH = 10

/** Mirrors the contract regex for group slug (openapi.yaml CreateGroupRequest). */
export const GROUP_SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/

/** Mirrors the contract regex for desiredSubdomain (openapi.yaml CreateVmRequest, 3~40자). */
export const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
