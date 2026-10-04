import { expect, test } from 'vitest'
import { requestRecipientStatusLabel } from './request-recipient-status'

test('queued recipient labels distinguish submitted targets from an approved creation queue', () => {
  expect(requestRecipientStatusLabel('SUBMITTED', 'QUEUED', true)).toBe('승인 대기')
  expect(requestRecipientStatusLabel('APPROVED', 'QUEUED', true)).toBe('생성 대기')
  expect(requestRecipientStatusLabel('CANCELED', 'QUEUED', true)).toBe('생성 미접수')
  expect(requestRecipientStatusLabel('REJECTED', 'QUEUED', true)).toBe('생성 미접수')
  expect(requestRecipientStatusLabel('APPROVED', 'CREATED', true)).toBe('자원 등록됨')
})
