import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'
import { AccessSection } from './AccessSection'
import { LLM_GATEWAY_HOST, SSH_GATEWAY_HOST } from '../../lib/hosts'
import { LLM_API_BASE_URL, LLM_DEFAULT_MODEL } from '../../lib/llm-api'

function renderAccess() {
  render(<MemoryRouter><AccessSection /></MemoryRouter>)
}

describe('Landing connection examples', () => {
  test('uses the VM private key and current SSH gateway in the connection command', () => {
    renderAccess()
    if (!SSH_GATEWAY_HOST) {
      expect(screen.queryByLabelText('가상머신 접속 명령 예시')).not.toBeInTheDocument()
      expect(screen.getAllByText('개발 환경에서 비활성')).not.toHaveLength(0)
      return
    }
    const example = screen.getByLabelText('가상머신 접속 명령 예시')
    expect(example).toHaveTextContent('ssh -i ~/.ssh/pickle-my-vm.pem')
    expect(example).toHaveTextContent('-o IdentitiesOnly=yes')
    expect(example).toHaveTextContent(`my-vm@${SSH_GATEWAY_HOST}`)
  })

  test('shows a JSON request with the current LLM endpoint and model', () => {
    renderAccess()
    if (!LLM_API_BASE_URL) {
      expect(screen.queryByLabelText('LLM API 호출 명령 예시')).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /LLM API 연결 가이드/ })).not.toBeInTheDocument()
      return
    }
    const command = screen.getByLabelText('LLM API 호출 명령 예시').textContent ?? ''
    expect(command).toContain(`curl https://${LLM_GATEWAY_HOST}/v1/chat/completions`)
    expect(command).toContain('Authorization: Bearer $PICKLE_API_KEY')
    expect(command).toContain('Content-Type: application/json')
    const payload = command.match(/-d '(.+)'$/)?.[1]
    expect(payload).toBeDefined()
    expect(JSON.parse(payload!)).toEqual({
      model: LLM_DEFAULT_MODEL,
      messages: [{ role: 'user', content: '안녕하세요' }],
    })
  })

  test('opens the connection guides without an iframe target', () => {
    renderAccess()
    for (const [name, destination] of [
      ...(SSH_GATEWAY_HOST ? [['접속과 파일 전송 가이드', '/docs/vm/connect']] : []),
      ...(LLM_GATEWAY_HOST ? [['LLM API 연결 가이드', '/docs/llm/connect']] : []),
    ]) {
      const link = screen.getByRole('link', { name: new RegExp(name) })
      expect(link).toHaveAttribute('href', destination)
      expect(link).not.toHaveAttribute('target')
    }
  })
})
