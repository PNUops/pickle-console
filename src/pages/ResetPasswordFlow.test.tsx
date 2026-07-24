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

  test('토큰 없이 진입하면 잘못된 링크 안내를 보여준다', async () => {
    renderApp('/reset-password')
    expect(await screen.findByText('잘못된 링크입니다')).toBeInTheDocument()
  })
})
