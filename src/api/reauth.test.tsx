import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test } from 'vitest'
import { api } from './client'
import { getReauthToken } from './reauth'
import { notifySessionExpired, setAccessToken } from './token'
import { ReauthProvider } from '../auth/ReauthProvider'
import {
  RATE_LIMITED_PASSWORD,
  REAUTH_TOKEN,
  USER_PASSWORD,
  problemResponse,
  reauthGateHandlers,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { seedVmSshKey } from '../test/msw/handlers/vm-ssh-key'

/** 재인증 게이트를 켠 민감 작업 하나(개인키 조회)를 버튼으로 노출하는 하네스. */
function Harness() {
  const [results, setResults] = useState<string[]>([])
  const call = async () => {
    const { data, error } = await api.GET('/vms/{vmId}/ssh-key/private-key', {
      params: { path: { vmId: uuid(56) } },
    })
    setResults((prev) => [...prev, data ? `ok:${data.fileName}` : `err:${error?.code ?? 'unknown'}`])
  }
  return (
    <ReauthProvider>
      <button type="button" onClick={() => void call()}>
        개인키 내려받기
      </button>
      <ul aria-label="호출 결과">
        {results.map((result, index) => (
          <li key={index}>{result}</li>
        ))}
      </ul>
    </ReauthProvider>
  )
}

function renderHarness() {
  // The gate handler falls through once the header is present, so the key has to
  // actually exist for the retried call to succeed.
  seedVmSshKey(uuid(56))
  server.use(...reauthGateHandlers('GET /vms/:vmId/ssh-key/private-key'))
  const user = userEvent.setup()
  render(<Harness />)
  return user
}

const passwordField = () => screen.getByLabelText('비밀번호')

beforeEach(() => {
  setAccessToken('access-user')
})

describe('재인증(sudo-mode) 흐름', () => {
  test('403 REAUTH_REQUIRED면 모달이 뜨고, 비밀번호 확인 후 원래 요청이 재시도된다', async () => {
    const user = renderHarness()

    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))

    expect(await screen.findByRole('dialog', { name: '비밀번호 확인' })).toBeInTheDocument()
    expect(
      screen.getByText(/민감한 작업입니다\. 계속하려면 비밀번호를 입력해 주세요\./),
    ).toBeInTheDocument()

    await user.type(passwordField(), USER_PASSWORD)
    await user.click(screen.getByRole('button', { name: '확인' }))

    // 토큰이 발급되고(메모리), 원래 호출이 헤더를 달고 재시도되어 성공한다.
    // 게이트 핸들러는 헤더가 없으면 403이므로 성공 자체가 헤더 부착의 증거다.
    expect(await screen.findByText('ok:pickle-algo-judge.pem')).toBeInTheDocument()
    expect(getReauthToken()).toBe(REAUTH_TOKEN)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('비밀번호가 틀리면 모달에 오류가 남고, 다시 입력하면 성공한다', async () => {
    const user = renderHarness()

    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })

    await user.type(passwordField(), 'wrong-password')
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('비밀번호가 일치하지 않습니다.')
    expect(screen.getByRole('dialog', { name: '비밀번호 확인' })).toBeInTheDocument()
    expect(getReauthToken()).toBeNull()

    await user.type(passwordField(), USER_PASSWORD)
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(await screen.findByText('ok:pickle-algo-judge.pem')).toBeInTheDocument()
  })

  test('요청 과다(429)면 서버 메시지를 보여주고 모달을 열어 둔다', async () => {
    const user = renderHarness()

    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })

    await user.type(passwordField(), RATE_LIMITED_PASSWORD)
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '비밀번호 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    )
    expect(screen.getByRole('dialog', { name: '비밀번호 확인' })).toBeInTheDocument()
  })

  test('취소하면 호출부가 원래 403을 받고(멈추지 않고) 토큰도 남지 않는다', async () => {
    const user = renderHarness()

    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })

    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(await screen.findByText('err:REAUTH_REQUIRED')).toBeInTheDocument()
    expect(getReauthToken()).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('전송 중에 닫으면 뒤늦게 도착한 grant를 저장하지 않는다', async () => {
    let release: () => void = () => {}
    const inFlight = new Promise<void>((resolve) => {
      release = resolve
    })
    const user = renderHarness()
    // 응답을 붙잡아 두고 그 사이에 모달을 닫는다 (취소·Esc·배경 클릭과 같은 경로).
    server.use(
      http.post('*/api/v1/auth/reverify', async () => {
        await inFlight
        return HttpResponse.json(
          { reauthToken: REAUTH_TOKEN, expiresAt: new Date(Date.now() + 600_000).toISOString() },
          { status: 200 },
        )
      }),
    )

    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })
    await user.type(passwordField(), USER_PASSWORD)
    await user.click(screen.getByRole('button', { name: '확인' }))
    await user.click(screen.getByRole('button', { name: '닫기' }))

    expect(await screen.findByText('err:REAUTH_REQUIRED')).toBeInTheDocument()
    release()

    // 응답이 도착해도 grant는 적립되지 않는다 — 다음 민감 작업은 다시 모달을 띄운다.
    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    expect(await screen.findByRole('dialog', { name: '비밀번호 확인' })).toBeInTheDocument()
    expect(getReauthToken()).toBeNull()
  })

  test('전송 중 취소하고 새 프롬프트를 열면 뒤늦은 grant가 새 모달을 건드리지 않는다', async () => {
    let release: () => void = () => {}
    const inFlight = new Promise<void>((resolve) => {
      release = resolve
    })
    const user = renderHarness()
    server.use(
      http.post('*/api/v1/auth/reverify', async () => {
        await inFlight
        return HttpResponse.json(
          { reauthToken: REAUTH_TOKEN, expiresAt: new Date(Date.now() + 600_000).toISOString() },
          { status: 200 },
        )
      }),
    )

    // 첫 확인 요청: 응답을 붙잡아 둔 채 취소한다.
    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })
    await user.type(passwordField(), USER_PASSWORD)
    await user.click(screen.getByRole('button', { name: '확인' }))
    // 전송 중에는 취소 버튼이 잠기므로 닫기(X)로 마감한다 — Esc·배경 클릭과 같은 경로.
    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(await screen.findByText('err:REAUTH_REQUIRED')).toBeInTheDocument()

    // 이전 응답이 도착하기 전에 새 확인 요청이 시작된다.
    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })
    release()

    // 뒤늦은 grant는 적립되지도, 새 모달을 닫지도 않는다 (입력도 그대로 유지).
    await user.type(passwordField(), USER_PASSWORD)
    expect(screen.getByRole('dialog', { name: '비밀번호 확인' })).toBeInTheDocument()
    expect(passwordField()).toHaveValue(USER_PASSWORD)
    expect(getReauthToken()).toBeNull()

    // 새 모달로 확인하면 그때 발급된 grant로 원래 요청이 재시도된다.
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('ok:pickle-algo-judge.pem')).toBeInTheDocument()
    expect(getReauthToken()).toBe(REAUTH_TOKEN)
  })

  test('전송 중 취소한 요청의 뒤늦은 실패는 새 모달에 오류로 새지 않는다', async () => {
    let release: () => void = () => {}
    const inFlight = new Promise<void>((resolve) => {
      release = resolve
    })
    const user = renderHarness()
    server.use(
      http.post('*/api/v1/auth/reverify', async () => {
        await inFlight
        return problemResponse({
          type: 'about:blank',
          title: '본인 확인에 실패했습니다',
          status: 403,
          detail: '비밀번호가 일치하지 않습니다.',
          instance: '/api/v1/auth/reverify',
          code: 'AUTH_PASSWORD_MISMATCH',
        })
      }),
    )

    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })
    await user.type(passwordField(), 'wrong-password')
    await user.click(screen.getByRole('button', { name: '확인' }))
    // 전송 중에는 취소 버튼이 잠기므로 닫기(X)로 마감한다 — Esc·배경 클릭과 같은 경로.
    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(await screen.findByText('err:REAUTH_REQUIRED')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })
    release()

    // 새 모달은 오류 없이 처음 상태 그대로다.
    await user.type(passwordField(), USER_PASSWORD)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '비밀번호 확인' })).toBeInTheDocument()
  })

  test('보유한 grant는 /auth/* 요청에는 붙지 않는다', async () => {
    const user = renderHarness()

    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })
    await user.type(passwordField(), USER_PASSWORD)
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('ok:pickle-algo-judge.pem')).toBeInTheDocument()

    let sentHeader: string | null = 'unset'
    server.use(
      http.post('*/api/v1/auth/logout', ({ request }) => {
        sentHeader = request.headers.get('X-Reauth-Token')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await api.POST('/auth/logout', { params: { header: { 'X-Pickle-Csrf': 'csrf-token' } } })

    expect(sentHeader).toBeNull()
  })

  test('세션이 만료되면 열려 있던 확인 모달을 닫고 취소로 마감한다', async () => {
    const user = renderHarness()

    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })

    act(() => notifySessionExpired())

    expect(await screen.findByText('err:REAUTH_REQUIRED')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(getReauthToken()).toBeNull()
  })

  test('본문이 있는 요청도 재시도에서 본문이 보존된다', async () => {
    server.use(...reauthGateHandlers('PATCH /vms/:vmId/settings'))
    const user = userEvent.setup()
    const outcome: string[] = []
    render(
      <ReauthProvider>
        <button
          type="button"
          onClick={() =>
            void api
              .PATCH('/vms/{vmId}/settings', {
                params: { path: { vmId: uuid(56) } },
                body: { settings: { ssh_password_enabled: true } },
              })
              .then(({ data, error }) =>
                outcome.push(data ? 'ok:patched' : `err:${error?.code ?? 'unknown'}`),
              )
          }
        >
          설정 변경
        </button>
      </ReauthProvider>,
    )

    await user.click(screen.getByRole('button', { name: '설정 변경' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })
    await user.type(passwordField(), USER_PASSWORD)
    await user.click(screen.getByRole('button', { name: '확인' }))

    // 재시도가 원래 본문(settings)을 그대로 다시 보내야 성공한다.
    await waitFor(() => expect(outcome).toEqual(['ok:patched']))
  })

  test('유효한 토큰이 있으면 두 번째 민감 작업은 모달 없이 통과한다', async () => {
    const user = renderHarness()

    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await screen.findByRole('dialog', { name: '비밀번호 확인' })
    await user.type(passwordField(), USER_PASSWORD)
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('ok:pickle-algo-judge.pem')).toBeInTheDocument()

    // 두 번째 호출: 보유 토큰이 자동으로 붙으므로 게이트를 그대로 통과한다.
    await user.click(screen.getByRole('button', { name: '개인키 내려받기' }))
    await waitFor(() => expect(screen.getAllByText('ok:pickle-algo-judge.pem')).toHaveLength(2))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
