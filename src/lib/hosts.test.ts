import { describe, expect, test } from 'vitest'
import { LLM_API_BASE_URL } from './llm-api'
import { displaySshGatewayHost, SSH_GATEWAY_HOST } from './hosts'

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
