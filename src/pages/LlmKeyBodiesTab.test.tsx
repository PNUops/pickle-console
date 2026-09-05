import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

const RECORDING_OFF_WITH_HISTORY = uuid(75)
const RECORDED_KEY = uuid(73)
const NO_RECORDS_KEY = uuid(70)
const PENDING_KEY = uuid(71)
const NO_GRANT_KEY = uuid(72)

function renderBodies(keyId: string) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/llm-keys/${keyId}?tab=bodies`)
}

describe('기록된 본문 탭', () => {
  test('주소로 바로 열리고 기록을 보인다', async () => {
    renderBodies(RECORDED_KEY)

    expect(await screen.findByRole('tab', { name: '기록된 본문', selected: true })).toBeInTheDocument()
    expect(await screen.findByText(/"0번째 질문입니다"/)).toBeInTheDocument()
  })

  test('꺼진 키에도 기록이 남아 있으면 보여 준다', async () => {
    // 끄기는 앞으로를 정하는 스위치이지 삭제가 아니다. 탭을 숨기면 켰다 끈 사람이
    // 자기가 남긴 것을 볼 수 없다 — 이 회귀를 막는 유일한 그물이다.
    renderBodies(RECORDING_OFF_WITH_HISTORY)

    expect(await screen.findByText(/본문 기록은 지금 꺼져 있습니다/)).toBeInTheDocument()
    expect(await screen.findByText(/"90번째 질문입니다"/)).toBeInTheDocument()
  })

  test('기록이 없고 꺼져 있으면 켜는 길을 안내한다', async () => {
    renderBodies(NO_RECORDS_KEY)

    expect(await screen.findByText('기록된 본문이 없습니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '개요 탭에서 켜기' })).toBeInTheDocument()
  })

  test('발급 전 키는 조회하지 않고 이유를 말한다', async () => {
    renderBodies(PENDING_KEY)

    expect(await screen.findByText('아직 발급되지 않은 키입니다')).toBeInTheDocument()
  })

  test('부여 없는 키는 기록을 한 줄도 보여 주지 않는다', async () => {
    // 어떤 면으로 거절하는지는 상세 화면의 일이고, 여기서 말할 수 있는 것은
    // 부여 없는 사람에게 기록이 한 줄도 닿지 않는다는 것이다.
    renderBodies(NO_GRANT_KEY)

    await screen.findByRole('link', { name: /내 LLM API 키/ })
    expect(screen.queryByText(/질문입니다/)).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('상시 고지가 목록에 있다', async () => {
    // 켜지 않은 사람이 규칙을 배우는 자리는 여기뿐이다 — 토글 문구는 켜는 사람만
    // 읽는다.
    renderBodies(RECORDED_KEY)

    expect(
      await screen.findByText(/접근 권한이 있는 사람이면 누구나 읽을 수 있습니다/),
    ).toBeInTheDocument()
    expect(screen.getByText(/보관 기간은 30일/)).toBeInTheDocument()
  })

  test('전문을 열면 역할별로 나뉜다', async () => {
    const user = userEvent.setup()
    renderBodies(RECORDED_KEY)

    const rows = await screen.findAllByRole('button', { name: /기록 전문 보기$/ })
    await user.click(rows[1])

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('system')).toBeInTheDocument()
    expect(within(drawer).getByText('you are helpful')).toBeInTheDocument()
  })

  test('잘린 프롬프트는 한 덩어리이고 그 이유를 말한다', async () => {
    const user = userEvent.setup()
    renderBodies(RECORDED_KEY)

    // 잘린 기록이 첫 줄이다.
    const rows = await screen.findAllByRole('button', { name: /기록 전문 보기$/ })
    await user.click(rows[0])

    const drawer = await screen.findByRole('dialog')
    // 문장이 줄바꿈을 걸쳐 있어 getByText 가 요소 단위로 물지 못한다.
    expect(drawer.textContent).toContain('역할별로 나눌 수 없어 한 덩어리로')
    expect(drawer.textContent).toContain('64 KiB를 넘어')
    // 잘렸다는 사실은 한 번만 나온다. 설명 문장이 그것을 되풀이하면 한 화면이
    // 같은 말을 두 번 하게 되고, 그 형태로 한 번 배포된 적이 있다.
    expect(drawer.textContent?.match(/앞부분만/g) ?? []).toHaveLength(1)
  })

  test('읽을 수 없는 기록은 빈 것과 다르게 말한다', async () => {
    // readable=false 와 「기록되지 않음」은 다른 주장이다.
    renderBodies(RECORDING_OFF_WITH_HISTORY)

    expect(await screen.findByText('읽을 수 없음')).toBeInTheDocument()
  })

  test('개요 탭에서는 본문을 조회하지 않는다', async () => {
    // 비활성 패널은 렌더되지 않으므로 질의가 지연 실행된다.
    server.use(refreshSuccessHandler('access-user'))
    renderApp(`/console/llm-keys/${RECORDED_KEY}`)

    expect(await screen.findByRole('tab', { name: '개요', selected: true })).toBeInTheDocument()
    expect(screen.queryByText(/질문입니다/)).not.toBeInTheDocument()
  })
})
