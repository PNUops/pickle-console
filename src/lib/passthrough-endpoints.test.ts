import { describe, expect, test } from 'vitest'
import {
  PASSTHROUGH_ENDPOINTS,
  grantPayload,
  holdsChatChildren,
  passthroughText,
  requestedFeaturesText,
  togglePassthrough,
  type PassthroughEndpoint,
} from './passthrough-endpoints'

describe('feature grants', () => {
  test('offers only the grantable names, files never', () => {
    expect(PASSTHROUGH_ENDPOINTS).toEqual([
      'chat',
      'web_search',
      'pdf_ocr',
      'images',
      'embeddings',
      'rerank',
    ])
  })

  test('keeps the order of the table, not of the clicks', () => {
    expect(togglePassthrough(['images'], 'chat', true)).toEqual(['chat', 'images'])
  })

  test('drops the children when Chat is turned off', () => {
    expect(togglePassthrough(['chat', 'web_search', 'pdf_ocr', 'images'], 'chat', false)).toEqual([
      'images',
    ])
  })

  test('never sends files, which the api derives', () => {
    expect(togglePassthrough(['chat', 'containers', 'batches', 'files'], 'batches', false)).toEqual([
      'chat',
      'containers',
    ])
    expect(grantPayload(['chat', 'batches', 'files'])).toEqual(['chat', 'batches'])
  })

  test('a flat toggle lists names without the hierarchy', () => {
    expect(togglePassthrough([], 'web_search', true, { flat: true })).toEqual(['web_search'])
    expect(togglePassthrough(['chat', 'web_search'], 'chat', false, { flat: true })).toEqual([
      'web_search',
    ])
  })

  test('knows a feature only by its own name', () => {
    expect(passthroughText(['constructor'])).toBe('constructor')
    const stored = ['constructor'] as unknown as PassthroughEndpoint[]
    expect(togglePassthrough(stored, 'chat', true)).toEqual(['chat', 'constructor'])
  })

  test('tells when a grant holds a feature under Chat', () => {
    expect(holdsChatChildren(['chat', 'images'])).toBe(false)
    expect(holdsChatChildren(['chat', 'pdf_ocr'])).toBe(true)
  })

  // The types describe the contract this build was generated from, not the
  // server. A whole-list save must not revoke a name this build cannot draw.
  test('keeps a name it does not know', () => {
    const stored = ['images', 'future_feature'] as unknown as PassthroughEndpoint[]
    expect(togglePassthrough(stored, 'chat', true)).toEqual(['chat', 'images', 'future_feature'])
    expect(togglePassthrough(stored, 'images', false)).toEqual(['future_feature'])
  })

  test('says what an empty grant and an empty request mean, differently', () => {
    expect(passthroughText([])).toBe('부여 안 됨')
    expect(requestedFeaturesText([])).toBe('선택 안 함')
    expect(passthroughText(['chat', 'web_search', 'future_feature'])).toBe('Chat, 웹 검색, future_feature')
  })
})
