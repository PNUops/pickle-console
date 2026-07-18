import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'

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

export const studentUser: Schemas['UserSummary'] = {
  id: 42,
  email: 'gildong.hong@pusan.ac.kr',
  name: '홍길동',
  role: 'USER',
}

export const orgAdminUser: Schemas['UserSummary'] = {
  id: 7,
  email: 'admin.kim@pusan.ac.kr',
  name: '김관리',
  role: 'ORG_ADMIN',
}

export const sysAdminUser: Schemas['UserSummary'] = {
  id: 5,
  email: 'sysadmin.lee@pusan.ac.kr',
  name: '이시스템',
  role: 'SYS_ADMIN',
}

/** 두 번째 사용자 계정 — 계정 전환(캐시 격리) 테스트용. */
export const studentBUser: Schemas['UserSummary'] = {
  id: 58,
  email: 'younghee.park@pusan.ac.kr',
  name: '박영희',
  role: 'USER',
}

export const studentProfile: Schemas['UserProfile'] = {
  ...studentUser,
  orgId: null,
  status: 'ACTIVE',
  memberships: [
    { groupId: 7, groupName: '홍길동', groupKind: 'PERSONAL', role: 'OWNER' },
  ],
  mfaEnabled: false,
  pendingConsents: [],
}

export const orgAdminProfile: Schemas['UserProfile'] = {
  ...orgAdminUser,
  orgId: 1,
  status: 'ACTIVE',
  memberships: [
    { groupId: 9, groupName: '김관리', groupKind: 'PERSONAL', role: 'OWNER' },
  ],
  mfaEnabled: false,
  pendingConsents: [],
}

export const sysAdminProfile: Schemas['UserProfile'] = {
  ...sysAdminUser,
  orgId: null,
  status: 'ACTIVE',
  memberships: [
    { groupId: 5, groupName: '이시스템', groupKind: 'PERSONAL', role: 'OWNER' },
  ],
  mfaEnabled: false,
  pendingConsents: [],
}

export const studentBProfile: Schemas['UserProfile'] = {
  ...studentBUser,
  orgId: null,
  status: 'ACTIVE',
  memberships: [
    { groupId: 8, groupName: '박영희', groupKind: 'PERSONAL', role: 'OWNER' },
  ],
  mfaEnabled: false,
  pendingConsents: [],
}

/** A 2FA-enrolled account: login returns a challenge, /auth/mfa completes it. */
export const mfaUser: Schemas['UserSummary'] = {
  id: 61,
  email: 'twofactor@pusan.ac.kr',
  name: '이중인증',
  role: 'USER',
}

export const mfaProfile: Schemas['UserProfile'] = {
  ...mfaUser,
  orgId: null,
  status: 'ACTIVE',
  memberships: [{ groupId: 11, groupName: '이중인증', groupKind: 'PERSONAL', role: 'OWNER' }],
  mfaEnabled: true,
  pendingConsents: [],
}

export const MFA_CHALLENGE_TOKEN = 'mfa-token-1'
export const MFA_VALID_CODE = '123456'
export const MFA_VALID_RECOVERY_CODE = 'abcd-efgh-ijkl'

/** Access tokens the mock /me endpoint accepts, mapped to profiles. */
export const ACCESS_TOKENS: Record<string, Schemas['UserProfile']> = {
  'access-student': studentProfile,
  'access-org-admin': orgAdminProfile,
  'access-sys-admin': sysAdminProfile,
  'access-student-b': studentBProfile,
  'access-mfa': mfaProfile,
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
    const body = (await request.json()) as Schemas['SignupRequest']
    if (body.email === 'duplicate@pusan.ac.kr') {
      return problemResponse({
        type: 'about:blank',
        title: '이미 가입된 이메일입니다',
        status: 409,
        detail: '해당 이메일로 가입된 계정이 이미 존재합니다.',
        code: 'AUTH_EMAIL_ALREADY_REGISTERED',
      })
    }
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
        : body.email === studentUser.email
          ? { user: studentUser, token: 'access-student' }
          : body.email === orgAdminUser.email
            ? { user: orgAdminUser, token: 'access-org-admin' }
            : body.email === studentBUser.email
              ? { user: studentBUser, token: 'access-student-b' }
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

/** Refresh succeeds and issues the given access token (default: student). */
export function refreshSuccessHandler(
  token = 'access-student',
  user: Schemas['UserSummary'] = studentUser,
  onCall?: () => void,
): RequestHandler {
  return http.post('*/api/v1/auth/refresh', () => {
    onCall?.()
    const response: Schemas['AuthTokenResponse'] = { accessToken: token, user }
    return HttpResponse.json(response, { status: 200 })
  })
}
