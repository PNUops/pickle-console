import { describe, expect, test } from 'vitest'
import {
  appendCreditModelRule,
  creditModelFieldErrors,
  creditModelRulesError,
  formatCreditModelRules,
  parseCreditModelRules,
} from './credit-model-allowlist'

describe('signed paid-model rules', () => {
  test('parses a single paste, normalizes values and deduplicates each direction', () => {
    expect(parseCreditModelRules(' + OpenAI/* \r\n-*/*-Pro\n+openai/*\n-openai/*\n\n'))
      .toEqual({ allowed: ['openai/*'], denied: ['*/*-pro', 'openai/*'], errors: [] })
  })

  test('formats both stored lists into one pasteable value', () => {
    const text = formatCreditModelRules(['openai/*', '~anthropic/*'], ['*/*-pro'])
    expect(text).toBe('+openai/*\n+~anthropic/*\n-*/*-pro')
    expect(parseCreditModelRules(text)).toEqual({
      allowed: ['openai/*', '~anthropic/*'], denied: ['*/*-pro'], errors: [],
    })
  })

  test.each(['openai/*', '+', '-', '++openai/*', '--openai/*', '+openai/*,-google/*', '# comment'])('reports the original line for invalid input %s', (input) => {
      const result = parseCreditModelRules(`\n+openai/*\n${input}`)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].line).toBe(3)
      expect(creditModelRulesError(result)).toContain('3행:')
    })

  test('enforces separate limits after deduplication and excludes the sign from byte limits', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `vendor/model-${i}`)
    const text = formatCreditModelRules(fifty, fifty)
    expect(parseCreditModelRules(`${text}\n+vendor/model-0`)).toMatchObject({ errors: [] })
    expect(parseCreditModelRules(`${text}\n+vendor/extra`).errors[0]).toMatchObject({ line: 101 })
    expect(parseCreditModelRules(`+${'a'.repeat(200)}`).errors).toHaveLength(0)
    expect(parseCreditModelRules(`-${'a'.repeat(201)}`).errors[0].message).toContain('200바이트')
  })

  test('preserves invalid and unfinished raw lines when adding a picker choice', () => {
    const raw = '+OpenAI/*\n-invalid*value\n+'
    expect(appendCreditModelRule(raw, 'Google/*', 'DENY')).toBe(`${raw}\n-google/*`)
    expect(appendCreditModelRule(raw, 'openai/*', 'ALLOW')).toBe(raw)
    expect(appendCreditModelRule(raw, 'openai/*', 'DENY')).toBe(`${raw}\n-openai/*`)
  })

  test('empty text removes both restrictions', () => {
    expect(parseCreditModelRules(' \r\n')).toEqual({ allowed: [], denied: [], errors: [] })
  })
})


test('collects root and indexed errors without hiding distinct messages', () => {
  expect(creditModelFieldErrors({
    creditAllowedModels: '허용 오류',
    'creditAllowedModels[0]': '첫 허용 항목 오류',
    'creditDeniedModels[0]': '차단 오류',
    'creditDeniedModels[1]': '차단 오류',
    otherField: '다른 오류',
    creditAllowedModelsOther: '다른 오류',
  }, 'creditAllowedModels', 'creditDeniedModels')).toBe('허용 오류 첫 허용 항목 오류 차단 오류')
})
