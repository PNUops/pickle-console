import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import type { ApproveRequest, RequestDetail } from '../api/queries'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { orgAdminProfile, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { approvalContextFixture } from '../test/msw/handlers/admin'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { renderApp } from '../test/render'

function prepare(splitBudget = false) {
  const context = mockInstitutionAuthority(orgAdminProfile)
  context.accountRole = 'ORG_MANAGER'
  context.authorityFingerprint = `synthetic-free-decision:${splitBudget}`
  context.assignments[0].permission = { mode: 'SELECTED', revision: 15, work: ['llm.request.decide'], scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(12)] } } }
  if (splitBudget) context.assignments.push({ institutionId: uuid(2), institutionName: 'Synthetic other institution', permission: { mode: 'SELECTED', revision: 7, work: ['llm.key.budget'], scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(12)] } } } })
  AUTHORITY_OVERRIDES[orgAdminProfile.id] = context
  const detail: RequestDetail = { id: uuid(301), orgId: uuid(1), orgName: 'Synthetic institution', workspaceId: uuid(12), workspaceName: 'Synthetic workspace',
    requesterId: uuid(42), requesterName: 'Synthetic requester', type: 'LLM_API_KEY', purpose: 'Synthetic approval', displayName: 'Synthetic key',
    status: 'SUBMITTED', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z', recipients: [], allowedWorkIds: ['llm.request.decide'],
    llmKey: { grantedCreditAllowedModels: [], grantedCreditDeniedModels: [], grantedPassthroughEndpoints: [], reqCreditLimit: 1, reqPassthroughEndpoints: ['chat', 'images'], useCampusModels: true, useCommercialModels: true } }
  const review = approvalContextFixture(uuid(201))
  review.type = 'LLM_API_KEY'; review.vm = null; review.llmKey = { applicantKeys: [], workspaceKeys: [], accountReferences: null }
  const approved: ApproveRequest[] = []
  let accountReads = 0
  server.use(refreshSuccessHandler('access-org-admin'),
    http.get('*/api/v1/admin/requests/:requestId', () => HttpResponse.json(detail)),
    http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json(review)),
    http.get('*/api/v1/admin/llm/accounts', () => { accountReads++; return new HttpResponse(null, { status: 403 }) }),
    http.post('*/api/v1/admin/requests/:requestId/approve', async ({ request }) => { approved.push(await request.json() as ApproveRequest); return HttpResponse.json({ ...detail, status: 'APPROVED' }) }))
  renderApp(`/admin/requests/${detail.id}`)
  return { approved, accountReads: () => accountReads }
}

test.each([false, true])('a decision without the same-source budget explicitly closes every paid axis before approval (split budget: %s)', async (splitBudget) => {
  const result = prepare(splitBudget)
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: '신청 상세' })
  expect(screen.getByLabelText('부여 금액 한도 (USD)')).toHaveValue(1)
  await user.click(screen.getByRole('button', { name: '승인하기' }))
  expect(screen.queryByRole('dialog', { name: '신청 승인' })).not.toBeInTheDocument()
  expect(result.approved).toHaveLength(0)
  await user.click(screen.getByRole('checkbox', { name: '유료 기능 없이 승인' }))
  expect(screen.getByLabelText('부여 금액 한도 (USD)')).toHaveValue(0)
  await user.click(screen.getByRole('button', { name: '승인하기' }))
  const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
  await user.click(within(dialog).getByRole('button', { name: '승인 확정' }))
  await waitFor(() => expect(result.approved).toHaveLength(1))
  expect(result.approved[0].llmKey).toMatchObject({ grantedCreditLimit: 0, grantedCreditLimitReset: null, openrouterAccountId: null,
    grantedCreditAllowedModels: [], grantedCreditDeniedModels: [], grantedPassthroughEndpoints: ['chat'] })
  expect(result.accountReads()).toBe(0)
})
