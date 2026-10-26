import { expect, test } from 'vitest'
import { capacityReturn, capacityState, capacityWindow } from './llm-capacity'

const sourceId = '00000000-0000-4000-8000-000000000401'
const from = '2026-10-20T00:00:00.125Z'
const to = '2026-10-21T00:00:00.875Z'

test('preserves the exact telemetry source independently of demand filters', () => {
  const params = new URLSearchParams({ from, to, telemetrySourceId: sourceId,
    publicModelName: 'example/model', errorType: 'server_busy', reasonCategory: 'PROVIDER' })
  const state = capacityState(params, capacityWindow(86400))
  expect(state.error).toBeNull()
  expect(state.query).toMatchObject({ from, to, telemetrySourceId: sourceId,
    publicModelName: 'example/model', errorType: 'server_busy', reasonCategory: 'PROVIDER' })
})

test('rejects a malformed telemetry source instead of broadening the query', () => {
  const state = capacityState(new URLSearchParams({ from, to, telemetrySourceId: 'not-a-source' }), capacityWindow(86400))
  expect(state.error).not.toBeNull()
  expect(state.query).not.toHaveProperty('telemetrySourceId')
})

test('keeps the selected source and millisecond window in a key detail return', () => {
  const query = new URLSearchParams({ tab: 'metrics', view: 'capacity', from, to,
    telemetrySourceId: sourceId, group: 'KEY', page: '2' })
  const returned = capacityReturn(`/admin/llm/status?${query}`, undefined, true)
  expect(returned).not.toBeNull()
  const params = new URL(returned!, 'https://pickle.invalid').searchParams
  expect(params.get('telemetrySourceId')).toBe(sourceId)
  expect(params.get('from')).toBe(from)
  expect(params.get('to')).toBe(to)
  expect(params.get('page')).toBe('2')
})
