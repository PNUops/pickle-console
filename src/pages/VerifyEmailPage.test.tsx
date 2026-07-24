import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { renderApp } from '../test/render'

describe('이메일 인증', () => {
  test('유효한 토큰이면 자동 제출되어 성공 화면을 보여준다', async () => {
    renderApp('/verify-email?token=valid-token')

    expect(await screen.findByText('인증이 완료되었습니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '로그인하러 가기' })).toBeInTheDocument()
  })

  test('만료된 토큰(410)이면 재발송 경로를 제공한다', async () => {
    renderApp('/verify-email?token=expired-token')

    expect(await screen.findByText('인증 링크가 만료되었습니다')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('가입한 이메일'), 'example@pusan.ac.kr')
    await user.click(screen.getByRole('button', { name: '인증 메일 다시 받기' }))

    expect(
      await screen.findByText('해당 주소가 등록되어 있다면 인증 메일을 다시 발송했습니다.'),
    ).toBeInTheDocument()
  })

  test('잘못된 토큰이면 유효하지 않은 링크 안내를 보여준다', async () => {
    renderApp('/verify-email?token=garbage')

    expect(await screen.findByText('유효하지 않은 인증 링크입니다')).toBeInTheDocument()
  })

  test('토큰이 없으면 유효하지 않은 링크 안내를 보여준다', async () => {
    renderApp('/verify-email')

    expect(await screen.findByText('유효하지 않은 인증 링크입니다')).toBeInTheDocument()
  })
})
