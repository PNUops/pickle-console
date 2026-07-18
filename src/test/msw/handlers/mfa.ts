import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { MFA_VALID_CODE, MFA_VALID_RECOVERY_CODE, problemResponse, USER_PASSWORD } from './auth'

type Schemas = components['schemas']

export const MOCK_RECOVERY_CODES = [
  'aaaa-bbbb-cccc',
  'dddd-eeee-ffff',
  'gggg-hhhh-iiii',
  'jjjj-kkkk-llll',
  'mmmm-nnnn-oooo',
  'pppp-qqqq-rrrr',
  'ssss-tttt-uuuu',
  'vvvv-wwww-xxxx',
  'yyyy-zzzz-0000',
  '1111-2222-3333',
]

const codeInvalid = (instance: string) =>
  problemResponse({
    type: 'about:blank',
    title: '인증 코드가 올바르지 않습니다',
    status: 403,
    detail: '인증 앱의 최신 코드를 확인해 주세요.',
    instance,
    code: 'AUTH_MFA_CODE_INVALID',
  })

export const mfaHandlers: RequestHandler[] = [
  http.post('*/api/v1/me/mfa/totp', async ({ request }) => {
    const body = (await request.json()) as { password: string }
    if (body.password !== USER_PASSWORD) {
      return problemResponse({
        type: 'about:blank',
        title: '본인 확인에 실패했습니다',
        status: 403,
        detail: '비밀번호를 다시 확인해 주세요.',
        instance: '/api/v1/me/mfa/totp',
        code: 'AUTH_PASSWORD_MISMATCH',
      })
    }
    const response: Schemas['MfaSetupResponse'] = {
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/Pickle:twofactor@pusan.ac.kr?secret=JBSWY3DPEHPK3PXP&issuer=Pickle',
    }
    return HttpResponse.json(response, { status: 200 })
  }),

  http.post('*/api/v1/me/mfa/totp/activate', async ({ request }) => {
    const body = (await request.json()) as { code: string }
    if (body.code !== MFA_VALID_CODE) return codeInvalid('/api/v1/me/mfa/totp/activate')
    const response: Schemas['MfaRecoveryCodesResponse'] = { recoveryCodes: MOCK_RECOVERY_CODES }
    return HttpResponse.json(response, { status: 200 })
  }),

  http.post('*/api/v1/me/mfa/disable', async ({ request }) => {
    const body = (await request.json()) as {
      password: string
      code?: string
      recoveryCode?: string
    }
    const codeOk = body.code === MFA_VALID_CODE || body.recoveryCode === MFA_VALID_RECOVERY_CODE
    if (body.password !== USER_PASSWORD || !codeOk) return codeInvalid('/api/v1/me/mfa/disable')
    const response: Schemas['MessageResponse'] = { message: '2단계 인증이 해제되었습니다.' }
    return HttpResponse.json(response, { status: 200 })
  }),

  http.post('*/api/v1/me/mfa/recovery-codes', async ({ request }) => {
    const body = (await request.json()) as { password: string; code: string }
    if (body.password !== USER_PASSWORD || body.code !== MFA_VALID_CODE) {
      return codeInvalid('/api/v1/me/mfa/recovery-codes')
    }
    const response: Schemas['MfaRecoveryCodesResponse'] = { recoveryCodes: MOCK_RECOVERY_CODES }
    return HttpResponse.json(response, { status: 200 })
  }),

  // Admin 2FA reset — default success; tests override for the 409 (not-enrolled) case.
  http.post('*/api/v1/admin/users/:userId/mfa-reset', () => {
    const response: Schemas['MessageResponse'] = {
      message: '2단계 인증을 초기화했습니다. 사용자는 비밀번호로 로그인한 뒤 다시 등록해야 합니다.',
    }
    return HttpResponse.json(response, { status: 200 })
  }),
]
