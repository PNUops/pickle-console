import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'
import { AccessSection } from './AccessSection'
import { LLM_GATEWAY_HOST, SSH_GATEWAY_HOST } from '../../lib/hosts'
import { LLM_DEFAULT_MODEL } from '../../lib/llm-api'

function renderAccess() {
  render(<MemoryRouter><AccessSection /></MemoryRouter>)
}

describe('Landing connection examples', () => {
  test('uses the VM private key and current SSH gateway in the connection command', () => {
    renderAccess()
    const example = screen.getByLabelText('가상머신 접속 명령 예시')
    expect(example).toHaveTextContent('ssh -i ~/.ssh/pickle-my-vm.pem')
    expect(example).toHaveTextContent('-o IdentitiesOnly=yes')
    expect(example).toHaveTextContent(`my-vm@${SSH_GATEWAY_HOST}`)
  })

  test('shows a JSON request with the current LLM endpoint and model', () => {
    renderAccess()
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
      ['접속과 파일 전송 가이드', '/docs/vm/connect'],
      ['LLM API 연결 가이드', '/docs/llm/connect'],
    ]) {
      const link = screen.getByRole('link', { name: new RegExp(name) })
      expect(link).toHaveAttribute('href', destination)
      expect(link).not.toHaveAttribute('target')
    }
  })
})
