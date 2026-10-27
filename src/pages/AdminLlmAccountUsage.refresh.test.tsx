import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import type { AdminLlmAccountUsage } from '../api/queries'
import { problemResponse, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { accountUsageFixture } from '../test/account-usage-fixture'

function usage(days: number, keyName: string): AdminLlmAccountUsage {
  return accountUsageFixture({
    from: days === 7 ? '2026-09-24' : '2026-09-01', to: '2026-09-30',
    attributedCostUsd: 0.25, requests: 1, pricedRequests: 1, keysUsed: 1, keysLinked: 1,
    points: [{ day: '2026-09-30', attributedCostUsd: 0.25, pricedRequests: 1, requests: 1 }],
    keys: [{ keyId: uuid(171), keyName, requests: 1, inputTokens: 3, outputTokens: 2,
      attributedCostUsd: 0.25, pricedRequests: 1 }],
  })
}

function failed() {
  return problemResponse({ type: 'about:blank', title: '조회 실패', status: 503,
    code: 'SERVICE_UNAVAILABLE', detail: '합성 계정 조회 실패' })
}

function section() {
  return within(screen.getByRole('heading', { name: '쓰임새' }).closest('section')!)
}

function getMoment() {
  return section().getByText('콘솔 마지막 GET 성공').parentElement!.textContent
}

test('retry keeps the selected account period and replaces the old response only after success', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T00:00:00Z'))
  const user = userEvent.setup()
  const requests: number[] = []
  let sevenAttempts = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/llm/accounts/:accountId/usage', ({ request }) => {
      const days = Number(new URL(request.url).searchParams.get('days'))
      requests.push(days)
      if (days === 7 && ++sevenAttempts === 1) return failed()
      return HttpResponse.json(usage(days, days === 7 ? 'Synthetic retried consumer' : 'Synthetic first consumer'))
    }))
  try {
    renderApp(`/admin/llm/accounts/${uuid(410)}?org=${uuid(1)}`)
    await screen.findByText('Synthetic first consumer')
    expect(getMoment()).toContain('09:00:00')
    await user.click(section().getByRole('button', { name: '7일' }))
    await section().findByText('합성 계정 조회 실패')
    expect(section().getByText('Synthetic first consumer')).toBeInTheDocument()
    expect(section().getByText(/2026-09-01.*2026-09-30/)).toBeInTheDocument()
    expect(getMoment()).toContain('09:00:00')
    vi.setSystemTime(new Date('2026-09-30T00:10:00Z'))
    await user.click(section().getByRole('button', { name: '다시 조회' }))
    await section().findByText('Synthetic retried consumer')
    expect(requests).toEqual([30, 7, 7])
    expect(section().getByRole('button', { name: '7일' })).toHaveAttribute('aria-pressed', 'true')
    expect(section().getByText(/2026-09-24.*2026-09-30/)).toBeInTheDocument()
    expect(section().queryByText('Synthetic first consumer')).not.toBeInTheDocument()
    expect(section().queryByText(/이전 조회 결과입니다/)).not.toBeInTheDocument()
    expect(getMoment()).toContain('09:10:00')
  } finally {
    vi.useRealTimers()
  }
})

test('a failed same-window refresh keeps the successful GET moment and exposes the failure', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T00:00:00Z'))
  const user = userEvent.setup()
  let requests = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/llm/accounts/:accountId/usage', () => {
      requests += 1
      return requests === 1 ? HttpResponse.json(usage(30, 'Synthetic cached consumer')) : failed()
    }))
  try {
    renderApp(`/admin/llm/accounts/${uuid(410)}?org=${uuid(1)}`)
    await screen.findByText('Synthetic cached consumer')
    expect(getMoment()).toContain('09:00:00')
    vi.setSystemTime(new Date('2026-09-30T00:20:00Z'))
    await user.click(section().getByRole('button', { name: '다시 조회' }))
    await section().findByText('합성 계정 조회 실패')
    await waitFor(() => expect(requests).toBe(2))
    expect(section().getByText('Synthetic cached consumer')).toBeInTheDocument()
    expect(section().getByText(/2026-09-01.*2026-09-30/)).toBeInTheDocument()
    expect(getMoment()).toContain('09:00:00')
    expect(getMoment()).not.toContain('09:20:00')
  } finally {
    vi.useRealTimers()
  }
})

test('the explicit browser fixture rejects the new period while preserving the successful response and recovery controls', async () => {
  const original = window.location.href
  window.history.replaceState(null, '', '/?accountFixture=window-failure')
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  const user = userEvent.setup()
  try {
    renderApp(`/admin/llm/accounts/${uuid(410)}?org=${uuid(1)}`)
    await screen.findByRole('table', { name: '키별 쓰임새' })
    await user.click(section().getByRole('button', { name: '7일' }))
    await section().findByText('선택한 7일 기간을 조회하지 못했습니다.')
    expect(section().getByText(/2026-08-02.*2026-08-31/)).toBeInTheDocument()
    expect(section().getByRole('button', { name: '다시 조회' })).not.toBeDisabled()
    await user.click(section().getByRole('button', { name: '30일' }))
    await waitFor(() => expect(section().queryByText('선택한 7일 기간을 조회하지 못했습니다.')).not.toBeInTheDocument())
    expect(section().getByRole('table', { name: '키별 쓰임새' })).toBeInTheDocument()
  } finally { window.history.replaceState(null, '', original) }
})
