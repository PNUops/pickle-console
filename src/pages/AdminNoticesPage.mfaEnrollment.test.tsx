import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { orgAdminUser, problemResponse, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { resetMfaEnrollmentRequired } from '../api/mfa-enrollment'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

/** 이동을 **시도**했는지를 본다 — 도착지만 보면 가드를 지워도 통과할 수 있다. */
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
 * 2FA 등록 가로채기가 상태(403)가 아니라 코드(`MFA_ENROLLMENT_REQUIRED`)로 걸어야
 * 하는 이유를, 실제로 깨질 자리에서 고정한다.
 *
 * <p>공지 쓰기는 403 `ACCESS_DENIED`를 낸다 — 전역 공지를 기관 관리자가 건드릴 때와
 * 관리 기관이 없는 계정일 때다(404 마스킹은 경로 id로 지목한 남의 기관 공지에만
 * 해당한다). 이 요청들은 계약 클라이언트를 타므로 가로채기의 403 분기에 그대로
 * 들어오고, 걸러 주는 것은 코드 등식 하나뿐이다.
 *
 * <p>느슨해지면 관리자는 **권한 거부 사유 대신 2단계 인증 등록 화면**을 보게 된다.
 * 첨부 이미지 쪽에도 같은 취지의 테스트가 있지만 저기는 이미지 경로만 덮는다 —
 * 실제로 깨지는 것은 이 화면이고, 여기도 `AppShell` 안이라 구독자가 붙어 있다.
 */
describe('공지 관리와 2FA 등록 가로채기', () => {
  beforeEach(() => {
    navigations.length = 0
    resetMfaEnrollmentRequired()
  })

  test('403 권한 거부는 사유로 뜨고 등록 화면으로 튀지 않는다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    server.use(
      http.post('*/api/v1/admin/notices', () =>
        problemResponse({
          type: 'about:blank',
          title: '접근 권한이 없습니다',
          status: 403,
          detail: '이 작업을 수행할 권한이 없습니다.',
          code: 'ACCESS_DENIED',
        }),
      ),
    )
    renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '공지 등록' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 등록' })
    await user.type(within(drawer).getByLabelText('제목'), '거절될 공지')
    await user.type(within(drawer).getByLabelText('본문'), '권한이 없어 거절된다.')
    await user.click(within(drawer).getByRole('button', { name: '등록' }))

    // 거부는 화면에 남아야 한다 — 튀어 버리면 관리자는 이유를 못 본다.
    expect(
      await screen.findByText('이 작업을 수행할 권한이 없습니다.'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(navigations.filter((to) => to.includes('enroll=2fa'))).toEqual([])
    })
  })
})
