import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  MFA_VALID_CODE,
  mfaUser,
  orgAdminUser,
  refreshSuccessHandler,
  regularProfile,
  regularUser,
  USER_PASSWORD,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

function renderAccount() {
  server.use(refreshSuccessHandler('access-user', regularUser))
  renderApp('/console/account')
}

/**
 * 값은 한 줄로 보이고 폼은 모달 안에 있다. 자주 쓰지 않는 폼이 첫 화면을 차지하면
 * 그 아래가 안 보인다는 것이 이 구조의 이유이므로, 폼을 쓰는 케이스는 먼저 연다.
 */
async function openSection(user: ReturnType<typeof userEvent.setup>, name: string) {
  await screen.findByRole('heading', { name: '계정 설정' })
  const row = screen.getByText(name).closest('div')?.parentElement
  const button = within(row as HTMLElement).getByRole('button')
  await user.click(button)
}

function renderEnrolledAccount() {
  server.use(refreshSuccessHandler('access-mfa', mfaUser))
  renderApp('/console/account')
}

describe('계정 설정 — 비밀번호 변경', () => {
  test('현재/새 비밀번호를 확인해 변경하면 성공 토스트가 뜬다', async () => {
    const user = userEvent.setup()
    renderAccount()

    await openSection(user, '비밀번호')
    await user.type(screen.getByLabelText('현재 비밀번호'), USER_PASSWORD)
    await user.type(screen.getByLabelText('새 비밀번호'), 'brand-new-pass-9!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'brand-new-pass-9!')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByText(/비밀번호를 변경했습니다/)).toBeInTheDocument()
  })

  test('새 비밀번호 확인이 다르면 클라이언트에서 막는다', async () => {
    const user = userEvent.setup()
    renderAccount()

    await openSection(user, '비밀번호')
    await user.type(screen.getByLabelText('현재 비밀번호'), USER_PASSWORD)
    await user.type(screen.getByLabelText('새 비밀번호'), 'brand-new-pass-9!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'different-pass-9!')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByText('새 비밀번호가 일치하지 않습니다.')).toBeInTheDocument()
  })

  test('구조 규칙에 걸리는 새 비밀번호는 제출 전에 막는다', async () => {
    const user = userEvent.setup()
    renderAccount()

    await openSection(user, '비밀번호')
    await user.type(screen.getByLabelText('현재 비밀번호'), USER_PASSWORD)
    await user.type(screen.getByLabelText('새 비밀번호'), 'short')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'short')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(
      await screen.findByText('비밀번호는 8자 이상 72자 이하여야 합니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/비밀번호를 변경했습니다/)).not.toBeInTheDocument()
  })

  test('현재 비밀번호가 틀리면 서버 오류(403)를 보여준다', async () => {
    const user = userEvent.setup()
    renderAccount()

    await openSection(user, '비밀번호')
    await user.type(screen.getByLabelText('현재 비밀번호'), 'wrong-password!')
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

    await openSection(user, '계정 삭제')
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

    await openSection(user, '계정 삭제')
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

    await openSection(user, '2단계 인증')
    await user.type(await screen.findByLabelText('비밀번호 확인'), USER_PASSWORD)
    await user.click(screen.getByRole('button', { name: '다음' }))

    // 설정 키가 표시되고, 코드 입력 후 활성화하면 복구 코드가 뜬다
    expect(await screen.findByText(/설정 키:/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('인증 코드 (6자리)'), MFA_VALID_CODE)
    await user.click(screen.getByRole('button', { name: '활성화' }))

    expect(await screen.findByText(/복구 코드는 지금 한 번만 표시됩니다/)).toBeInTheDocument()
    expect(screen.getByText('aaaa-bbbb-cccc')).toBeInTheDocument()
  })

  test('배너 딥링크로 들어오면 클릭 없이 등록 마법사가 서고 표식은 지워진다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/account?enroll=2fa')

    // 관리자가 배너에서 누르고 도착한 지점. 여기서 다시 "로그인 수단"을 찾아
    // 내려가야 한다면 딥링크가 한 일이 없다.
    expect(await screen.findByRole('dialog')).toHaveTextContent('2단계 인증 등록')
    expect(screen.getByLabelText('비밀번호 확인')).toBeInTheDocument()

    // 표식이 남으면 새로고침마다 모달이 다시 선다.
    await waitFor(() => expect(currentPath()).toBe('/admin/account'))
  })

  test('비밀번호 없는 계정은 딥링크로도 마법사가 서지 않는다', async () => {
    server.use(refreshSuccessHandler('access-user'))
    server.use(
      http.get('*/api/v1/me', () =>
        HttpResponse.json({ ...regularProfile, hasPassword: false }, { status: 200 }),
      ),
    )
    renderApp('/console/account?enroll=2fa')

    // 등록은 비밀번호 확인을 거치므로(MfaService) 채울 수 없는 폼을 열어 봐야
    // 막다른 길이다. 행의 안내가 이유를 말하는 쪽이 맞다.
    // 탈퇴 행도 같은 문장을 쓰므로 2단계 인증 쪽만 집는다.
    await screen.findByText(/등록은 비밀번호 확인을 거칩니다/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(currentPath()).toBe('/console/account'))
  })

  test('등록 계정은 비밀번호+코드로 해제한다', async () => {
    const user = userEvent.setup()
    renderEnrolledAccount()

    // 등록된 상태는 행 자체가 두 동작을 들고 있다. 모달 안에 또 모달을 세우지
    // 않기 위해서다.
    expect(await screen.findByText('사용 중')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '해제' }))

    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText('비밀번호'), USER_PASSWORD)
    await user.type(dialog.getByLabelText('인증 코드 (6자리)'), MFA_VALID_CODE)
    await user.click(dialog.getByRole('button', { name: '해제하기' }))

    expect(await screen.findByText('2단계 인증을 해제했습니다.')).toBeInTheDocument()
  })
})
