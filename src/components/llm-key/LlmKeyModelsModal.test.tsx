import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, test } from 'vitest'

import { refreshSuccessHandler } from '../../test/msw/handlers/auth'
import {
  llmKeyModelsStates,
  type LlmKeyModelsState,
} from '../../test/msw/handlers/llm-keys'
import { uuid } from '../../test/msw/ids'
import { server } from '../../test/msw/server'
import { renderApp } from '../../test/render'

/** 소유자 등급이 붙은 활성 키. 연결 정보 카드가 이 상태에서만 뜬다. */
const OWNED_ACTIVE_KEY = uuid(70)

/**
 * 상태를 하나 골라 모달을 연다.
 *
 * 상태를 시험이 **고르게** 하는 것이 요점이다. 기본 픽스처 하나에 기대면
 * 만들어 본 적 없는 조합은 한 번도 안 그려진 채로 배포된다.
 */
async function openModels(state: LlmKeyModelsState) {
  server.use(
    refreshSuccessHandler('access-user'),
    http.get('*/api/v1/llm-keys/:keyId/models', () =>
      HttpResponse.json(llmKeyModelsStates[state], { status: 200 }),
    ),
  )
  renderApp(`/console/llm-keys/${OWNED_ACTIVE_KEY}`)
  const open = await screen.findByRole('button', { name: '호출할 수 있는 모델 보기' })
  await userEvent.click(open)
  return screen.findByRole('dialog')
}

describe('호출할 수 있는 모델', () => {
  test('한도가 없어도 목록을 보여 주고 무엇을 신청하는 것인지 말한다', async () => {
    // 목록을 감추면 이름을 모르는 사람이 신청서를 쓸 수 없다. 그 판단이
    // 이 화면의 전제라, 감추는 회귀를 잡는 자리가 여기다.
    await openModels('noBudget')

    expect(await screen.findByText(/아직 금액 한도가 없습니다/)).toBeInTheDocument()
    expect(await screen.findByText('openai/gpt-5.6-luna')).toBeInTheDocument()
  })

  test('한도를 적용하는 중이면 기다리면 된다고 말한다', async () => {
    await openModels('pending')
    expect(await screen.findByText(/적용하는 중입니다/)).toBeInTheDocument()
  })

  test('좁히는 규칙이 없으면 좁혀졌다고 말하지 않는다', async () => {
    await openModels('unrestricted')

    expect(await screen.findByText('openai/gpt-5.6-luna')).toBeInTheDocument()
    expect(screen.queryByText('이것들만')).not.toBeInTheDocument()
    expect(screen.queryByText('이것들 빼고')).not.toBeInTheDocument()
  })

  test('허용 목록으로 좁힌 것과 차단 목록으로 좁힌 것을 구분해 보여 준다', async () => {
    await openModels('allowOnly')
    expect(await screen.findByText('이것들만')).toBeInTheDocument()
    expect(screen.queryByText('이것들 빼고')).not.toBeInTheDocument()
  })

  test('차단 목록만 있어도 무엇이 좁혔는지 보인다', async () => {
    // `access`는 LISTED 인데 허용 목록이 비어 있는 자리다. 허용 쪽만 그리면
    // 「목록으로 좁혀짐」이라면서 보여 줄 목록이 없는 화면이 된다.
    await openModels('denyOnly')

    expect(await screen.findByText('이것들 빼고')).toBeInTheDocument()
    expect(await screen.findByText('anthropic/*')).toBeInTheDocument()
    expect(screen.queryByText('이것들만')).not.toBeInTheDocument()
  })

  test('안 맞는 차단 규칙을 오류로 부르지 않는다', async () => {
    // 아직 카탈로그에 없는 티어를 미리 막아 두는 것은 정당한 운영이다. 경고로
    // 부르면 승인자가 규칙을 지우고, 그 모델이 나오는 날 뚫린다. 허용 쪽은
    // 대체로 오타이므로 문구가 달라야 한다.
    await openModels('unmatched')

    expect(await screen.findByText(/찾을 수 없는 이름: vendor\/gone/)).toBeInTheDocument()
    expect(
      await screen.findByText(/지금은 아무것도 막지 않는 차단 규칙: openai\/\*-pro/),
    ).toBeInTheDocument()
  })

  test('한 번도 못 가져온 목록과 비어 있는 목록을 다르게 말한다', async () => {
    await openModels('neverFetched')
    expect(await screen.findByText(/한 번도 가져오지 못했습니다/)).toBeInTheDocument()
  })

  test('낡은 목록은 그리되 단서를 붙인다', async () => {
    await openModels('stale')

    expect(await screen.findByText(/가져온 지 오래됐습니다/)).toBeInTheDocument()
    expect(await screen.findByText('openai/gpt-5.6-luna')).toBeInTheDocument()
  })

  test('좁혀서 남은 것이 없는 것과 목록이 비어 있는 것을 구분한다', async () => {
    await openModels('narrowedToNothing')
    expect(await screen.findByText(/이 키가 부를 수 있는 모델이 없습니다/)).toBeInTheDocument()
  })

  test('자체 서빙 구역이 비어도 고장으로 읽히지 않는다', async () => {
    await openModels('noSelfServed')

    expect(await screen.findByText(/자체 서빙 모델이 없습니다/)).toBeInTheDocument()
    expect(await screen.findByText('openai/gpt-5.6-luna')).toBeInTheDocument()
  })

  test('검색이 두 구역을 함께 좁히고 없으면 없다고 말한다', async () => {
    // 유료 카탈로그는 수백 행이라 검색이 없으면 목록을 훑을 수 없다.
    await openModels('unrestricted')

    const box = await screen.findByLabelText('모델 이름으로 찾기')
    await userEvent.type(box, 'anthropic')

    expect(await screen.findByText('anthropic/claude-sonnet-4')).toBeInTheDocument()
    expect(screen.queryByText('openai/gpt-5.6-luna')).not.toBeInTheDocument()
    expect(await screen.findByText('찾는 이름이 없습니다.')).toBeInTheDocument()
  })
})
