import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderApp } from '../test/render'

/**
 * 주소와 모델 이름은 상수에서 오지만, 여기서는 값을 그대로 적는다. 상수를 함께
 * 읽으면 무엇이 바뀌어도 통과하는 시험이 되어, 학생에게 나가는 주소가 조용히
 * 달라지는 것을 잡지 못한다.
 */
describe('사용 가이드', () => {
  test('opens the first-call guide without authentication', async () => {
    renderApp('/docs/llm/connect')

    expect(await screen.findByRole('heading', { name: '첫 호출과 도구 연결' })).toBeInTheDocument()

    const body = document.body.textContent ?? ''
    expect(body).toContain('https://llm.pcl.kr/v1')
    expect(body).toContain('pickle-general')
    expect(body).toContain('Authorization: Bearer')
  })

  test('distinguishes self-served validation from paid passthrough', async () => {
    renderApp('/docs/llm/features')
    await screen.findByRole('heading', { name: '지원 파라미터' })

    // 목록의 구성원은 lib/llm-api.test.ts가 얼려 둔다. 여기서는 그 목록이 실제로
    // 화면에 렌더되는지만 본다 — 산문에도 나오는 이름으로 확인하면 목록이 통째로
    // 사라져도 통과하므로, 목록에만 있는 이름을 고른다.
    expect(screen.getByText('parallel_tool_calls')).toBeInTheDocument()
    expect(screen.getByText('max_completion_tokens')).toBeInTheDocument()
    expect(screen.getByText('presence_penalty')).toBeInTheDocument()
    // 축이 갈렸다는 것이 화면에도 보여야 한다. 목록 하나만 두면 유료 전용 필드를
    // 자체 서빙에 보내도 되는 것처럼 읽힌다.
    expect(screen.getByText('두 종류에 공통')).toBeInTheDocument()
    expect(screen.getByText('유료 모델에만')).toBeInTheDocument()
    // 산문에도 같은 이름이 나오므로 칩 목록 안에서만 찾는다. 설명이 아니라 목록에
    // 들어 있는지가 이 시험이 지키려는 것이다.
    const paidChips = screen.getByText('유료 모델에만').parentElement!
    expect(within(paidChips).getByText('reasoning_effort')).toBeInTheDocument()
    expect(within(paidChips).getByText('verbosity')).toBeInTheDocument()
    // 거부는 자체 서빙 쪽 사실이다. 유료 축에는 허용 목록이 아예 없어 목록 밖 필드가
    // 그대로 전달되므로, 제목이 축을 말하지 않으면 화면이 두 축 모두에 거부를 약속한다.
    expect(
      screen.getByText('자체 서빙 모델은 목록에 없는 필드를 거부합니다'),
    ).toBeInTheDocument()
    // 제목만 걸면 문구를 되돌려도 통과한다. 유료 쪽이 면제라는 것까지 화면에 있어야
    // 이 구분이 지켜진다.
    expect(document.body.textContent ?? '').toContain(
      '유료 모델은 공급자가 받는 요청을 그대로 보내므로',
    )
  })

  test('lists every non-chat route and its permission requirement', async () => {
    renderApp('/docs/llm/features')
    await screen.findByRole('heading', { name: '이미지와 임베딩' })

    // 경로 목록은 lib/llm-api.ts 가 갖는다. 여기서는 그것이 실제로 표에 그려지는지를
    // 본다 — 셋 다 확인하는 것은 하나만 보면 map 이 깨져도 통과하기 때문이다.
    expect(screen.getByText(/POST \/v1\/images$/)).toBeInTheDocument()
    expect(screen.getByText(/GET \/v1\/images\/models/)).toBeInTheDocument()
    expect(screen.getByText(/POST \/v1\/embeddings/)).toBeInTheDocument()

    const body = document.body.textContent ?? ''
    // 이 경로들은 키에 기능이 부여돼야 열린다. 그 말이 없으면 403 을 받은 사람이
    // 자기 코드를 의심한다.
    expect(body).toContain('endpoint_not_allowed')
    // 처음 물어 온 사람이 OpenAI 경로부터 시도해 404 를 받았다. 같은 실수를 막는 문장이다.
    expect(body).toContain('/v1/images/generations')
    expect(body).toContain('streaming_not_supported')
  })

  test('places the version suffix next to the base URL', async () => {
    renderApp('/docs/llm/connect')
    await screen.findByRole('heading', { name: '첫 호출' })

    // 주소를 복사해 가는 자리라, 어디까지가 base URL인지가 그 옆에 있어야 한다.
    // 문장을 통째로 찾으면 안 된다. testing-library 의 매처는 직계 텍스트 노드만
    // 이어 붙이므로 <Code>/v1</Code> 이 매칭에서 빠지고, /v2 로 바뀌어도 통과한다.
    const note = screen.getByText(/까지가 base URL입니다/).closest('p')
    expect(note?.textContent ?? '').toContain('/v1까지가 base URL입니다')
  })

  test('limits rate headers to self-served responses', async () => {
    renderApp('/docs/llm/limits')
    await screen.findByRole('heading', { name: '분당·동시 요청 한도' })

    // 2026-09-02 축 분리 이후 네 한도 전부 자체 서빙 전용이다. 이 문장이 빠지면
    // 유료 모델 사용자가 자기에게도 걸린다고 읽는다.
    const body = document.body.textContent ?? ''
    expect(body).toContain('자체 서빙 모델에만 적용됩니다')
    // 헤더가 어디에 실리는지도 축을 따른다. 이 문장이 빠지면 유료 모델 사용자가
    // 오지 않는 헤더를 기다린다.
    expect(body).toContain('한도를 통과한 자체 서빙')
    expect(body).toContain('유료 모델 응답에는 분당 요청 한도 자체가 없어')
  })

  test('preserves the compatible coding-agent configuration', async () => {
    renderApp('/docs/llm/connect')
    await screen.findByRole('heading', { name: '코딩 에이전트 연결' })

    const body = document.body.textContent ?? ''
    expect(body).toContain('@ai-sdk/openai-compatible')
    expect(body).toContain('"baseURL": "https://llm.pcl.kr/v1"')
  })

  test('distinguishes defaults from the daily budget', async () => {
    renderApp('/docs/llm/limits')
    await screen.findByRole('heading', { name: '분당·동시 요청 한도' })

    expect(screen.getByText('600회')).toBeInTheDocument()
    expect(screen.getByText('1,000,000토큰')).toBeInTheDocument()
    expect(screen.getByText('8건')).toBeInTheDocument()
    // 분당 한도를 다 지켜도 429가 날 수 있는 축이라 빠지면 안 된다.
    expect(screen.getByText('일일 토큰 한도')).toBeInTheDocument()
    expect(document.body.textContent ?? '').toContain('quota_exhausted')
  })

  test('pairs stable error codes with HTTP status', async () => {
    renderApp('/docs/llm/errors')
    await screen.findByRole('heading', { name: '오류 코드 전체 목록' })

    // code와 상태 코드의 짝은 lib/llm-api.test.ts가 얼려 둔다. 여기서는 표가 그 짝을
    // 실제로 한 행에 나란히 렌더하는지 확인한다.
    const row = screen.getByText('rate_limit_requests').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getByText('429')).toBeInTheDocument()

    const authRow = within(screen.getByRole('table')).getByText('invalid_api_key').closest('tr')
    expect(within(authRow!).getByText('401')).toBeInTheDocument()
  })
})
