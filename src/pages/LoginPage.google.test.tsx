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

  test('이메일을 넣으면 비밀번호 칸이 나타난다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    // 이메일 칸은 처음부터 보인다. 비밀번호 칸은 DOM 에 있지만 hidden 이다.
    // DOM 에 없는 칸에는 비밀번호 관리자가 붙지 않으므로 존재가 아니라 가시성을
    // 단언한다.
    expect(screen.getByLabelText('이메일')).toBeVisible()
    expect(screen.getByLabelText('비밀번호')).not.toBeVisible()

    await user.type(screen.getByLabelText('이메일'), 'someone@pusan.ac.kr')
    await user.click(screen.getByRole('button', { name: '이메일로 계속하기' }))

    expect(screen.getByLabelText('비밀번호')).toBeVisible()
    // 주소는 계속 보이고 고칠 수 있다.
    expect(screen.getByLabelText('이메일')).toBeVisible()
  })

  test('빈 이메일로는 다음 단계로 가지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    await user.click(screen.getByRole('button', { name: '이메일로 계속하기' }))
    expect(screen.getByLabelText('비밀번호')).not.toBeVisible()
  })

  test('2단계에 재설정과 회원가입 경로가 주소를 달고 나온다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    await user.type(screen.getByLabelText('이메일'), 'someone@pusan.ac.kr')
    await user.click(screen.getByRole('button', { name: '이메일로 계속하기' }))

    expect(screen.getByRole('link', { name: '비밀번호를 잊으셨나요?' })).toHaveAttribute(
      'href',
      '/forgot-password?email=someone%40pusan.ac.kr',
    )
    expect(screen.getByRole('link', { name: '이 이메일로 회원가입' })).toHaveAttribute(
      'href',
      '/signup?email=someone%40pusan.ac.kr',
    )
    // 주소를 보고 판단하지 않는다는 것이 이 문구가 정적인 이유다.
    expect(screen.getByText(/구글 계정으로 가입했다면 비밀번호가 없습니다/)).toBeInTheDocument()
  })

  test('가입 화면도 구글이 1차다', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })

    await user.click(screen.getByRole('button', { name: 'Google 계정으로 가입하기' }))
    await waitFor(() => expect(navigateExternal).toHaveBeenCalled())
  })
})
