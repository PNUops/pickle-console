import { describe, expect, test } from 'vitest'
import cases from './credit-model-policy-cases.json'
import { creditModelsError } from './credit-model-allowlist'
import { isCreditModelUsable, matchesCreditModel } from './credit-model-match'

describe('paid model policy parity', () => {
  test.each(cases.patternCases)('$pattern against $name', ({ pattern, name, expected }) => {
    expect(matchesCreditModel(pattern, name)).toBe(expected)
  })
  test.each(cases.policyCases)('policy for $name: $expected', ({ allowed, denied, name, expected }) => {
    expect(isCreditModelUsable(name, allowed, denied)).toBe(expected)
  })
  test.each(cases.validPatterns)('accepts %s', (pattern) => {
    expect(creditModelsError([pattern], 'ALLOW')).toBeNull()
    expect(creditModelsError([pattern], 'DENY')).toBeNull()
  })
  test.each(cases.invalidPatterns)('refuses %s', (pattern) => {
    expect(creditModelsError([pattern], 'ALLOW')).not.toBeNull()
    expect(creditModelsError([pattern], 'DENY')).not.toBeNull()
  })
})
