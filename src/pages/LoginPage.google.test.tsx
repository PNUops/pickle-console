import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { OAUTH_RETURN_TO_KEY } from '../lib/google-oauth'
import { renderApp } from '../test/render'

// 인가 주소로 떠나는 것만 가로챈다. jsdom 은 location.assign 을 구현하지 않으므로
// 실제 함수를 부르면 단언할 것이 남지 않는다.
const navigateExternal = vi.hoisted(() => vi.fn())
vi.mock('../lib/google-oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/google-oauth')>()),
  navigateExternal,
}))

beforeEach(() => {
  navigateExternal.mockClear()
  sessionStorage.clear()
})

describe('로그인 화면의 구글 1차 동선', () => {
  test('버튼을 누르면 서버가 준 인가 주소로 떠난다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    // 링크가 아니라 버튼이다. 인가 주소는 서버가 state 를 저장한 뒤에야 정해진다.
    await user.click(screen.getByRole('button', { name: 'Google 계정으로 로그인' }))

    await waitFor(() =>
      expect(navigateExternal).toHaveBeenCalledWith(
        expect.stringContaining('accounts.google.com'),
      ),
    )
  })

  test('보호된 경로에서 튕겨 왔으면 돌아갈 곳을 세션에 남긴다', async () => {
    const user = userEvent.setup()
    renderApp('/console/vms')
    await screen.findByRole('heading', { name: '로그인' })

    await user.click(screen.getByRole('button', { name: 'Google 계정으로 로그인' }))

    // location.state 는 전체 페이지 이동을 넘지 못하므로 sessionStorage 여야 한다.
    await waitFor(() =>
      expect(sessionStorage.getItem(OAUTH_RETURN_TO_KEY)).toBe('/console/vms'),
    )
  })

  test('시작이 실패하면 이동하지 않고 이유를 보여 준다', async () => {
    const { server } = await import('../test/msw/server')
    const { http, HttpResponse } = await import('msw')
    server.use(
      http.post('*/api/v1/auth/oauth/google/start', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Service Unavailable',
            status: 503,
            code: 'AUTH_OAUTH_NOT_CONFIGURED',
            detail: '구글 로그인이 설정되지 않았습니다.',
          },
          { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const user = userEvent.setup()
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    await user.click(screen.getByRole('button', { name: 'Google 계정으로 로그인' }))

    expect(await screen.findByText(/구글 로그인이 설정되지 않았습니다/)).toBeInTheDocument()
    expect(navigateExternal).not.toHaveBeenCalled()
  })

  test('비밀번호 폼은 접힌 채로 시작하고 토글로 열린다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    const toggle = screen.getByRole('button', { name: /이메일로 로그인/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // 폼은 DOM 에 남아 있어야 비밀번호 관리자가 붙고, hidden 이라 보이지는 않는다.
    // getByLabelText 는 hidden 을 보지 않으므로 존재가 아니라 가시성을 단언한다.
    expect(screen.getByLabelText('이메일')).not.toBeVisible()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('이메일')).toBeVisible()
  })

  test('?method=password 로 들어오면 펼친 채로 연다', async () => {
    renderApp('/login?method=password')
    await screen.findByRole('heading', { name: '로그인' })
    expect(screen.getByLabelText('이메일')).toBeVisible()
  })

  test('가입 화면도 구글이 1차다', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })

    await user.click(screen.getByRole('button', { name: 'Google 계정으로 가입하기' }))
    await waitFor(() => expect(navigateExternal).toHaveBeenCalled())
  })
})
