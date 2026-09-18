import { afterEach, describe, expect, test, vi } from 'vitest'
import { publicSourcePolicyEnabled } from './public-source-policy'

afterEach(() => vi.unstubAllEnvs())

describe('public source policy feature flag', () => {
  test('is disabled by default and for unknown values', () => {
    vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', '')
    expect(publicSourcePolicyEnabled()).toBe(false)
    vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', 'true')
    expect(publicSourcePolicyEnabled()).toBe(false)
  })

  test('is enabled only by the documented opt-in value', () => {
    vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', '1')
    expect(publicSourcePolicyEnabled()).toBe(true)
  })
})
