import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { llmKeyStore } from '../test/msw/handlers/llm-keys'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

const ISSUED_KEY = uuid(70)
const PENDING_KEY = uuid(71)
const RESTRICTED_KEY = uuid(72)
const REVOKED_KEY = uuid(73)
const MEMBER_KEY = uuid(74)

function renderKey(keyId: string) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/llm-keys/${keyId}`)
}

describe('LLM API 키 상세', () => {
  test('한도가 비어 있으면 무제한이 아니라 게이트웨이 기본값이라고 말한다', async () => {
    renderKey(PENDING_KEY)

    await screen.findByRole('heading', { name: 'algo-hint-writer' })
    expect(screen.getAllByText('게이트웨이 기본값')).toHaveLength(3)
  })

  test('사용량 통계가 없는 이유를 화면이 말하고, 마지막 사용은 보여 준다', async () => {
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    expect(screen.getByText('2026-08-10 18:22')).toBeInTheDocument()
    expect(screen.getByText(/사용량 통계는 아직 제공하지 않습니다/)).toBeInTheDocument()
  })
})

describe('발급 전 키', () => {
  test('아직 아무것도 인증하지 못한다고 말하고 발급 버튼을 준다', async () => {
    renderKey(PENDING_KEY)

    await screen.findByRole('heading', { name: 'algo-hint-writer' })
    expect(screen.getByText('아직 발급되지 않은 키입니다')).toBeInTheDocument()
    expect(screen.getByText(/이 키로 보낸 요청이 하나도 인증되지 않습니다/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '키 발급' })).toBeEnabled()
    // 폐기 이야기는 여기 없다.
    expect(screen.queryByText('폐기된 키입니다')).not.toBeInTheDocument()
  })

  test('발급하면 평문이 한 번 보이고, 창을 닫으면 화면에서 사라진다', async () => {
    const user = userEvent.setup()
    renderKey(PENDING_KEY)

    await screen.findByRole('heading', { name: 'algo-hint-writer' })
    await user.click(screen.getByRole('button', { name: '키 발급' }))

    const confirm = await screen.findByRole('dialog')
    expect(
      within(confirm).getByText(/단 한 번만 확인할 수 있으며, 서버에는 해시로만/),
    ).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: '키 발급' }))

    // 평문을 보여 주기 전에 다시 볼 수 없다는 말이 먼저 온다.
    const result = await screen.findByRole('dialog')
    expect(within(result).getByText('이 키는 다시 볼 수 없습니다')).toBeInTheDocument()
    const plaintext = within(result).getByText(/^pk-llm-live-.*-secret$/).textContent!

    await user.click(within(result).getByRole('button', { name: '확인했습니다' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // 남는 것은 두 키를 구별하는 앞부분뿐이고, 평문은 어디에도 없다.
    expect(screen.queryByText(plaintext)).not.toBeInTheDocument()
    // 발급이 끝난 키는 이제 재발급 대상이다.
    expect(await screen.findByRole('button', { name: '키 재발급' })).toBeInTheDocument()
  })
})

describe('이미 발급된 키', () => {
  test('버튼이 재발급이고, 누르기 전에 이전 값이 무효가 된다고 말한다', async () => {
    const user = userEvent.setup()
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    await user.click(screen.getByRole('button', { name: '키 재발급' }))

    const confirm = await screen.findByRole('dialog')
    expect(
      within(confirm).getByText(/재발급 즉시 이전 키 값이 무효화됩니다/),
    ).toBeInTheDocument()
  })
})

describe('폐기된 키', () => {
  test('죽었다고 말하고 발급도 폐기도 제안하지 않는다', async () => {
    renderKey(REVOKED_KEY)

    await screen.findByRole('heading', { name: 'leaked-demo-key' })
    expect(screen.getByText('폐기된 키입니다')).toBeInTheDocument()
    expect(screen.getByText(/폐기된 키는 다시 발급할 수 없으니/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /키 발급|키 재발급/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '키 폐기' })).not.toBeInTheDocument()
    expect(screen.getByText('2026-07-31 09:00')).toBeInTheDocument()
  })
})

describe('권한이 화면에 미리 보인다', () => {
  test('참여자 등급은 발급·수정·폐기가 모두 잠기고 사유가 붙는다', async () => {
    // 눌러야만 403을 알게 되는 화면이 아니라, 서버가 준 등급을 그대로 그린다.
    renderKey(MEMBER_KEY)

    await screen.findByRole('heading', { name: 'study-shared-key' })
    expect(screen.getByRole('button', { name: '키 재발급' })).toBeDisabled()
    expect(
      screen.getByText(/키 발급은 이 키의 접근 목록에서 소유자 등급을 받은 사람만/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '키 폐기' })).toBeDisabled()
    expect(
      screen.getByText(/키 폐기는 이 키의 소유자 또는 워크스페이스 소유자만/),
    ).toBeInTheDocument()
    // 접근 목록도 남의 것이다.
    expect(
      screen.queryByRole('link', { name: '접근 권한 관리' }),
    ).not.toBeInTheDocument()
  })

  test('접근 목록에 없으면 상세가 열리지 않고 서버 사유가 그대로 나온다', async () => {
    renderKey(RESTRICTED_KEY)

    expect(
      await screen.findByText(/이 LLM API 키의 접근 목록에 등록되어 있지 않습니다/),
    ).toBeInTheDocument()
  })
})

describe('정지·만료된 키', () => {
  test('발급을 제안하지 않는다 — 새 값도 아무것도 인증하지 못한다', async () => {
    // 서버의 발급은 '발급 전'만 활성으로 올린다. 정지·만료 상태에서 누르면 쓰던
    // 값만 죽고 새 값은 여전히 거부되므로, 그 버튼은 애초에 없어야 한다.
    server.use(
      http.get(`*/api/v1/llm-keys/${MEMBER_KEY}`, () =>
        HttpResponse.json({
          ...llmKeyStore.find((key) => key.id === MEMBER_KEY),
          status: 'EXPIRED',
          myResourceRole: 'OWNER',
          accessManageAllowed: true,
        }),
      ),
    )
    renderKey(MEMBER_KEY)

    await screen.findByRole('heading', { name: 'study-shared-key' })
    expect(screen.getByText('만료된 키입니다')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /키 발급|키 재발급/ })).not.toBeInTheDocument()
    // 폐기는 여전히 열려 있다 — 만료된 키도 정리할 수 있어야 한다.
    expect(screen.getByRole('button', { name: '키 폐기' })).toBeEnabled()
  })
})

describe('키 설정 수정', () => {
  test('바꾼 항목만 보낸다 — 건드리지 않은 용도는 그대로 남는다', async () => {
    const user = userEvent.setup()
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    const name = screen.getByDisplayValue('capstone-chatbot')
    await user.clear(name)
    await user.type(name, 'capstone-chatbot-v2')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('설정을 저장했습니다.')).toBeInTheDocument()
    const stored = llmKeyStore.find((key) => key.id === ISSUED_KEY)!
    expect(stored.name).toBe('capstone-chatbot-v2')
    // 생략한 항목은 서버가 그대로 둔다는 계약이 화면 쪽에서도 지켜져야 한다.
    expect(stored.purpose).toBe('캡스톤 챗봇 백엔드')
  })

  test('공백만 덧붙인 편집은 변경으로 세지 않는다', async () => {
    const user = userEvent.setup()
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    // 서버는 다듬어 저장하므로 돌아오는 값이 그대로다 — 이걸 변경으로 보면 폼이
    // 영원히 미저장 상태에 갇힌다.
    await user.type(screen.getByDisplayValue('캡스톤 챗봇 백엔드'), '   ')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  test('이름은 비울 수 없다고 누르기 전에 말한다', async () => {
    const user = userEvent.setup()
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    await user.clear(screen.getByDisplayValue('capstone-chatbot'))

    expect(await screen.findByText('키 이름은 비워 둘 수 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })
})

describe('키 폐기', () => {
  test('이름을 정확히 입력해야 폐기되고, 되돌릴 수 없다고 먼저 말한다', async () => {
    const user = userEvent.setup()
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    await user.click(screen.getByRole('button', { name: '키 폐기' }))

    const modal = await screen.findByRole('dialog')
    expect(within(modal).getByText('되돌릴 수 없습니다')).toBeInTheDocument()
    const confirmButton = within(modal).getByRole('button', { name: '폐기' })
    expect(confirmButton).toBeDisabled()

    await user.type(within(modal).getByRole('textbox'), 'capstone-chatbot')
    await user.click(within(modal).getByRole('button', { name: '폐기' }))

    expect(await screen.findByText('폐기된 키입니다')).toBeInTheDocument()
    expect(llmKeyStore.find((key) => key.id === ISSUED_KEY)!.status).toBe('REVOKED')
  })
})
