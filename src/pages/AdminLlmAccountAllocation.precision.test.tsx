import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { KeyCreditObservation } from '../components/OpenRouterCredits'
import { adminLlmKeyStore, adminLlmProjectionFixtures, adminLlmProjectionQueries, limitsProjectionFixtureKey } from '../test/msw/handlers/llm-keys'
import { openRouterAccountStore } from '../test/msw/handlers/openrouter-accounts'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { mappedLimitsProjection } from '../test/llm-projection-fixture'
import { capturedAccountStates, projectionBasisKey } from '../test/msw/projection-fixtures'

test('a reported tiny positive key amount is not presented as an observed zero', () => {
  render(<KeyCreditObservation llmKey={{ creditUsage: 5e-8, creditLimitRemaining: 0,
    creditUsageAt: '2026-09-30T12:00:00Z' }} />)
  expect(screen.getByText(/^Limit window 사용 /).textContent).not.toMatch(/\$0(?:\.0+)?$/)
  expect(screen.getByText(/^잔여 한도 /)).toHaveTextContent('$0.00')
})

test('a reported zero key amount remains zero', () => {
  render(<KeyCreditObservation llmKey={{ creditUsage: 0, creditLimitRemaining: null,
    creditUsageAt: '2026-09-30T12:00:00Z' }} />)
  expect(screen.getByText(/^Limit window 사용 /)).toHaveTextContent('$0.00')
  expect(screen.getByText(/^잔여 한도 /)).toHaveTextContent('확인 전')
})

test('replacing a spent sole key limit does not create a false account over-allocation warning', async () => {
  const user = userEvent.setup()
  const key = adminLlmKeyStore.find((row) => row.id === uuid(171))!
  Object.assign(key, { creditLimit: 10, creditLimitReset: null, creditUsage: 5, creditLimitRemaining: 5 })
  adminLlmKeyStore.splice(0, adminLlmKeyStore.length, ...adminLlmKeyStore.filter((row) => row.id === key.id || row.openrouterAccountId !== uuid(410)))
  const account = openRouterAccountStore.find((row) => row.id === uuid(410))!
  account.boundKeyCount = 1
  account.allocation = { ...account.allocation, committedCreditLimit: 10,
    committedTotalCap: 10, committedDaily: 0, committedWeekly: 0, committedMonthly: 0,
    committedKeyCount: 1, remainingCommitment: 5, committedUsage: 5,
    awaitingProvisionKeyCount: 0, usageUnreportedKeyCount: 0 }
  account.credits = { ...account.credits, totalCredits: 22, totalUsage: 5, balance: 17 }
  const query = new URLSearchParams({ proposedCreditLimit: '20', proposedCreditLimitResetSet: 'false' })
  const snapshot = mappedLimitsProjection(account.id, account.name)
  const basis = adminLlmKeyStore.filter((row) => row.openrouterAccountId === account.id)
  capturedAccountStates.set(account.id, { beforeKey: projectionBasisKey(basis),
    afterKey: projectionBasisKey(basis.map((row) => row.id === key.id ? { ...row, creditLimit: 20 } : row)),
    before: snapshot.accountImpact.accounts![0].before, after: snapshot.accountImpact.accounts![0].after })
  adminLlmProjectionFixtures.set(limitsProjectionFixtureKey(key.id, query), snapshot)
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`/admin/llm/keys/${key.id}?org=${uuid(1)}`)
  await user.click(await screen.findByRole('button', { name: '한도 변경' }))
  const modal = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
  await user.clear(modal.getByLabelText('금액 한도 (USD)'))
  await user.type(modal.getByLabelText('금액 한도 (USD)'), '20')
  expect(modal.getByLabelText('금액 한도 (USD)')).toHaveDisplayValue('20')
  await waitFor(() => expect(adminLlmProjectionQueries.some((value) => new URLSearchParams(value).get('proposedCreditLimit') === '20')).toBe(true))
  await modal.findByText('$5.00 → $15.00')
  // With one key and a known current-window usage of five, a limit of twenty
  // leaves fifteen payable dollars, below the observed account balance of seventeen.
  expect(modal.queryByText('초과 배정')).not.toBeInTheDocument()
})
