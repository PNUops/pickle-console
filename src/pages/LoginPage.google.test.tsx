import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderApp } from '../test/render'

describe('로그인 화면의 구글 1차 동선', () => {
  test('구글 버튼이 인가 시작 주소를 가리킨다', async () => {
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    // 전체 페이지 이동이라 <a href>다. jsdom에서 location.assign이 no-op이므로
    // 클릭을 흉내 내는 대신 주소를 단언한다.
    const link = screen.getByRole('link', { name: 'Google 계정으로 로그인' })
    expect(link).toHaveAttribute('href', expect.stringContaining('/auth/oauth/google/start'))
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
    renderApp('/signup')
    await screen.findByRole('heading', { name: '회원가입' })
    expect(
      screen.getByRole('link', { name: 'Google 계정으로 가입하기' }),
    ).toBeInTheDocument()
  })
})
