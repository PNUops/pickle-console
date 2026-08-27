import { screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { problemResponse, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { makeNotice, noticeImage, seedNotices } from '../test/msw/handlers/notices'
import { resetMfaEnrollmentRequired } from '../api/mfa-enrollment'
import { uuid } from '../test/msw/ids'
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
 * 공지 첨부 이미지는 계약 클라이언트를 거치지 않지만 `fetchWithAuth`는 거친다
 * (`<img src>`가 인증 헤더를 못 싣기 때문이다). 그래서 2FA 등록 가로채기가 걸린
 * 바로 그 계층을 함께 탄다.
 *
 * <p>그 가로채기가 상태 코드 403이 아니라 `MFA_ENROLLMENT_REQUIRED`라는 **코드**로
 * 걸러야 하는 이유가 여기 있다: 공지 이미지의 403은 남의 기관 것을 감추는 우리
 * 마스킹이고, 그것을 등록 요구로 읽으면 이미지 한 장 때문에 화면이 통째로 튄다.
 *
 * <p>판정을 인증 셸에서 한다 — 팝업 공지가 `AppShell` 안에서 이미지를 그리므로
 * 리다이렉트를 실제로 수행하는 구독자가 붙어 있는 유일한 자리다. 공개 게시판에서
 * 재면 구독자가 없어 가로채기가 망가져도 통과하는, 물지 않는 테스트가 된다.
 */
describe('공지 이미지와 2FA 등록 가로채기', () => {
  beforeEach(() => {
    navigations.length = 0
    resetMfaEnrollmentRequired()
  })

  test('이미지가 403을 받아도 등록 화면으로 튀지 않는다', async () => {
    const noticeId = uuid(401)
    seedNotices([
      makeNotice({
        id: noticeId,
        title: '이미지 붙은 팝업',
        popup: true,
        images: [noticeImage(noticeId, 402, 'masked.png')],
      }),
    ])
    server.use(refreshSuccessHandler('access-user'))
    // 우리 마스킹이 내는 403 — 등록 요구가 아니라 '이 이미지는 당신 것이 아니다'.
    server.use(
      http.get('*/api/v1/notices/:noticeId/images/:imageId', () =>
        problemResponse({
          type: 'about:blank',
          title: '접근 권한이 없습니다',
          status: 403,
          detail: '이 공지의 이미지를 볼 수 없습니다.',
          code: 'ACCESS_DENIED',
        }),
      ),
    )
    renderApp('/console')

    // 이미지가 죽어도 팝업은 남는다 — 그 자리에 머물러 있어야 판정이 성립한다.
    expect(await screen.findByRole('dialog', { name: '이미지 붙은 팝업' })).toBeInTheDocument()
    await waitFor(() => {
      expect(navigations.filter((to) => to.includes('enroll=2fa'))).toEqual([])
    })
  })
})
