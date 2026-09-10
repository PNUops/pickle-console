import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { llmKeyDetailAs, llmKeyStore } from '../test/msw/handlers/llm-keys'
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

function renderKey(keyId: string, tab?: string) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/llm-keys/${keyId}${tab ? `?tab=${tab}` : ''}`)
}

describe('LLM API 키 상세', () => {
  test('hides the per-minute and concurrency limits from the owner', async () => {
    // Those are the platform's values; the request form never asks for them.
    // Shown here, the owner reads numbers they cannot change and asks why.
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    expect(screen.queryByText(/분당/)).not.toBeInTheDocument()
    expect(screen.queryByText(/동시 요청/)).not.toBeInTheDocument()
    expect(screen.getByText('일일 토큰 한도')).toBeInTheDocument()
    expect(screen.getByText('500,000토큰')).toBeInTheDocument()
  })

  test('says a missing daily limit is none and a zero limit is zero', async () => {
    server.use(refreshSuccessHandler('access-user'))
    const pending = renderApp(`/console/llm-keys/${PENDING_KEY}`)

    await screen.findByRole('heading', { name: 'algo-hint-writer' })
    expect(screen.getByText('일일 토큰 한도').nextElementSibling).toHaveTextContent(/^없음$/)
    pending.unmount()

    // Zero is a value: the gauge on the usage tab says what it blocks.
    renderApp(`/console/llm-keys/${MEMBER_KEY}`)
    await screen.findByRole('heading', { name: 'study-shared-key' })
    expect(screen.getByText('일일 토큰 한도').nextElementSibling).toHaveTextContent(/^0토큰$/)
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
    expect(screen.getByText('부여 안 됨')).toBeInTheDocument()
  })

  test('부여된 기능은 이름으로 보여 준다', async () => {
    renderKey(ISSUED_KEY)

    await screen.findByText('기능 권한')
    expect(screen.getByText('이미지 생성')).toBeInTheDocument()
  })

  test('reads the last use as one relative time and nothing else', async () => {
    // 「지금도 쓰이고 있나」를 묻는 값은 상대 시간 하나다. 절대 시각을 옆에 함께
    // 두면 한 자리가 한 시각을 두 번 읽고, 목록의 같은 열과도 어긋난다.
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    const cell = screen.getByText('마지막 사용').nextElementSibling!
    expect(cell).toHaveTextContent(/^\d+(분|시간|일) 전$/)
    expect(cell.querySelector('time')).toHaveAttribute('datetime', '2026-08-10T18:22:00+09:00')
    expect(screen.queryByText(/늦게 반영될 수 있습니다/)).not.toBeInTheDocument()
  })

  test('keeps the value cells to the value', async () => {
    renderKey(PENDING_KEY)

    await screen.findByRole('heading', { name: 'algo-hint-writer' })
    expect(screen.getByText('금액 한도 없음')).toBeInTheDocument()
    expect(screen.queryByText(/유료 모델을 쓸 수 없습니다/)).not.toBeInTheDocument()
  })
})

describe('발급 전 키', () => {
  test('아직 아무것도 인증하지 못한다고 말하고 발급 버튼을 준다', async () => {
    renderKey(PENDING_KEY)

    await screen.findByRole('heading', { name: 'algo-hint-writer' })
    // 그 사실은 누르는 자리에서 한 번만 말한다. 헤더 배지가 상태를 말하므로 개요에
    // 알림을 두면 한 탭에 세 번 서게 된다.
    // 「발급 전」은 헤더 배지와 키 정보의 「키 앞부분」 칸에 함께 나온다.
    expect(screen.getAllByText('발급 전').length).toBeGreaterThan(0)
    expect(screen.queryByText('아직 발급되지 않은 키입니다')).not.toBeInTheDocument()
    const issued = screen.getByText(/발급하기 전까지 이 키로 보낸 요청은 인증되지 않습니다/)
    expect(issued).toBeInTheDocument()
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

    // 이 창은 배경 클릭과 Escape 로 닫히지 않는다. 이 카드가 탭 패널 안에 있어서,
    // 닫히면 탭을 옮길 수 있게 되고 그 순간 평문이 사라진다.
    await user.keyboard('{Escape}')
    expect(within(result).getByText(/^pk-llm-live-.*-secret$/)).toBeInTheDocument()

    await user.click(within(result).getByRole('button', { name: '확인했습니다' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // 남는 것은 두 키를 구별하는 앞부분뿐이고, 평문은 어디에도 없다.
    expect(screen.queryByText(plaintext)).not.toBeInTheDocument()
    // 발급이 끝난 키는 재발급 대상이 된다 — 같은 카드의 제목과 버튼이 함께 바뀌고,
    // 연결 정보가 그 위에 선다.
    expect(screen.queryByRole('button', { name: '키 발급' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '키 재발급' })).toBeInTheDocument()
    expect(screen.getByText('연결 정보')).toBeInTheDocument()
  })
})

describe('이미 발급된 키', () => {
  test('puts re-issue on the overview and warns before the old value dies', async () => {
    // The reason to re-issue is that the value is lost, and the place a
    // reader notices that is where the value should have been.
    const user = userEvent.setup()
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    await user.click(screen.getByRole('button', { name: '키 재발급' }))

    const confirm = await screen.findByRole('dialog')
    expect(
      within(confirm).getByText(/재발급 즉시 이전 키 값이 무효화됩니다/),
    ).toBeInTheDocument()
  })

  test('draws the facts before the ways to use the key', async () => {
    renderKey(ISSUED_KEY)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    const titles = [...document.querySelectorAll('main h2, main h3')]
      .map((el) => el.textContent?.trim())
      .filter((text) => text === '키 정보' || text === '연결 정보' || text === '키 재발급')
    expect(titles).toEqual(['키 정보', '연결 정보', '키 재발급'])
  })

  test('offers no re-issue on the settings tab', async () => {
    // 설정 is the two settings and the revoke, and nothing that mints a value.
    renderKey(ISSUED_KEY, 'settings')

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    expect(screen.queryByRole('button', { name: /키 발급|키 재발급/ })).not.toBeInTheDocument()
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
    // The model list opens from the same row as that model's copy button.
    const row = main.getByRole('button', { name: '호출할 수 있는 모델 보기' }).parentElement!
    expect(within(row).getByText('pickle-general')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: '복사' })).toBeInTheDocument()
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
    // 다음 행동을 말하고, 내부 어휘(게이트웨이)로 어디서 거부되는지는 말하지 않는다.
    expect(screen.getByText(/계속 쓰려면 새로 신청해 주세요/)).toBeInTheDocument()
    expect(screen.queryByText(/게이트웨이/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /키 발급|키 재발급/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '키 폐기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '설정' })).not.toBeInTheDocument()
    expect(screen.getByText('2026-07-31 09:00')).toBeInTheDocument()
  })
})

describe('권한이 화면에 미리 보인다', () => {
  test('locks re-issue for a member and says who can', async () => {
    // 개요는 누구나 보므로, 발급 권한이 없는 사람도 그 카드를 보고 비활성 버튼과
    // 사유를 읽는다 (사용자 콘솔의 설명형 비활성 규칙). 아무것도 할 수 없는 탭은
    // 그 사람에게 아예 서지 않는 것과 다른 규칙이다.
    renderKey(MEMBER_KEY)

    await screen.findByRole('heading', { name: 'study-shared-key' })
    expect(screen.getByRole('button', { name: '키 재발급' })).toBeDisabled()
    expect(
      screen.getByText(/키 발급은 이 키의 접근 목록에서 소유자 등급을 받은 사람만/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '설정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '접근' })).not.toBeInTheDocument()
    // 접근 목록도 남의 것이다.
    expect(
      screen.queryByRole('link', { name: '접근 권한 관리' }),
    ).not.toBeInTheDocument()
  })

  test('drops a hidden tab address onto the overview', async () => {
    renderKey(MEMBER_KEY, 'settings')

    await screen.findByRole('heading', { name: 'study-shared-key' })
    expect(screen.getByRole('tab', { name: '개요', selected: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })

  test('lets an editor edit while issue and revoke stay locked with a reason', async () => {
    // One right is enough to open the tab; the rest sits locked and says why.
    const user = userEvent.setup()
    server.use(llmKeyDetailAs(MEMBER_KEY, 'EDITOR', { accessManageAllowed: false }))
    renderKey(MEMBER_KEY, 'settings')

    await screen.findByRole('heading', { name: 'study-shared-key' })
    expect(screen.getByRole('tab', { name: '설정', selected: true })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '접근' })).not.toBeInTheDocument()
    await user.type(screen.getByDisplayValue('study-shared-key'), '-2')
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '키 폐기' })).toBeDisabled()
    expect(
      screen.getByText(/키 폐기는 이 키의 소유자 또는 워크스페이스 소유자만/),
    ).toBeInTheDocument()
    // 재발급은 개요에 서고, 편집권으로는 열리지 않는다.
    expect(screen.queryByRole('button', { name: '키 재발급' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '개요' }))
    expect(screen.getByRole('button', { name: '키 재발급' })).toBeDisabled()
    expect(
      screen.getByText(/키 발급은 이 키의 접근 목록에서 소유자 등급을 받은 사람만/),
    ).toBeInTheDocument()
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
    expect(screen.queryByRole('tab', { name: '설정' })).not.toBeInTheDocument()
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
    server.use(llmKeyDetailAs(MEMBER_KEY, 'OWNER', { status: 'EXPIRED' }))
    renderKey(MEMBER_KEY, 'settings')

    await screen.findByRole('heading', { name: 'study-shared-key' })
    expect(screen.getByText('만료된 키입니다')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /키 발급|키 재발급/ })).not.toBeInTheDocument()
    // With no settings tab, the address opens the overview.
    expect(screen.queryByRole('tab', { name: '설정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '키 폐기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })
})

describe('키 이름 수정', () => {
  test('sends the name alone and leaves the rest of the key standing', async () => {
    // 이름 카드는 이름만 보낸다. 같은 요청에 나머지를 실으면, 화면이 더 이상
    // 다루지 않는 값(용도)과 다른 카드가 가진 값(본문 기록)을 이 저장이 덮는다.
    const user = userEvent.setup()
    // 기록을 켜 둔 채로 이름을 바꾼다. 픽스처 기본값이 꺼짐이라 그대로 두면
    // 「덮지 않았다」는 단언이 공허해진다 — 덮어도 같은 값이 나온다.
    const key = llmKeyStore.find((candidate) => candidate.id === ISSUED_KEY)!
    key.recordBodies = true
    renderKey(ISSUED_KEY, 'settings')

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    const name = screen.getByDisplayValue('capstone-chatbot')
    await user.clear(name)
    await user.type(name, 'capstone-chatbot-v2')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('이름을 바꿨습니다.')).toBeInTheDocument()
    const stored = llmKeyStore.find((candidate) => candidate.id === ISSUED_KEY)!
    expect(stored.name).toBe('capstone-chatbot-v2')
    // 생략한 항목은 서버가 그대로 둔다는 계약이 화면 쪽에서도 지켜져야 한다.
    expect(stored.purpose).toBe('캡스톤 챗봇 백엔드')
    expect(stored.recordBodies).toBe(true)
  })

  test('공백만 덧붙인 편집은 변경으로 세지 않는다', async () => {
    const user = userEvent.setup()
    renderKey(ISSUED_KEY, 'settings')

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    // 서버는 다듬어 저장하므로 돌아오는 값이 그대로다 — 이걸 변경으로 보면 폼이
    // 영원히 미저장 상태에 갇힌다.
    await user.type(screen.getByDisplayValue('capstone-chatbot'), '   ')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  test('이름은 비울 수 없다고 누르기 전에 말한다', async () => {
    const user = userEvent.setup()
    renderKey(ISSUED_KEY, 'settings')

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    await user.clear(screen.getByDisplayValue('capstone-chatbot'))

    expect(await screen.findByText('키 이름은 비워 둘 수 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })
})

describe('키 폐기', () => {
  test('카드가 제 이름을 세 번 말하지 않는다', async () => {
    // 카드 제목과 버튼이 「키 폐기」다. 종전에는 행 라벨이 한 번 더 있었다.
    // VM 삭제 카드와 같은 모양이다 — 카드는 무엇을 하는지 한 줄로 말한다.
    renderKey(ISSUED_KEY, 'settings')

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    expect(screen.getAllByText('키 폐기')).toHaveLength(2)
    expect(screen.getByText(/이후 이 키로 보낸 요청이 거부됩니다/)).toBeInTheDocument()
  })


  test('이름을 정확히 입력해야 폐기되고, 되돌릴 수 없다고 먼저 말한다', async () => {
    const user = userEvent.setup()
    renderKey(ISSUED_KEY, 'settings')

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
