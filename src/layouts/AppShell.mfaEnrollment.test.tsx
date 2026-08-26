import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import {
  notifyMfaEnrollmentRequired,
  resetMfaEnrollmentRequired,
} from '../api/mfa-enrollment'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

/**
 * 셸이 실제로 이동을 **시도**했는지를 본다. 계정 화면이 `enroll` 파라미터를
 * 도착 즉시 지우기 때문에 최종 주소만으로는 이동이 있었는지 없었는지 알 수 없고,
 * 그 상태에서 경로를 단정하면 가드를 통째로 지워도 통과하는 테스트가 된다.
 */
const navigations: string[] = []
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => {
      const navigate = actual.useNavigate()
      return (to: unknown, options?: unknown) => {
        if (typeof to === 'string') navigations.push(to)
        return (navigate as (t: unknown, o?: unknown) => unknown)(to, options)
      }
    },
  }
})

/**
 * 관리자 2FA 강제가 켜졌는데 아직 등록하지 않은 시스템 계층 계정의 동선.
 *
 * <p>서버는 면제한 몇 개(`/me`, `/me/mfa/**`, `/auth/**`, `/meta/**`) 밖의 모든
 * 요청에 403 `MFA_ENROLLMENT_REQUIRED`로 답한다. 로그인이 막힌 것이 아니라
 * 범위가 좁혀진 것이고 등록 화면은 언제나 열려 있는데, **거기로 가라는 안내가
 * 없다**는 것이 이 처리가 존재하는 이유다. 안내가 없으면 관리자는 오류로 덮인
 * 화면을 보고 주소를 직접 쳐야 한다.
 */
const mfaRequired = () =>
  HttpResponse.json(
    {
      type: 'about:blank',
      title: '2단계 인증 등록이 필요합니다',
      status: 403,
      code: 'MFA_ENROLLMENT_REQUIRED',
    },
    { status: 403 },
  )

/**
 * 면제 밖 관리자 조회 전부가 같은 403을 답하는 상태를 만들고, 그 403이 실제로
 * 몇 번 나갔는지를 센다. **세지 않으면 「이동하지 않았다」가 「신호가 오지 않았다」와
 * 구분되지 않는다** — 가드를 통째로 지워도 초록인 테스트가 된다.
 */
function enforceMfaEnrollment(): { hits: () => number } {
  let count = 0
  const deny = () => {
    count += 1
    return mfaRequired()
  }
  server.use(
    http.get('*/api/v1/admin/*', deny),
    http.get('*/api/v1/notifications/unread-count', deny),
  )
  return { hits: () => count }
}

describe('2FA 등록 요구 시 등록 화면 안내 (AppShell)', () => {
  // 래치는 모듈 상태라 테스트 사이에 넘어간다. 앞 테스트가 남긴 값으로
  // 뒤 테스트가 통과하면 그 테스트는 아무것도 재지 않는다.
  beforeEach(resetMfaEnrollmentRequired)

  test('관리자 화면에서 403을 만나면 계정 설정의 등록 마법사로 데려간다', async () => {
    const denied = enforceMfaEnrollment()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/vms')

    // 등록 마법사를 바로 여는 파라미터까지 실려야 한다. 경로만 맞으면 계정
    // 화면에 도착하고도 무엇을 해야 하는지가 여전히 안 보인다.
    await waitFor(() => {
      expect(currentPath()).toBe('/admin/account?enroll=2fa')
    })
    expect(denied.hits()).toBeGreaterThan(0)
  })

  // 첫 요청이 셸의 구독보다 먼저 답하는 창이 있다. 신호만 기다리면 그 한 번을
  // 통째로 놓치고, 계정은 오류로 덮인 화면에 안내 없이 남는다. 레이스라 매번
  // 실패하지도 않아 더 나쁘다. 그래서 셸은 붙는 순간 래치도 함께 읽는다.
  test('셸이 붙기 전에 걸렸으면 마운트 시점에 데려간다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    notifyMfaEnrollmentRequired()
    renderApp('/admin/vms')

    await waitFor(() => {
      expect(currentPath()).toBe('/admin/account?enroll=2fa')
    })
  })

  // 이 신호는 등록을 마칠 때까지 계속 온다 — 알림 개수처럼 주기적으로 도는 조회가
  // 매번 같은 403을 받는다. 이미 등록 화면에 있으면 셸은 아무것도 하지 않아야
  // 하는데, **그것을 경로로는 볼 수 없다**: 계정 화면이 도착 즉시 `enroll`
  // 파라미터를 지우므로, 반복 이동을 해도 주소는 매번 `/admin/account`로 되돌아온다.
  // 그래서 여기서는 이동 횟수를 직접 센다.
  test('이미 등록 화면이면 이동을 시도하지 않는다', async () => {
    const denied = enforceMfaEnrollment()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    navigations.length = 0
    renderApp('/admin/account')

    await waitFor(() => expect(denied.hits()).toBeGreaterThan(0))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(navigations.filter((to) => to.includes('enroll=2fa'))).toEqual([])
  })
})
