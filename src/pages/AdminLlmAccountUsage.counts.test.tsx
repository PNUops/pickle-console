import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import type { AdminLlmAccountUsage } from '../api/queries'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { accountUsageFixture } from '../test/account-usage-fixture'

test.each([
  [Number.MAX_SAFE_INTEGER, 1],
  [Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER],
])('unsafe account counts and invalid token intermediates remain unknown (%s, %s)', async (inputTokens, outputTokens) => {
  const response: AdminLlmAccountUsage = accountUsageFixture({
    from: '2026-09-01', to: '2026-09-30', attributedCostUsd: 5e-8,
    requests: Number.MAX_SAFE_INTEGER + 1, pricedRequests: Number.MAX_SAFE_INTEGER + 1,
    keysUsed: 1.5, keysLinked: 1,
    points: [{ day: '2026-09-30', attributedCostUsd: 5e-8, pricedRequests: 1,
      requests: Number.MAX_SAFE_INTEGER + 1 }],
    keys: [{ keyId: uuid(171), keyName: 'Synthetic unsafe-count consumer',
      requests: Number.MAX_SAFE_INTEGER + 1, inputTokens, outputTokens,
      attributedCostUsd: 5e-8, pricedRequests: 1 }],
  })
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/llm/accounts/:accountId/usage', () => HttpResponse.json(response)))
  renderApp(`/admin/llm/accounts/${uuid(410)}?org=${uuid(1)}`)
  const row = (await screen.findByText('Synthetic unsafe-count consumer')).closest('tr')!
  expect(within(row).getAllByText('정확값 확인 불가')).toHaveLength(2)
  for (const label of ['요청', '쓰인 키']) {
    const tile = screen.getByText(label, { selector: 'dt' }).parentElement!
    expect(within(tile).getByText('정확값 확인 불가')).toBeInTheDocument()
  }
  expect(screen.queryByText(/9,007,199,254,740,992건/)).not.toBeInTheDocument()
})
