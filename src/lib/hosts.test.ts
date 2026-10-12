import { describe, expect, test } from 'vitest'
import { LLM_API_BASE_URL } from './llm-api'
import { canMountConsole, displaySshGatewayHost, SSH_GATEWAY_HOST } from './hosts'

describe('deployment endpoints', () => {
  test('development never shows a production SSH endpoint supplied by the API', () => {
    if (PICKLE_DEPLOY_TARGET === 'development') {
      expect(displaySshGatewayHost('ssh.pcl.kr')).toBeNull()
      expect(SSH_GATEWAY_HOST).not.toBe('ssh.pcl.kr')
      expect(LLM_API_BASE_URL).not.toBe('https://llm.pcl.kr/v1')
    } else {
      expect(displaySshGatewayHost('ssh.pcl.kr')).toBe('ssh.pcl.kr')
      expect(LLM_API_BASE_URL).toBe('https://llm.pcl.kr/v1')
    }
  })

  test('a development SSH endpoint must match the configured host', () => {
    if (PICKLE_DEPLOY_TARGET !== 'development') return
    expect(displaySshGatewayHost('other.pnuops.com')).toBeNull()
    expect(displaySshGatewayHost(SSH_GATEWAY_HOST)).toBe(SSH_GATEWAY_HOST)
  })
})

test('allows loopback previews and rejects a different deployed host', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', '::1', PICKLE_PUBLIC_HOST]) {
    expect(canMountConsole(hostname)).toBe(true)
  }
  expect(canMountConsole('unrelated.example.com')).toBe(false)
  expect(canMountConsole(PICKLE_DEPLOY_TARGET === 'production' ? 'pickle.pnuops.com' : 'pickle.pusan.ac.kr')).toBe(false)
})
