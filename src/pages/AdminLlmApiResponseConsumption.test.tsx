import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import type { AdminBulkChangePreview, AdminLlmAccountUsage, AdminLlmKeyDetail } from '../api/queries'
import accountPage from '../test/fixtures/llm-account-usage-paged.json'
import singleUnavailable from '../test/fixtures/llm-limits-unavailable.json'
import bulkUnavailable from '../test/fixtures/llm-bulk-impact-unavailable.json'
import multi from '../test/fixtures/llm-bulk-multi-account.json'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

test('the captured account rollup page retains whole-summary counts and the reported query size', async () => {
  expect(accountPage.sort).toBe('REQUESTS_DESC')
  const response: AdminLlmAccountUsage = { ...accountPage, sort: 'REQUESTS_DESC' }
  let query: URLSearchParams | undefined
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/llm/accounts/:accountId/usage', ({ request }) => { query = new URL(request.url).searchParams; return HttpResponse.json(response) }))
  renderApp(`/admin/llm/accounts/${uuid(410)}?org=${uuid(1)}&days=7&size=1&sort=REQUESTS_DESC`)
  const table = await screen.findByRole('table', { name: '키별 쓰임새' })
  expect(within(table).getAllByRole('row')).toHaveLength(2)
  expect(within(table).getByText('higher requests')).toBeInTheDocument()
  expect(screen.getByText('쓰인 키', { selector: 'dt' }).parentElement).toHaveTextContent('2개')
  expect(screen.getByText('요청', { selector: 'dt' }).parentElement).toHaveTextContent('10건')
  expect(query!.get('size')).toBe('1')
  expect(query!.get('sort')).toBe('REQUESTS_DESC')
  expect(screen.getByText(/2026-10-21.*2026-10-27/)).toBeInTheDocument()
})

test('the captured first-binding proposal keeps a missing account impact separate from an editable key draft', async () => {
  const response: AdminLlmKeyDetail = { ...singleUnavailable, status: 'ACTIVE', limitsProjection: {
    ...singleUnavailable.limitsProjection, accountImpact: { ...singleUnavailable.limitsProjection.accountImpact, state: 'NOT_PROVIDED' },
  } }
  let proposedAccount: string | null = null
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/llm/keys/:keyId', ({ request }) => {
      const query = new URL(request.url).searchParams
      if (query.has('projectLimits')) proposedAccount = query.get('proposedOpenrouterAccountId')
      return HttpResponse.json(query.has('projectLimits') ? response : { ...response, limitsProjection: null })
    }))
  renderApp(`/admin/llm/keys/${response.id}`)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '한도 변경' }))
  const modal = within(screen.getByRole('dialog'))
  await user.clear(modal.getByLabelText('금액 한도 (USD)'))
  await user.type(modal.getByLabelText('금액 한도 (USD)'), '5')
  await modal.findByText(/계정별 배정 영향이 제공되지 않습니다/)
  expect(proposedAccount).toBe(response.limitsProjection!.draft.openrouterAccountId)
  expect(modal.getByRole('button', { name: '저장' })).not.toBeDisabled()
  expect(modal.queryByText('관측 잔액')).not.toBeInTheDocument()
})

test('the captured unavailable bulk impact does not fabricate a zero account comparison', async () => {
  const preview: AdminBulkChangePreview = { ...bulkUnavailable, targetType: 'LLM_KEY',
    change: { ...bulkUnavailable.change, kind: 'LLM_KEY_LIMITS' }, accountImpact: { ...bulkUnavailable.accountImpact, state: 'NOT_PROVIDED' } }
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/bulk-changes/previews/:previewId', () => HttpResponse.json(preview)))
  renderApp(`/admin/bulk/llm-keys?previewId=${preview.previewId}`)
  await screen.findByText(/계정별 배정 영향이 제공되지 않습니다/)
  expect(screen.queryByText('관측 잔액')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '계정별 배정 영향' })).not.toBeInTheDocument()
})

test('the captured multi-account preview displays the whole-change server values and independent unreported quality', async () => {
  expect(multi.accountImpact.accounts.every((row) => row.quality.creditsFreshness === 'FRESH' && row.quality.keyMetersFreshness === 'UNKNOWN')).toBe(true)
  expect(multi.items.every((row) => row.reason == null || row.reason === 'INVALID_STATE')).toBe(true)
  const preview: AdminBulkChangePreview = { ...multi, targetType: 'LLM_KEY', change: { ...multi.change, kind: 'LLM_KEY_LIMITS' },
    items: multi.items.map((row) => ({ ...row, reason: row.reason == null ? null : 'INVALID_STATE' })),
    accountImpact: { ...multi.accountImpact, state: 'AVAILABLE', accounts: multi.accountImpact.accounts.map((row) => ({
      ...row, quality: { ...row.quality, creditsFreshness: 'FRESH', keyMetersFreshness: 'UNKNOWN' },
    })) } }
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/bulk-changes/previews/:previewId', () => HttpResponse.json(preview)))
  renderApp(`/admin/bulk/llm-keys?previewId=${preview.previewId}`)
  await screen.findByText('$4.00 → $5.00')
  expect(screen.getByText('$13.00 → $16.00')).toBeInTheDocument()
  expect(screen.getByText('whole change first · 변경 대상 2개')).toBeInTheDocument()
  expect(screen.getByText('whole change second · 변경 대상 1개')).toBeInTheDocument()
  expect(screen.getAllByText('초과 배정')).toHaveLength(2)
  expect(screen.getByText(/미보고 키에는 해당 한도 전액을 대입했습니다/)).toBeInTheDocument()
  expect(screen.getByText('second unchanged')).toBeInTheDocument()
  expect(screen.getByText('revoked target')).toBeInTheDocument()
})
