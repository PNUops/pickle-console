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
/** 상태 열은 ACTIVE인데 expiresAt이 이미 지난 키 — 서버에 EXPIRED 전이가 없다. */
const PAST_WINDOW_KEY = uuid(75)

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

  // 울타리가 걸린 키를 "제한 없음"으로 보여 주면 소유자는 왜 거절당하는지
  // 화면에서 알 수 없다. 게이트웨이 거절 문구가 이 화면을 가리키므로, 여기가
  // 답을 갖고 있어야 그 안내가 참이 된다.
  test('금액 축이 열린 키는 쓸 수 있는 유료 모델을 보여 준다', async () => {
    renderKey(ISSUED_KEY)

    await screen.findByText('쓸 수 있는 유료 모델')
    expect(screen.getByText('openai/*')).toBeInTheDocument()
    // 허용 줄만 읽으면 openai/* 안의 pro 계열도 쓸 수 있다고 믿게 된다.
    expect(screen.getByText('쓸 수 없는 유료 모델')).toBeInTheDocument()
    expect(screen.getByText('openai/*-pro')).toBeInTheDocument()
  })

  // 금액이 없다고 차단 목록을 가리면, 승인자가 막아 둔 것이 화면에서 사라졌다가
  // 예산이 붙는 날 되살아난다. 소유자는 그때까지 그 규칙의 존재를 모른다.
  test('금액이 없어도 쓸 수 없는 유료 모델을 보여 준다', async () => {
    renderKey(PENDING_KEY)

    await screen.findByRole('heading', { name: 'algo-hint-writer' })
    expect(screen.getByText('쓸 수 없는 유료 모델')).toBeInTheDocument()
    expect(screen.getByText('openai/*-pro')).toBeInTheDocument()
    // 금액이 없으므로 허용 줄은 여전히 말할 것이 없다.
    expect(screen.queryByText('쓸 수 있는 유료 모델')).not.toBeInTheDocument()
  })

  // 기능 권한은 위 두 줄과 반대로 비어 있는 것이 답이다. 셋이 나란히 서 있어서
  // 같은 말로 비면 소유자가 셋을 같은 뜻으로 읽는다.
  test('기능 권한이 없으면 못 쓴다고 말한다', async () => {
    renderKey(PENDING_KEY)

    await screen.findByRole('heading', { name: 'algo-hint-writer' })
    expect(screen.getByText('기능 권한')).toBeInTheDocument()
    expect(screen.getByText(/부여 안 됨\. 이미지 생성 · 임베딩 모두 쓸 수 없습니다/))
      .toBeInTheDocument()
  })

  test('부여된 기능은 이름으로 보여 준다', async () => {
    renderKey(ISSUED_KEY)

    await screen.findByText('기능 권한')
    expect(screen.getByText('이미지 생성')).toBeInTheDocument()
  })

  test('마지막 사용 시각이 늦게 반영될 수 있다는 것을 말한다', async () => {
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    expect(screen.getByText('2026-08-10 18:22')).toBeInTheDocument()
    expect(screen.getByText(/최근 호출이 늦게 반영될 수 있습니다/)).toBeInTheDocument()
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
      within(confirm).getByText(/평문은 다음 화면에서 한 번만 볼 수 있습니다/),
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

describe('연결 정보', () => {
  test('발급된 키에는 어디로 보내는지와 모델 이름이 함께 보인다', async () => {
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    const body = document.body.textContent ?? ''
    expect(body).toContain('https://llm.pcl.kr/v1')
    expect(body).toContain('pickle-general')
    // 사이드바 하단에도 같은 이름의 링크가 있으므로 본문 안에서만 찾는다.
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: '사용 가이드' })).toHaveAttribute('href', '/docs')
  })

  test('아직 발급 전인 키에는 연결 정보를 보여 주지 않는다', async () => {
    renderKey(PENDING_KEY)

    await screen.findByRole('heading', { name: 'algo-hint-writer' })
    expect(screen.queryByText('연결 정보')).not.toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toContain('https://llm.pcl.kr/v1')
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

describe('기간이 지난 키 — 상태 열은 아직 활성이다', () => {
  test('시계를 근거로 만료로 그리고 재발급을 권하지 않는다', async () => {
    // 서버에는 EXPIRED로 옮기는 코드가 없고 게이트웨이가 expiresAt으로 거부한다.
    // 상태 문자열만 믿으면 이미 거부되는 키에 '활성' 배지를 달고, 눌러 봐야
    // 그 평문도 똑같이 거부되는 재발급 버튼을 연다.
    renderKey(PAST_WINDOW_KEY)

    await screen.findByRole('heading', { name: 'last-semester-key' })
    expect(screen.getByText('만료됨')).toBeInTheDocument()
    expect(screen.queryByText('활성')).not.toBeInTheDocument()
    expect(screen.getByText('만료된 키입니다')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /키 발급|키 재발급/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '키 폐기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })

  test('목록도 같은 근거로 판정해 상세와 다른 말을 하지 않는다', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/llm-keys')

    const row = (await screen.findByRole('link', { name: 'last-semester-key' })).closest('tr')!
    expect(within(row).getByText('만료됨')).toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: '키 폐기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
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
