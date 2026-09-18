import { afterEach, describe, expect, test, vi } from 'vitest'
import { vmNetworkPolicyEnabled } from './vm-network-policy'

afterEach(() => vi.unstubAllEnvs())

describe('VM network policy feature flag', () => {
  test('is off unless the build opts in with exactly 1', () => {
    vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', '')
    expect(vmNetworkPolicyEnabled()).toBe(false)
    vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', 'true')
    expect(vmNetworkPolicyEnabled()).toBe(false)
    vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', '1')
    expect(vmNetworkPolicyEnabled()).toBe(true)
  })
})
