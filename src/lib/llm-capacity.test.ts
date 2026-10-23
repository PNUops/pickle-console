import { expect, test } from 'vitest'
import { capacityReturn, capacityState, capacityWindow } from './llm-capacity'

const fallback = capacityWindow(86400, Date.parse('2026-10-21T00:00:15Z'))

test('anchors presets and canonicalizes explicit instants without changing the window', () => {
  expect(fallback).toEqual({ from: '2026-10-20T00:00:00.000Z', to: '2026-10-21T00:00:00.000Z' })
  expect(capacityState(new URLSearchParams('from=2026-10-20T09:00:00%2B09:00&to=2026-10-21T00:00:00Z&group=KEY&page=2'), fallback).query)
    .toMatchObject({ ...fallback, group: 'KEY', page: 2 })
})

test('rejects invalid windows and identifiers instead of dropping the restrictive filter', () => {
  for (const params of ['from=bad', 'to=2026-10-20T00:00:00Z', 'workspaceId=unknown', 'upstreamId=unknown', 'group=anything', 'bucketSeconds=0', 'errorTypeMissing=other', 'errorTypeMissing=true&errorType=quota_exhausted', 'reasonCategory=unknown']) {
    expect(capacityState(new URLSearchParams(params), fallback).error).toBeTruthy()
  }
})

test('accepts only scoped comparison return URLs and preserves exact query context', () => {
  const path = '/admin/llm/status?tab=metrics&view=capacity&from=2026-10-20T00:00:00Z&to=2026-10-21T00:00:00Z&errorType=quota_exhausted&reasonCategory=USER_QUOTA&group=KEY&page=2'
  expect(capacityReturn(path, undefined, true)).toBe(`/admin/llm/status?${new URLSearchParams(path.split('?')[1])}`)
  expect(capacityReturn('//other.invalid', undefined, true)).toBeNull()
  expect(capacityReturn(path.replace('view=capacity', 'view=other'), undefined, true)).toBeNull()
  expect(capacityReturn(path, '00000000-0000-4000-8000-000000000001', false)).toBeNull()
})
