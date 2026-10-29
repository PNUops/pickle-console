import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import type { AdminBulkOperation } from '../api/bulk-results'
import { bulkProjectionResponse } from '../test/llm-projection-fixture'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function operation(): AdminBulkOperation {
  const preview = bulkProjectionResponse
  return { operationId: uuid(777), previewId: preview.previewId, committedAt: preview.createdAt,
    status: 'COMMITTED', targetType: preview.targetType, change: preview.change,
    result: { batchId: uuid(777), items: preview.items.map((row) => ({ targetId: row.targetId, name: row.name, result: 'APPLIED', reason: null, fields: row.fields })) },
    observations: preview.items.map((row) => ({ targetId: row.targetId, observedAt: preview.createdAt, refusal: null, values: { creditLimit: 20 } })), effects: [] }
}

test('a stored preview displays the captured whole-change snapshot and retains the exact originating key list', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/bulk-changes/previews/:previewId', () => HttpResponse.json(bulkProjectionResponse)))
  const origin = `/admin/llm/keys?org=${uuid(1)}&cohort=COMMITTED&sort=NAME_ASC&page=1`
  renderApp(`/admin/bulk/llm-keys?org=${uuid(1)}&previewId=${bulkProjectionResponse.previewId}&returnTo=${encodeURIComponent(origin)}`)
  await screen.findByText('$5.00 → $15.00')
  expect(screen.getByRole('link', { name: '← LLM API 키' })).toHaveAttribute('href', origin)
  expect(screen.queryByText('초과 배정')).not.toBeInTheDocument()
})

test.each(['not-provided', 'failed'] as const)('operation reentry reads its actual preview and clears old account facts through refresh (%s)', async (outcome) => {
  const stored = operation()
  let held = false
  let masked = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const reads: string[] = []
  let writes = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/bulk-changes/operations/:operationId', () => HttpResponse.json(stored)),
    http.get('*/api/v1/admin/bulk-changes/previews/:previewId', async ({ params }) => {
      reads.push(String(params.previewId))
      if (String(params.previewId) !== stored.previewId) return new HttpResponse(null, { status: 404 })
      if (masked) { held = true; await gate; if (outcome === 'failed') return new HttpResponse(null, { status: 503 }) }
      return HttpResponse.json(masked ? { ...bulkProjectionResponse, consumedOperationId: stored.operationId,
        accountImpact: { state: 'NOT_PROVIDED', observedAt: stored.committedAt, accounts: null, basisFingerprint: null } }
        : { ...bulkProjectionResponse, consumedOperationId: stored.operationId })
    }),
    http.post('*/api/v1/admin/bulk-changes', () => { writes += 1; return new HttpResponse(null, { status: 500 }) }))
  const origin = `/admin/llm/keys?org=${uuid(1)}&cohort=COMMITTED&page=1`
  renderApp(`/admin/bulk/llm-keys?org=${uuid(1)}&operationId=${stored.operationId}&previewId=${uuid(666)}&returnTo=${encodeURIComponent(origin)}`)
  await screen.findByText('$5.00 → $15.00')
  expect(reads).toContain(stored.previewId)
  expect(reads).not.toContain(uuid(666))
  expect(screen.getByRole('link', { name: '← LLM API 키' })).toHaveAttribute('href', origin)
  masked = true
  try {
    await userEvent.setup().click(screen.getByRole('button', { name: '현재 상태 다시 조회' }))
    await waitFor(() => expect(held).toBe(true))
    expect(screen.queryByText('$5.00 → $15.00')).not.toBeInTheDocument()
    await act(async () => { release(); await gate })
    await screen.findByText(outcome === 'failed' ? /계정 영향 이력을 불러오지 못했습니다/ : /계정별 배정 영향이 제공되지 않습니다/)
    expect(screen.queryByText('same server projection')).not.toBeInTheDocument()
    expect(writes).toBe(0)
  } finally { release() }
})
