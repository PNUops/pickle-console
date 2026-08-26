import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse, regularUser } from './auth'

type Schemas = components['schemas']

/** 이 코드를 보내면 계정이 없는 신원으로 취급해 가입 토큰을 돌려준다. */
export const NEW_ACCOUNT_CODE = 'code-new-account'
/** 이미 계정이 있는 신원. 바로 토큰이 나온다. */
export const EXISTING_ACCOUNT_CODE = 'code-existing-account'
/** 학교 밖 계정. */
export const OUTSIDE_DOMAIN_CODE = 'code-outside-domain'

export const REGISTRATION_TOKEN = 'registration-token-1'

/** 계정 화면에서 시작한 연동. 콜백이 토큰 없이 연동 완료만 답한다. */
export const LINK_CODE = 'code-link'

/** 민감 작업 앞에서 시작한 본인 확인. 콜백이 재인증 토큰을 답한다. */
export const REVERIFY_CODE = 'code-reverify'
export const REVERIFY_TOKEN = 'reauth-token-google-1'

/** 2FA 를 켠 계정. 콜백이 토큰이 아니라 챌린지를 답한다. */
export const MFA_ACCOUNT_CODE = 'code-mfa-account'
export const MFA_TOKEN = 'mfa-token-google-1'

export const googleOauthHandlers: RequestHandler[] = [
  http.post('*/api/v1/auth/oauth/google/start', () =>
    HttpResponse.json(
      {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=state-1&nonce=n',
        state: 'state-1',
        expiresAt: '2026-08-25T10:00:00Z',
      } satisfies Schemas['OauthStartResponse'],
      { status: 200 },
    ),
  ),

  http.post('*/api/v1/auth/oauth/google/callback', async ({ request }) => {
    const body = (await request.json()) as { code: string }
    if (body.code === OUTSIDE_DOMAIN_CODE) {
      return problemResponse({
        type: 'about:blank',
        title: '사용할 수 없는 구글 계정입니다',
        status: 403,
        detail: '부산대학교 구글 계정(@pusan.ac.kr)으로만 로그인할 수 있습니다.',
        instance: '/api/v1/auth/oauth/google/callback',
        code: 'AUTH_OAUTH_DOMAIN_NOT_ALLOWED',
      })
    }
    if (body.code === LINK_CODE) {
      return HttpResponse.json(
        { kind: 'LINKED' } satisfies Schemas['OauthLinkedResponse'],
        { status: 200 },
      )
    }
    if (body.code === REVERIFY_CODE) {
      return HttpResponse.json(
        {
          reauthToken: REVERIFY_TOKEN,
          expiresAt: '2099-01-01T00:00:00Z',
        } satisfies Schemas['ReverifyResponse'],
        { status: 200 },
      )
    }
    if (body.code === MFA_ACCOUNT_CODE) {
      return HttpResponse.json(
        { mfaRequired: true, mfaToken: MFA_TOKEN } satisfies Schemas['MfaChallengeResponse'],
        { status: 200 },
      )
    }
    if (body.code === NEW_ACCOUNT_CODE) {
      return HttpResponse.json(
        {
          kind: 'REGISTRATION_REQUIRED',
          registrationToken: REGISTRATION_TOKEN,
          email: 'new.google@pusan.ac.kr',
          name: '구글사용자',
          expiresAt: '2026-08-25T10:15:00Z',
        } satisfies Schemas['OauthRegistrationResponse'],
        { status: 200 },
      )
    }
    return HttpResponse.json(
      { accessToken: 'access-user', user: regularUser } satisfies Schemas['AuthTokenResponse'],
      { status: 200 },
    )
  }),

  http.post('*/api/v1/auth/oauth/google/complete', () =>
    HttpResponse.json(
      { accessToken: 'access-user', user: regularUser } satisfies Schemas['AuthTokenResponse'],
      { status: 200 },
    ),
  ),
]
