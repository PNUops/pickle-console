import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { renderApp } from '../test/render'

describe('비밀번호 재설정 흐름 (공개 페이지)', () => {
  test('요청 페이지: 이메일 제출 시 균일한 성공 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderApp('/forgot-password')

    await user.type(await screen.findByLabelText('이메일'), 'example@pusan.ac.kr')
    await user.click(screen.getByRole('button', { name: '재설정 메일 받기' }))

    expect(await screen.findByText(/재설정 메일을 발송했습니다/)).toBeInTheDocument()
  })

  test('확정 페이지: 유효 토큰으로 새 비밀번호를 설정하면 로그인으로 이동한다', async () => {
    const user = userEvent.setup()
    renderApp('/reset-password?token=valid-reset-token')

    await user.type(await screen.findByLabelText('새 비밀번호'), 'brand-new-pass-9!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'brand-new-pass-9!')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument()
  })

  test('확정 페이지: 만료된 토큰(410)은 재요청 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderApp('/reset-password?token=expired-reset-token')

    await user.type(await screen.findByLabelText('새 비밀번호'), 'brand-new-pass-9!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'brand-new-pass-9!')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByText('재설정 링크가 만료되었습니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '재설정을 다시 요청하기' })).toBeInTheDocument()
  })

  test('확정 페이지: 이메일을 모르는 규칙은 성공이 아니라 미확인으로 보여준다', async () => {
    const user = userEvent.setup()
    renderApp('/reset-password?token=valid-reset-token')

    // 이 화면에는 계정 이메일이 없으므로 "이메일 주소 포함" 규칙을 판정할 수 없다 —
    // 통과(성공)로 표시하면 거짓 안내가 된다.
    await user.type(await screen.findByLabelText('새 비밀번호'), 'brand-new-pass-9!')
    const emailRule = screen.getByText(/이메일 주소를 포함하지 않기/).closest('li')!
    expect(emailRule).toHaveTextContent('서버에서 확인')
    expect(emailRule).not.toHaveTextContent('성공')
    // 판정 가능한 규칙은 그대로 성공/미충족을 보여준다.
    expect(screen.getByText('8자 이상 72자 이하').closest('li')).toHaveTextContent('성공')
  })

  test('확정 페이지: 구조 규칙 위반은 제출 전에 막는다', async () => {
    const user = userEvent.setup()
    renderApp('/reset-password?token=valid-reset-token')

    await user.type(await screen.findByLabelText('새 비밀번호'), 'short')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'short')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(
      await screen.findByText('비밀번호는 8자 이상 72자 이하여야 합니다.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '새 비밀번호 설정' })).toBeInTheDocument()
  })

  test('토큰 없이 진입하면 잘못된 링크 안내를 보여준다', async () => {
    renderApp('/reset-password')
    expect(await screen.findByText('잘못된 링크입니다')).toBeInTheDocument()
  })
})
