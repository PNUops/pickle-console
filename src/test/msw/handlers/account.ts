import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse, regularUser, USER_PASSWORD } from './auth'

type Schemas = components['schemas']

const passwordMismatch = (instance: string) =>
  problemResponse({
    type: 'about:blank',
    title: '본인 확인에 실패했습니다',
    status: 403,
    detail: '비밀번호를 다시 확인해 주세요.',
    instance,
    code: 'AUTH_PASSWORD_MISMATCH',
  })

const weakPasswordProblem = (instance: string) =>
  problemResponse({
    type: 'about:blank',
    title: '입력값이 올바르지 않습니다',
    status: 422,
    detail: '요청 값을 확인해 주세요.',
    instance,
    code: 'VALIDATION_FAILED',
    errors: [
      { field: 'newPassword', message: '비밀번호는 8자 이상 72자 이하여야 합니다.' },
    ],
  })

export const accountHandlers: RequestHandler[] = [
  http.put('*/api/v1/me/password', async ({ request }) => {
    const body = (await request.json()) as { currentPassword: string; newPassword: string }
    if (body.currentPassword !== USER_PASSWORD) return passwordMismatch('/api/v1/me/password')
    if (body.newPassword.length < 8) return weakPasswordProblem('/api/v1/me/password')
    const response: Schemas['AuthTokenResponse'] = {
      accessToken: 'access-user',
      user: regularUser,
    }
    return HttpResponse.json(response, { status: 200 })
  }),

  http.post('*/api/v1/me/withdraw', async ({ request }) => {
    const body = (await request.json()) as { password: string }
    if (body.password !== USER_PASSWORD) return passwordMismatch('/api/v1/me/withdraw')
    const response: Schemas['MessageResponse'] = {
      message: '탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.',
    }
    return HttpResponse.json(response, { status: 200 })
  }),

  http.post('*/api/v1/auth/password-reset', () => {
    const response: Schemas['MessageResponse'] = {
      message: '해당 주소가 등록되어 있다면 비밀번호 재설정 메일을 발송했습니다.',
    }
    return HttpResponse.json(response, { status: 202 })
  }),

  http.post('*/api/v1/auth/password-reset/confirm', async ({ request }) => {
    const body = (await request.json()) as { token: string; newPassword: string }
    if (body.token === 'expired-reset-token') {
      return problemResponse({
        type: 'about:blank',
        title: '재설정 링크가 만료되었습니다',
        status: 410,
        detail: '재설정 링크가 만료되었거나 이미 사용되었습니다. 재설정을 다시 요청해 주세요.',
        instance: '/api/v1/auth/password-reset/confirm',
        code: 'AUTH_RESET_TOKEN_EXPIRED',
      })
    }
    if (body.newPassword.length < 8) return weakPasswordProblem('/api/v1/auth/password-reset/confirm')
    const response: Schemas['MessageResponse'] = {
      message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.',
    }
    return HttpResponse.json(response, { status: 200 })
  }),
]
