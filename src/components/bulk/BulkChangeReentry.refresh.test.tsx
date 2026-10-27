import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { AdminBulkOperation } from '../../api/bulk-results'
import { setAccessToken } from '../../api/token'
import { uuid } from '../../test/msw/ids'
import { server } from '../../test/msw/server'
import { BulkChangeReentry } from './BulkChangeReentry'

test.each(['vms', 'domains', 'llm-keys'] as const)('refreshing an unrelated operation never manually fetches a disabled preview (%s)', async (family) => {
  setAccessToken('access-sys-admin')
  const targetType = family === 'vms' ? 'VM' : family === 'domains' ? 'DOMAIN' : 'LLM_KEY'
  const operation: AdminBulkOperation = { operationId: uuid(777), previewId: uuid(778), committedAt: '2026-10-27T00:00:00Z',
    status: 'COMMITTED', targetType, change: null, effects: [], observations: [],
    result: { batchId: uuid(777), items: [{ targetId: uuid(779), name: 'Synthetic resource', result: 'APPLIED', reason: null, fields: [] }] } }
  let operations = 0, previews = 0
  server.use(http.get('*/api/v1/admin/bulk-changes/operations/:operationId', () => { operations += 1; return HttpResponse.json(operation) }),
    http.get('*/api/v1/admin/bulk-changes/previews/:previewId', () => {
      previews += 1
      return HttpResponse.json({ previewId: uuid(778), targetType, createdAt: operation.committedAt, expiresAt: operation.committedAt, items: [], change: null })
    }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<MemoryRouter><QueryClientProvider client={client}><BulkChangeReentry family={family} operationId={operation.operationId}
    reader="synthetic-reader" canContinue={() => false} onContinue={() => {}} /></QueryClientProvider></MemoryRouter>)
  await userEvent.setup().click(await screen.findByRole('button', { name: '현재 상태 다시 조회' }))
  await waitFor(() => { expect(operations).toBe(2); expect(client.isFetching()).toBe(0) })
  expect(previews).toBe(0)
})
