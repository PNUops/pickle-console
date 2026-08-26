import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, regularProfile } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

const GOOGLE = { provider: 'GOOGLE' as const, email: 'hong@pusan.ac.kr', linkedAt: '2026-08-25T00:00:00Z' }

function meReturns(overrides: Partial<typeof regularProfile>) {
  server.use(refreshSuccessHandler('access-user'))
  server.use(
    http.get('*/api/v1/me', () =>
      HttpResponse.json({ ...regularProfile, ...overrides }, { status: 200 }),
    ),
  )
}

/** 값은 한 줄로 보이고 목록은 모달 안에 있다. 항목 이름으로 그 행의 버튼을 누른다. */
async function openSection(user: ReturnType<typeof userEvent.setup>, name: string) {
  await screen.findByRole('heading', { name: '계정 설정' })
  const row = screen.getByText(name).closest('div')?.parentElement
  await user.click(within(row as HTMLElement).getByRole('button'))
}

describe('계정 화면의 연동 관리', () => {
  test('연동이 없으면 그렇게 말한다', async () => {
    const user = userEvent.setup()
    meReturns({ identities: [] })
    renderApp('/console/account')
    await openSection(user, '연동된 계정')
    expect(await screen.findByText(/연동된 외부 계정이 없습니다/)).toBeInTheDocument()
    // 붙일 방법이 함께 있어야 한다. 없으면 이 카드는 상태만 알리고 끝난다.
    expect(
      screen.getByRole('button', { name: 'Google 계정으로 계속하기' }),
    ).toBeInTheDocument()
  })

  test('연동된 구글 계정을 해제할 수 있다', async () => {
    const user = userEvent.setup()
    meReturns({ identities: [GOOGLE], hasPassword: true })
    renderApp('/console/account')
    await openSection(user, '연동된 계정')
    await screen.findByText('hong@pusan.ac.kr')
    expect(screen.getByRole('button', { name: '해제' })).toBeEnabled()
  })

  test('유일한 로그인 수단이면 해제 버튼이 사유와 함께 잠긴다', async () => {
    // 비밀번호가 없고 연동이 하나. 이걸 떼면 복구 경로가 없다.
    const user = userEvent.setup()
    meReturns({ identities: [GOOGLE], hasPassword: false })
    renderApp('/console/account')
    await openSection(user, '연동된 계정')
    await screen.findByText('hong@pusan.ac.kr')

    // 숨기지 않고 비활성으로 둔다. 숨기면 왜 못 하는지 알 길이 없다.
    expect(screen.getByRole('button', { name: '해제' })).toBeDisabled()
    expect(
      screen.getByText(/유일한 로그인 수단이라 해제할 수 없습니다/),
    ).toBeInTheDocument()
  })

  test('비밀번호가 없으면 변경이 아니라 설정 화면이 뜬다', async () => {
    meReturns({ hasPassword: false, identities: [GOOGLE] })
    renderApp('/console/account')

    // 현재 비밀번호를 묻는 폼은 이 계정이 채울 수 없는 칸이다. 그 행은 값 대신
    // 「설정되지 않음」을 말하고 메일 경로만 준다.
    expect(await screen.findByText('설정되지 않음')).toBeInTheDocument()
    expect(screen.queryByLabelText('현재 비밀번호')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정 메일 받기' })).toBeInTheDocument()
  })

  test('비밀번호가 있으면 변경 폼이 뜬다', async () => {
    const user = userEvent.setup()
    meReturns({ hasPassword: true, identities: [] })
    renderApp('/console/account')
    await openSection(user, '비밀번호')
    expect(await screen.findByLabelText('현재 비밀번호')).toBeInTheDocument()
  })
})
