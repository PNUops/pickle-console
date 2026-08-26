import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  MFA_VALID_CODE,
  MFA_VALID_RECOVERY_CODE,
  USER_PASSWORD,
  mfaUser,
  orgAdminUser,
  regularUser,
} from '../test/msw/handlers/auth'
import { renderApp } from '../test/render'

/**
 * 비밀번호 폼은 접힌 채로 시작한다. 구글이 1차 동선이 되면서 이메일 경로가 토글 뒤로
 * 갔으므로, 폼을 쓰는 케이스는 먼저 펼쳐야 한다.
 */
async function openPasswordForm(user: ReturnType<typeof userEvent.setup>) {
  const toggle = screen.queryByRole('button', { name: /이메일로 로그인/ })
  if (toggle) await user.click(toggle)
}

async function submitLogin(email: string, password: string) {
  const user = userEvent.setup()
  await openPasswordForm(user)
  await user.type(screen.getByLabelText('이메일'), email)
  await user.type(screen.getByLabelText('비밀번호'), password)
  await user.click(screen.getByRole('button', { name: '로그인' }))
  return user
}

describe('로그인', () => {
  test('사용자는 로그인 후 /console 대시보드로 이동한다', async () => {
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    await submitLogin(regularUser.email, USER_PASSWORD)

    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
    expect(screen.getByText(/홍길동님, 환영합니다/)).toBeInTheDocument()
  })

  test('기관 관리자는 로그인 후 /admin 대시보드로 이동한다', async () => {
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    await submitLogin(orgAdminUser.email, USER_PASSWORD)

    expect(
      await screen.findByRole('heading', { name: '관리자 대시보드' }),
    ).toBeInTheDocument()
  })

  test('잘못된 자격 증명이면 서버의 한국어 메시지를 보여준다', async () => {
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    await submitLogin(regularUser.email, 'wrong-password-99')

    expect(
      await screen.findByText('이메일 또는 비밀번호가 올바르지 않습니다.'),
    ).toBeInTheDocument()
  })

  test('미인증 계정이면 안내와 함께 재발송 버튼을 보여준다', async () => {
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    await submitLogin('unverified@pusan.ac.kr', USER_PASSWORD)

    expect(
      await screen.findByText('가입 시 발송된 인증 메일을 확인한 뒤 다시 로그인해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '인증 메일 다시 받기' })).toBeInTheDocument()
  })

  test('요청 초과(429)면 서버 메시지를 보여준다', async () => {
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })

    await submitLogin('ratelimited@pusan.ac.kr', USER_PASSWORD)

    expect(await screen.findByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
  })

  test('2FA 계정은 코드 입력 단계를 거쳐 로그인한다', async () => {
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })
    const user = await submitLogin(mfaUser.email, USER_PASSWORD)

    // 코드 입력 단계로 전환
    await screen.findByRole('heading', { name: '2단계 인증' })

    // 잘못된 코드 → 오류, 단계 유지
    await user.type(screen.getByLabelText('인증 코드'), '000000')
    await user.click(screen.getByRole('button', { name: '로그인' }))
    expect(
      await screen.findByText('입력한 코드가 올바르지 않습니다. 인증 앱의 최신 코드를 확인해 주세요.'),
    ).toBeInTheDocument()

    // 올바른 코드 → 대시보드
    const codeField = screen.getByLabelText('인증 코드')
    await user.clear(codeField)
    await user.type(codeField, MFA_VALID_CODE)
    await user.click(screen.getByRole('button', { name: '로그인' }))
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  test('2FA 복구 코드로도 로그인할 수 있다', async () => {
    renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })
    const user = await submitLogin(mfaUser.email, USER_PASSWORD)
    await screen.findByRole('heading', { name: '2단계 인증' })

    await user.click(screen.getByRole('button', { name: '복구 코드로 입력' }))
    await user.type(screen.getByLabelText('복구 코드'), MFA_VALID_RECOVERY_CODE)
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })
})
