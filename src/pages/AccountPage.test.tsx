import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  MFA_VALID_CODE,
  mfaUser,
  refreshSuccessHandler,
  regularUser,
  USER_PASSWORD,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderAccount() {
  server.use(refreshSuccessHandler('access-user', regularUser))
  renderApp('/console/account')
}

function renderEnrolledAccount() {
  server.use(refreshSuccessHandler('access-mfa', mfaUser))
  renderApp('/console/account')
}

describe('계정 설정 — 비밀번호 변경', () => {
  test('현재/새 비밀번호를 확인해 변경하면 성공 토스트가 뜬다', async () => {
    const user = userEvent.setup()
    renderAccount()

    await screen.findByRole('heading', { name: '계정 설정' })
    await user.type(screen.getByLabelText('현재 비밀번호'), USER_PASSWORD)
    await user.type(screen.getByLabelText('새 비밀번호'), 'brand-new-pass-9!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'brand-new-pass-9!')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByText(/비밀번호를 변경했습니다/)).toBeInTheDocument()
  })

  test('새 비밀번호 확인이 다르면 클라이언트에서 막는다', async () => {
    const user = userEvent.setup()
    renderAccount()

    await user.type(await screen.findByLabelText('현재 비밀번호'), USER_PASSWORD)
    await user.type(screen.getByLabelText('새 비밀번호'), 'brand-new-pass-9!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'different-pass-9!')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByText('새 비밀번호가 일치하지 않습니다.')).toBeInTheDocument()
  })

  test('현재 비밀번호가 틀리면 서버 오류(403)를 보여준다', async () => {
    const user = userEvent.setup()
    renderAccount()

    await user.type(await screen.findByLabelText('현재 비밀번호'), 'wrong-password!')
    await user.type(screen.getByLabelText('새 비밀번호'), 'brand-new-pass-9!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'brand-new-pass-9!')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByText('비밀번호를 다시 확인해 주세요.')).toBeInTheDocument()
  })
})

describe('계정 설정 — 회원 탈퇴', () => {
  test('이메일 정확 입력 + 비밀번호로 탈퇴하면 랜딩으로 이동한다', async () => {
    const user = userEvent.setup()
    renderAccount()

    await user.click(await screen.findByRole('button', { name: '회원 탈퇴' }))
    const dialog = within(screen.getByRole('dialog'))
    const confirmBtn = dialog.getByRole('button', { name: '탈퇴하기' })
    expect(confirmBtn).toBeDisabled()

    await user.type(dialog.getByLabelText(/계속하려면 이메일/), regularUser.email)
    await user.type(dialog.getByLabelText('비밀번호 확인'), USER_PASSWORD)
    expect(confirmBtn).toBeEnabled()
    await user.click(confirmBtn)

    expect(await screen.findByText(/탈퇴가 완료되었습니다/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: '계정 설정' })).not.toBeInTheDocument(),
    )
  })

  test('비밀번호가 틀리면 모달 안에 오류를 보여준다', async () => {
    const user = userEvent.setup()
    renderAccount()

    await user.click(await screen.findByRole('button', { name: '회원 탈퇴' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText(/계속하려면 이메일/), regularUser.email)
    await user.type(dialog.getByLabelText('비밀번호 확인'), 'wrong-password!')
    await user.click(dialog.getByRole('button', { name: '탈퇴하기' }))

    expect(await screen.findByText('비밀번호를 다시 확인해 주세요.')).toBeInTheDocument()
  })
})

describe('계정 설정 — 2단계 인증', () => {
  test('미등록 계정은 비밀번호→코드로 등록하고 복구 코드를 본다', async () => {
    const user = userEvent.setup()
    renderAccount()

    await user.click(await screen.findByRole('button', { name: '2단계 인증 등록' }))
    await user.type(await screen.findByLabelText('비밀번호 확인'), USER_PASSWORD)
    await user.click(screen.getByRole('button', { name: '다음' }))

    // 설정 키가 표시되고, 코드 입력 후 활성화하면 복구 코드가 뜬다
    expect(await screen.findByText(/설정 키:/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('인증 코드 (6자리)'), MFA_VALID_CODE)
    await user.click(screen.getByRole('button', { name: '활성화' }))

    expect(await screen.findByText(/복구 코드는 지금 한 번만 표시됩니다/)).toBeInTheDocument()
    expect(screen.getByText('aaaa-bbbb-cccc')).toBeInTheDocument()
  })

  test('등록 계정은 비밀번호+코드로 해제한다', async () => {
    const user = userEvent.setup()
    renderEnrolledAccount()

    expect(await screen.findByText('2단계 인증이 설정되어 있습니다.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '2단계 인증 해제' }))

    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText('비밀번호'), USER_PASSWORD)
    await user.type(dialog.getByLabelText('인증 코드 (6자리)'), MFA_VALID_CODE)
    await user.click(dialog.getByRole('button', { name: '해제하기' }))

    expect(await screen.findByText('2단계 인증을 해제했습니다.')).toBeInTheDocument()
  })
})
