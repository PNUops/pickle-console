import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { uuid } from '../ids'

type Schemas = components['schemas']

/** Build an RFC 9457 problem+json response matching the contract's Problem schema. */
export function problemResponse(problem: Schemas['Problem']) {
  return HttpResponse.json(problem as Record<string, unknown>, {
    status: problem.status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

/* ─── fixture accounts ─── */

export const USER_PASSWORD = 'correct-horse-battery!'

export const regularUser: Schemas['UserSummaryResponse'] = {
  id: uuid(42),
  email: 'example@pusan.ac.kr',
  name: '홍길동',
  role: 'USER',
}

export const orgAdminUser: Schemas['UserSummaryResponse'] = {
  id: uuid(7),
  email: 'admin.kim@pusan.ac.kr',
  name: '김관리',
  role: 'ORG_ADMIN',
}

export const sysAdminUser: Schemas['UserSummaryResponse'] = {
  id: uuid(5),
  email: 'sysadmin.lee@pusan.ac.kr',
  name: '이시스템',
  role: 'SYS_ADMIN',
}

/** 기관 운영자 — ORG_ADMIN 하위, 같은 기관(orgId=1) 스코프. */
export const orgManagerUser: Schemas['UserSummaryResponse'] = {
  id: uuid(8),
  email: 'manager.choi@pusan.ac.kr',
  name: '최운영',
  role: 'ORG_MANAGER',
}

/** 시스템 운영자 — SYS_ADMIN 하위, 전 기관 조회. */
export const sysManagerUser: Schemas['UserSummaryResponse'] = {
  id: uuid(6),
  email: 'sysmanager.jung@pusan.ac.kr',
  name: '정시스템운영',
  role: 'SYS_MANAGER',
}

/** 두 번째 사용자 계정 — 계정 전환(캐시 격리) 테스트용. */
export const regularUserB: Schemas['UserSummaryResponse'] = {
  id: uuid(58),
  email: 'younghee.park@pusan.ac.kr',
  name: '박영희',
  role: 'USER',
}

export const regularProfile: Schemas['UserProfileResponse'] = {
  ...regularUser,
  orgId: null,
  status: 'ACTIVE',
  memberships: [
    { workspaceId: uuid(7), workspaceName: '홍길동', workspaceKind: 'PERSONAL', role: 'OWNER' },
  ],
  mfaEnabled: false,
  pendingConsents: [],
}

export const orgAdminProfile: Schemas['UserProfileResponse'] = {
  ...orgAdminUser,
  orgId: uuid(1),
  status: 'ACTIVE',
  memberships: [
    { workspaceId: uuid(9), workspaceName: '김관리', workspaceKind: 'PERSONAL', role: 'OWNER' },
  ],
  mfaEnabled: false,
  pendingConsents: [],
}

export const sysAdminProfile: Schemas['UserProfileResponse'] = {
  ...sysAdminUser,
  orgId: null,
  status: 'ACTIVE',
  memberships: [
    { workspaceId: uuid(5), workspaceName: '이시스템', workspaceKind: 'PERSONAL', role: 'OWNER' },
  ],
  mfaEnabled: false,
  pendingConsents: [],
}

export const orgManagerProfile: Schemas['UserProfileResponse'] = {
  ...orgManagerUser,
  orgId: uuid(1),
  status: 'ACTIVE',
  memberships: [
    { workspaceId: uuid(12), workspaceName: '최운영', workspaceKind: 'PERSONAL', role: 'OWNER' },
  ],
  mfaEnabled: false,
  pendingConsents: [],
}

export const sysManagerProfile: Schemas['UserProfileResponse'] = {
  ...sysManagerUser,
  orgId: null,
  status: 'ACTIVE',
  memberships: [
    { workspaceId: uuid(13), workspaceName: '정시스템운영', workspaceKind: 'PERSONAL', role: 'OWNER' },
  ],
  mfaEnabled: false,
  pendingConsents: [],
}

export const regularProfileB: Schemas['UserProfileResponse'] = {
  ...regularUserB,
  orgId: null,
  status: 'ACTIVE',
  memberships: [
    { workspaceId: uuid(8), workspaceName: '박영희', workspaceKind: 'PERSONAL', role: 'OWNER' },
  ],
  mfaEnabled: false,
  pendingConsents: [],
}

/** A 2FA-enrolled account: login returns a challenge, /auth/mfa completes it. */
export const mfaUser: Schemas['UserSummaryResponse'] = {
  id: uuid(61),
  email: 'twofactor@pusan.ac.kr',
  name: '이중인증',
  role: 'USER',
}

export const mfaProfile: Schemas['UserProfileResponse'] = {
  ...mfaUser,
  orgId: null,
  status: 'ACTIVE',
  memberships: [{ workspaceId: uuid(11), workspaceName: '이중인증', workspaceKind: 'PERSONAL', role: 'OWNER' }],
  mfaEnabled: true,
  pendingConsents: [],
}

export const MFA_CHALLENGE_TOKEN = 'mfa-token-1'
export const MFA_VALID_CODE = '123456'
export const MFA_VALID_RECOVERY_CODE = 'abcd-efgh-ijkl'

/** Access tokens the mock /me endpoint accepts, mapped to profiles. */
export const ACCESS_TOKENS: Record<string, Schemas['UserProfileResponse']> = {
  'access-user': regularProfile,
  'access-org-admin': orgAdminProfile,
  'access-org-manager': orgManagerProfile,
  'access-sys-admin': sysAdminProfile,
  'access-sys-manager': sysManagerProfile,
  'access-user-b': regularProfileB,
  'access-mfa': mfaProfile,
}

/* ─── 재인증 (sudo-mode) ─── */

/** POST /auth/reverify가 발급하는 목 토큰 — 민감 작업이 헤더로 요구한다. */
export const REAUTH_TOKEN = 'reauth-token-1'

/** 이 비밀번호로 재확인을 시도하면 잠금(429)을 흉내 낸다. */
export const RATE_LIMITED_PASSWORD = 'rate-limited-password'

export const reauthRequiredProblem: Schemas['Problem'] = {
  type: 'about:blank',
  title: '재인증이 필요합니다',
  status: 403,
  detail: '민감한 작업입니다. 비밀번호를 다시 확인해 주세요.',
  code: 'REAUTH_REQUIRED',
}

export const unauthorizedProblem: Schemas['Problem'] = {
  type: 'about:blank',
  title: '인증이 필요합니다',
  status: 401,
  detail: '액세스 토큰이 없거나 만료되었습니다.',
  code: 'AUTH_TOKEN_INVALID',
}

/* ─── default handlers ─── */

export const authHandlers: RequestHandler[] = [
  http.post('*/api/v1/auth/signup', async ({ request }) => {
    // 계정 열거 방지: 이미 가입된 주소든 아니든 서버 응답은 항상 같은 202.
    await request.json()
    const response: Schemas['MessageResponse'] = {
      message: '인증 메일을 발송했습니다. 메일함을 확인해 주세요.',
    }
    return HttpResponse.json(response, { status: 202 })
  }),

  http.post('*/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as Schemas['LoginRequest']
    if (body.email === 'unverified@pusan.ac.kr') {
      return problemResponse({
        type: 'about:blank',
        title: '이메일 인증이 필요합니다',
        status: 403,
        detail: '가입 시 발송된 인증 메일을 확인한 뒤 다시 로그인해 주세요.',
        code: 'AUTH_EMAIL_NOT_VERIFIED',
      })
    }
    if (body.email === 'ratelimited@pusan.ac.kr') {
      return problemResponse({
        type: 'about:blank',
        title: '요청이 너무 많습니다',
        status: 429,
        detail: '잠시 후 다시 시도해 주세요.',
        code: 'RATE_LIMITED',
      })
    }
    // 2FA-enrolled account: stage-1 returns a challenge, not tokens.
    if (body.email === mfaUser.email && body.password === USER_PASSWORD) {
      const challenge: Schemas['MfaChallengeResponse'] = {
        mfaRequired: true,
        mfaToken: MFA_CHALLENGE_TOKEN,
      }
      return HttpResponse.json(challenge, { status: 200 })
    }
    const account =
      body.password !== USER_PASSWORD
        ? null
        : body.email === regularUser.email
          ? { user: regularUser, token: 'access-user' }
          : body.email === orgAdminUser.email
            ? { user: orgAdminUser, token: 'access-org-admin' }
            : body.email === regularUserB.email
              ? { user: regularUserB, token: 'access-user-b' }
              : null
    if (!account) {
      return problemResponse({
        type: 'about:blank',
        title: '로그인에 실패했습니다',
        status: 401,
        detail: '이메일 또는 비밀번호가 올바르지 않습니다.',
        code: 'AUTH_INVALID_CREDENTIALS',
      })
    }
    const response: Schemas['AuthTokenResponse'] = {
      accessToken: account.token,
      user: account.user,
    }
    return HttpResponse.json(response, { status: 200 })
  }),

  http.post('*/api/v1/auth/mfa', async ({ request }) => {
    const body = (await request.json()) as {
      mfaToken: string
      code?: string
      recoveryCode?: string
    }
    if (body.mfaToken !== MFA_CHALLENGE_TOKEN) {
      return problemResponse({
        type: 'about:blank',
        title: '인증 세션이 만료되었습니다',
        status: 410,
        detail: '2단계 인증 시간이 지났습니다. 처음부터 다시 로그인해 주세요.',
        code: 'AUTH_MFA_TOKEN_EXPIRED',
      })
    }
    if (body.code === MFA_VALID_CODE || body.recoveryCode === MFA_VALID_RECOVERY_CODE) {
      const response: Schemas['AuthTokenResponse'] = { accessToken: 'access-mfa', user: mfaUser }
      return HttpResponse.json(response, { status: 200 })
    }
    return problemResponse({
      type: 'about:blank',
      title: '인증 코드가 올바르지 않습니다',
      status: 401,
      detail: '입력한 코드가 올바르지 않습니다. 인증 앱의 최신 코드를 확인해 주세요.',
      code: 'AUTH_MFA_CODE_INVALID',
    })
  }),

  // Default: no refresh cookie / expired session.
  http.post('*/api/v1/auth/refresh', () =>
    problemResponse({
      type: 'about:blank',
      title: '세션이 만료되었습니다',
      status: 401,
      detail: '다시 로그인해 주세요.',
      code: 'AUTH_REFRESH_TOKEN_INVALID',
    }),
  ),

  http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),

  // 재인증(sudo-mode): 비밀번호를 다시 확인하고 10분짜리 다회용 토큰을 발급한다.
  http.post('*/api/v1/auth/reverify', async ({ request }) => {
    const body = (await request.json()) as Schemas['ReverifyRequest']
    if (body.password === RATE_LIMITED_PASSWORD) {
      return problemResponse({
        type: 'about:blank',
        title: '요청이 너무 많습니다',
        status: 429,
        detail: '비밀번호 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        code: 'RATE_LIMITED',
      })
    }
    if (body.password !== USER_PASSWORD) {
      return problemResponse({
        type: 'about:blank',
        title: '비밀번호가 올바르지 않습니다',
        status: 403,
        detail: '비밀번호가 일치하지 않습니다.',
        code: 'AUTH_PASSWORD_MISMATCH',
      })
    }
    const response: Schemas['ReverifyResponse'] = {
      reauthToken: REAUTH_TOKEN,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }
    return HttpResponse.json(response, { status: 200 })
  }),

  http.post('*/api/v1/auth/verify-email', async ({ request }) => {
    const { token } = (await request.json()) as { token: string }
    if (token === 'valid-token') {
      const response: Schemas['MessageResponse'] = {
        message: '이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.',
      }
      return HttpResponse.json(response, { status: 200 })
    }
    if (token === 'expired-token') {
      return problemResponse({
        type: 'about:blank',
        title: '인증 토큰이 만료되었습니다',
        status: 410,
        detail: '인증 링크가 만료되었거나 이미 사용되었습니다. 인증 메일을 다시 요청해 주세요.',
        code: 'AUTH_VERIFICATION_TOKEN_EXPIRED',
      })
    }
    return problemResponse({
      type: 'about:blank',
      title: '입력값이 올바르지 않습니다',
      status: 422,
      detail: '유효하지 않은 인증 토큰입니다.',
      code: 'VALIDATION_FAILED',
    })
  }),

  http.post('*/api/v1/auth/resend-verification', () => {
    const response: Schemas['MessageResponse'] = {
      message: '해당 주소가 등록되어 있다면 인증 메일을 다시 발송했습니다.',
    }
    return HttpResponse.json(response, { status: 202 })
  }),

  http.get('*/api/v1/me', ({ request }) => {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const profile = ACCESS_TOKENS[token]
    if (!profile) return problemResponse(unauthorizedProblem)
    return HttpResponse.json(profile, { status: 200 })
  }),
]

/* ─── overrides for specific test scenarios ─── */

/**
 * 민감 작업의 재인증 게이트를 켠다 (opt-in — 기본 핸들러는 헤더를 요구하지 않으므로
 * 기존 스위트가 그대로 통과한다). `server.use(...reauthGateHandlers('DELETE /vms/:vmId'))`
 * 처럼 쓰면 해당 경로는 `X-Reauth-Token`이 없을 때 403 REAUTH_REQUIRED를 돌려주고,
 * 헤더가 있으면 undefined를 반환해 원래(기본) 핸들러로 넘어간다.
 *
 * spec 형식: `'<METHOD> <path>'` — path는 `/api/v1` 아래의 계약 경로(MSW 패턴,
 * 예: `/vms/:vmId/ssh-key/private-key`).
 */
export function reauthGateHandlers(...specs: string[]): RequestHandler[] {
  return specs.map((spec) => {
    const [method, path] = spec.split(' ')
    const resolver = ({ request }: { request: Request }) =>
      request.headers.get('X-Reauth-Token')
        ? undefined
        : problemResponse({ ...reauthRequiredProblem, instance: `/api/v1${path}` })
    const url = `*/api/v1${path}`
    switch (method.toUpperCase()) {
      case 'GET':
        return http.get(url, resolver)
      case 'POST':
        return http.post(url, resolver)
      case 'PATCH':
        return http.patch(url, resolver)
      case 'DELETE':
        return http.delete(url, resolver)
      default:
        throw new Error(`reauthGateHandlers: unsupported method ${method}`)
    }
  })
}

/** Refresh succeeds and issues the given access token (default: the regular user). */
export function refreshSuccessHandler(
  token = 'access-user',
  user: Schemas['UserSummaryResponse'] = regularUser,
  onCall?: () => void,
): RequestHandler {
  return http.post('*/api/v1/auth/refresh', () => {
    onCall?.()
    const response: Schemas['AuthTokenResponse'] = { accessToken: token, user }
    return HttpResponse.json(response, { status: 200 })
  })
}
