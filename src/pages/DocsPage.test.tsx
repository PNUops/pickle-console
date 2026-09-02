import { screen } from '@testing-library/react'
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

    const body = document.body.textContent ?? ''
    expect(body).toContain('tools')
    expect(body).toContain('stream_options')
    expect(body).toContain('unsupported_parameter')
    expect(screen.getByText('목록에 없는 필드는 거부됩니다')).toBeInTheDocument()
  })

  test('base URL에 /v1이 빠지는 실수를 미리 막는다', async () => {
    renderApp('/docs')
    await screen.findByRole('heading', { name: '시작하기' })

    expect(screen.getByText('base URL은 /v1까지 넣습니다')).toBeInTheDocument()
    expect(document.body.textContent ?? '').toContain('unknown_endpoint')
  })

  test('코딩 에이전트는 openai-compatible 프로바이더로 붙인다고 말한다', async () => {
    renderApp('/docs')
    await screen.findByRole('heading', { name: '코딩 에이전트 연결' })

    const body = document.body.textContent ?? ''
    expect(body).toContain('@ai-sdk/openai-compatible')
    expect(body).toContain('"baseURL": "https://llm.pcl.kr/v1"')
  })

  test('기본 한도를 숫자로 말한다', async () => {
    renderApp('/docs')
    await screen.findByRole('heading', { name: '한도' })

    expect(screen.getByText('20회')).toBeInTheDocument()
    expect(screen.getByText('20,000토큰')).toBeInTheDocument()
    expect(screen.getByText('2건')).toBeInTheDocument()
  })

  test('에러는 메시지가 아니라 code로 찾게 한다', async () => {
    renderApp('/docs')
    await screen.findByRole('heading', { name: '에러' })

    expect(screen.getByText('rate_limit_requests')).toBeInTheDocument()
    expect(screen.getByText('invalid_api_key')).toBeInTheDocument()
  })
})
