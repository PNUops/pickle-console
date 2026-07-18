import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, studentUser, USER_PASSWORD } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderAccount() {
  server.use(refreshSuccessHandler('access-student', studentUser))
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

    await user.type(dialog.getByLabelText(/계속하려면 이메일/), studentUser.email)
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
    await user.type(dialog.getByLabelText(/계속하려면 이메일/), studentUser.email)
    await user.type(dialog.getByLabelText('비밀번호 확인'), 'wrong-password!')
    await user.click(dialog.getByRole('button', { name: '탈퇴하기' }))

    expect(await screen.findByText('비밀번호를 다시 확인해 주세요.')).toBeInTheDocument()
  })
})
