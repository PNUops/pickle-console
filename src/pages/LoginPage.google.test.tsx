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

  /**
   * 펼침은 `display:none` 이 아니라 격자 높이라 가시성으로는 잡히지 않는다.
   * 실제로 접근을 막는 것은 `inert` 이고 — 접근성 트리와 탭 순서에서 빠진다 —
   * 칸이 DOM 에 남아 비밀번호 관리자가 붙는다는 성질도 그 속성이 지킨다.
   */
  const passwordBlock = () => document.getElementById('login-password-block')!

  test('주소를 알아볼 만해지면 비밀번호 칸이 자라난다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    expect(screen.getByLabelText('이메일')).toBeVisible()
    // 칸은 처음부터 DOM 에 있다. 없으면 자동완성이 붙지 않는다.
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument()
    expect(passwordBlock()).toHaveAttribute('inert')

    await user.type(screen.getByLabelText('이메일'), 'someone@pusan.ac.kr')

    // 누를 것이 없다. 주소가 조건을 만족하는 순간 펼쳐진다.
    expect(passwordBlock()).not.toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
    // 주소는 계속 보이고 고칠 수 있다.
    expect(screen.getByLabelText('이메일')).toBeVisible()
  })

  test('한 번 펼쳐지면 도메인을 고치는 동안 접히지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    await user.type(screen.getByLabelText('이메일'), 'someone@pusan.ac.kr')
    expect(passwordBlock()).not.toHaveAttribute('inert')

    // 도메인 끝을 지우면 조건은 깨지지만 접히지 않는다. 고치는 사이에 칸이
    // 사라졌다 나타나면 화면이 흔들린다.
    await user.type(screen.getByLabelText('이메일'), '{Backspace}{Backspace}')
    expect(passwordBlock()).not.toHaveAttribute('inert')

    // 통째로 지우면 처음으로 돌아간다.
    await user.clear(screen.getByLabelText('이메일'))
    expect(passwordBlock()).toHaveAttribute('inert')
  })

  test('펼쳐지면 재설정과 회원가입 경로가 주소를 달고 나온다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    await user.type(screen.getByLabelText('이메일'), 'someone@pusan.ac.kr')

    expect(screen.getByRole('link', { name: '비밀번호를 잊으셨나요?' })).toHaveAttribute(
      'href',
      '/forgot-password?email=someone%40pusan.ac.kr',
    )
    expect(screen.getByRole('link', { name: '이 이메일로 회원가입' })).toHaveAttribute(
      'href',
      '/signup?email=someone%40pusan.ac.kr',
    )

    // 카드 아래의 안내는 사라진다. 주소를 달고 가는 카드 안 링크와 같은 말을 두 줄
    // 겹치는 데다, 그쪽은 방금 친 주소를 버린다. (헤더의 CTA 는 성격이 달라 남는다.)
    expect(screen.queryByText(/아직 계정이 없으신가요/)).not.toBeInTheDocument()
  })

  test('가입 화면도 구글이 1차다', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })

    await user.click(screen.getByRole('button', { name: 'Google 계정으로 가입하기' }))
    await waitFor(() => expect(navigateExternal).toHaveBeenCalled())
  })
})
