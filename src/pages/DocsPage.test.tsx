import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderApp } from '../test/render'

/**
 * 주소와 모델 이름은 상수에서 오지만, 여기서는 값을 그대로 적는다. 상수를 함께
 * 읽으면 무엇이 바뀌어도 통과하는 시험이 되어, 학생에게 나가는 주소가 조용히
 * 달라지는 것을 잡지 못한다.
 */
describe('사용 가이드', () => {
  test('인증 없이 열리고 첫 호출에 필요한 것을 전부 보여 준다', async () => {
    renderApp('/docs')

    expect(await screen.findByRole('heading', { name: '사용 가이드' })).toBeInTheDocument()

    const body = document.body.textContent ?? ''
    expect(body).toContain('https://llm.pcl.kr/v1')
    expect(body).toContain('pickle-general')
    expect(body).toContain('Authorization: Bearer')
  })

  test('지원 파라미터와 목록 밖 필드의 결과를 함께 말한다', async () => {
    renderApp('/docs')
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
    expect(screen.getByText('목록에 없는 필드는 거부됩니다')).toBeInTheDocument()
  })

  test('base URL이 어디까지인지 주소 옆에서 말한다', async () => {
    renderApp('/docs')
    await screen.findByRole('heading', { name: '시작하기' })

    // 주소를 복사해 가는 자리라, 어디까지가 base URL인지가 그 옆에 있어야 한다.
    // 문장을 통째로 찾으면 안 된다. testing-library 의 매처는 직계 텍스트 노드만
    // 이어 붙이므로 <Code>/v1</Code> 이 매칭에서 빠지고, /v2 로 바뀌어도 통과한다.
    const note = screen.getByText(/까지가 base URL입니다/).closest('p')
    expect(note?.textContent ?? '').toContain('/v1까지가 base URL입니다')
  })

  test('분당 한도가 자체 서빙 모델에만 적용된다고 말한다', async () => {
    renderApp('/docs')
    await screen.findByRole('heading', { name: '한도' })

    // 2026-09-02 축 분리 이후 네 한도 전부 자체 서빙 전용이다. 이 문장이 빠지면
    // 유료 모델 사용자가 자기에게도 걸린다고 읽는다.
    const body = document.body.textContent ?? ''
    expect(body).toContain('자체 서빙 모델에만 적용됩니다')
    // 헤더가 어디에 실리는지도 축을 따른다. 이 문장이 빠지면 유료 모델 사용자가
    // 오지 않는 헤더를 기다린다.
    expect(body).toContain('한도를 통과한 자체 서빙')
    expect(body).toContain('유료 모델 응답에는 분당 요청 한도 자체가 없어')
  })

  test('코딩 에이전트는 openai-compatible 프로바이더로 붙인다고 말한다', async () => {
    renderApp('/docs')
    await screen.findByRole('heading', { name: '코딩 에이전트 연결' })

    const body = document.body.textContent ?? ''
    expect(body).toContain('@ai-sdk/openai-compatible')
    expect(body).toContain('"baseURL": "https://llm.pcl.kr/v1"')
  })

  test('기본 한도를 숫자로 말하고 일일 토큰 한도도 함께 설명한다', async () => {
    renderApp('/docs')
    await screen.findByRole('heading', { name: '한도' })

    expect(screen.getByText('600회')).toBeInTheDocument()
    expect(screen.getByText('1,000,000토큰')).toBeInTheDocument()
    expect(screen.getByText('8건')).toBeInTheDocument()
    // 분당 한도를 다 지켜도 429가 날 수 있는 축이라 빠지면 안 된다.
    expect(screen.getByText('일일 토큰 한도')).toBeInTheDocument()
    expect(document.body.textContent ?? '').toContain('quota_exhausted')
  })

  test('에러는 메시지가 아니라 code로 찾게 한다', async () => {
    renderApp('/docs')
    await screen.findByRole('heading', { name: '에러' })

    // code와 상태 코드의 짝은 lib/llm-api.test.ts가 얼려 둔다. 여기서는 표가 그 짝을
    // 실제로 한 행에 나란히 렌더하는지 확인한다.
    const row = screen.getByText('rate_limit_requests').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getByText('429')).toBeInTheDocument()

    const authRow = screen.getByText('invalid_api_key').closest('tr')
    expect(within(authRow!).getByText('401')).toBeInTheDocument()
  })
})
