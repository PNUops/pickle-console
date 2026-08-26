import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { api } from '../api/client'
import { setAccessToken } from '../api/token'
import { navigateExternal } from '../lib/google-oauth'
import { AuthContext, type AuthContextValue } from './auth-context'
import { ReauthProvider } from './ReauthProvider'
import { reauthGateHandlers, regularProfile } from '../test/msw/handlers/auth'
import { seedVmSshKey } from '../test/msw/handlers/vm-ssh-key'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'

vi.mock('../lib/google-oauth', async () => {
  const actual = await vi.importActual<typeof import('../lib/google-oauth')>('../lib/google-oauth')
  return { ...actual, navigateExternal: vi.fn() }
})

function authValue(hasPassword: boolean): AuthContextValue {
  return {
    status: 'authenticated',
    user: { ...regularProfile, hasPassword },
    login: vi.fn(),
    completeMfa: vi.fn(),
    refreshProfile: vi.fn(),
    logout: vi.fn(),
  } as unknown as AuthContextValue
}

function renderGate(hasPassword: boolean) {
  seedVmSshKey(uuid(56))
  server.use(...reauthGateHandlers('GET /vms/:vmId/ssh-key/private-key'))
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext.Provider value={authValue(hasPassword)}>
        <ReauthProvider>
          <button
            type="button"
            onClick={() =>
              void api.GET('/vms/{vmId}/ssh-key/private-key', {
                params: { path: { vmId: uuid(56) } },
              })
            }
          >
            개인키 내려받기
          </button>
        </ReauthProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  return user
}

beforeEach(() => {
  setAccessToken('access-user')
  sessionStorage.clear()
  vi.mocked(navigateExternal).mockClear()
})

describe('재인증의 구글 경로', () => {
  test('비밀번호가 없는 계정에는 비밀번호 칸이 없다', async () => {
    const user = renderGate(false)
    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '본인 확인' })

    // 채울 수 없는 칸을 보여 주면 확인 버튼이 영원히 비활성인 화면이 된다. 그
    // 계정에게는 재인증이 걸린 동작 전부가 그 화면에서 끝난다.
    expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '확인' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Google 계정으로 계속하기' }),
    ).toBeInTheDocument()
  })

  test('비밀번호가 있는 계정에는 두 길이 모두 있다', async () => {
    const user = renderGate(true)
    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '본인 확인' })

    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Google 계정으로 계속하기' }),
    ).toBeInTheDocument()
  })

  test('구글로 확인을 시작하면 돌아올 자리를 남기고 떠난다', async () => {
    const user = renderGate(false)
    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '본인 확인' })

    await user.click(screen.getByRole('button', { name: 'Google 계정으로 계속하기' }))

    // 왕복은 이 페이지를 떠난다. 대기 중이던 요청은 취소로 마감되고, 돌아올 자리는
    // 세션 저장소가 나른다 — 라우터 상태는 전체 이동을 넘지 못한다.
    expect(vi.mocked(navigateExternal)).toHaveBeenCalledWith(
      expect.stringContaining('accounts.google.com'),
    )
    expect(sessionStorage.getItem('pickle.oauth.returnTo')).not.toBeNull()
  })
})
