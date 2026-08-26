import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test } from 'vitest'
import { server } from '../test/msw/server'
import { setAccessToken } from './token'
import { api } from './client'
import { onMfaEnrollmentRequired, resetMfaEnrollmentRequired } from './mfa-enrollment'

/**
 * 관리자 2FA 강제가 켜지면 미등록 시스템 계층 계정은 면제된 몇 개를 뺀 모든
 * 요청에서 403 `MFA_ENROLLMENT_REQUIRED`를 받는다. 화면마다 오류를 띄우는 대신
 * 클라이언트 계층에서 한 번 잡아 등록 화면으로 보내는데, 여기서 보는 것은 그
 * 신호가 정확히 그 코드에만 발화하는지다.
 */
describe('2FA 등록 요구 403 감지', () => {
  // 래치는 모듈 상태라 테스트 사이에 넘어간다. 앞 테스트가 남긴 값으로
  // 뒤 테스트가 통과하면 그 테스트는 아무것도 재지 않는다.
  beforeEach(resetMfaEnrollmentRequired)

  test('403 MFA_ENROLLMENT_REQUIRED 응답이 등록 안내 알림을 발화한다', async () => {
    setAccessToken('access-admin')
    server.use(
      http.get('*/api/v1/notifications/unread-count', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '2단계 인증 등록이 필요합니다',
            status: 403,
            code: 'MFA_ENROLLMENT_REQUIRED',
          },
          { status: 403 },
        ),
      ),
    )
    let fired = false
    const off = onMfaEnrollmentRequired(() => {
      fired = true
    })

    await api.GET('/notifications/unread-count')
    await waitFor(() => expect(fired).toBe(true))
    off()
  })

  // 재인증 요구도 같은 403이고 같은 자리를 지난다. 코드를 보지 않고 상태만
  // 보면 비밀번호를 다시 묻는 자리에서 사용자가 2FA 등록 화면으로 끌려간다.
  test('같은 403이라도 REAUTH_REQUIRED는 발화하지 않는다', async () => {
    setAccessToken('access-admin')
    server.use(
      http.get('*/api/v1/notifications/unread-count', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '재인증이 필요합니다',
            status: 403,
            code: 'REAUTH_REQUIRED',
          },
          { status: 403 },
        ),
      ),
    )
    let fired = false
    const off = onMfaEnrollmentRequired(() => {
      fired = true
    })

    await api.GET('/notifications/unread-count')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fired).toBe(false)
    off()
  })

  test('403이 아닌 응답은 발화하지 않는다', async () => {
    setAccessToken('access-admin')
    let fired = false
    const off = onMfaEnrollmentRequired(() => {
      fired = true
    })

    await api.GET('/notifications/unread-count')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fired).toBe(false)
    off()
  })
})
