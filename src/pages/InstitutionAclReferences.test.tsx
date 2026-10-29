import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, test, vi } from 'vitest'
import { orgAdminProfile, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { externalDomains } from '../test/msw/handlers/publishing'
import { vmStore } from '../test/msw/handlers/vms'
import { adminLlmKeyStore } from '../test/msw/handlers/llm-keys'
import { gpuAllocationFixture } from '../test/msw/handlers/gpu'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { renderApp } from '../test/render'

afterEach(() => vi.unstubAllEnvs())

test.each([
  ['DOMAIN', 'allowed'], ['DOMAIN', 'other workspace'], ['DOMAIN', 'metadata only'],
  ['GPU', 'allowed'], ['GPU', 'other workspace'], ['GPU', 'metadata only'],
] as const)('the %s ACL reference binds the actual target under %s authority', async (kind, mode) => {
  vi.stubEnv('VITE_GPU_PREVIEW', '1')
  const prefix = kind.toLowerCase()
  const work = mode === 'metadata only' ? `${prefix}.metadata.support.read` : `${prefix}.acl.support.read`
  const context = mockInstitutionAuthority(orgAdminProfile)
  context.accountRole = 'ORG_MANAGER'
  context.authorityFingerprint = `synthetic-acl-reference:${kind}:${mode}`
  context.assignments[0].permission = { mode: 'SELECTED', work: [work], revision: 16, scopes: {
    [kind]: { mode: 'LISTED', workspaceIds: [mode === 'other workspace' ? uuid(15) : uuid(12)] },
  } }
  AUTHORITY_OVERRIDES[orgAdminProfile.id] = context
  server.use(refreshSuccessHandler('access-org-admin'))
  if (kind === 'DOMAIN') {
    const row = { ...externalDomains[0], orgId: uuid(2), workspaceId: uuid(12), metadataVisible: false, allowedWorkIds: ['domain.acl.support.read'] }
    server.use(http.get('*/api/v1/admin/domains', () => HttpResponse.json({ content: [row], page: 0, size: 20, totalElements: 1, totalPages: 1 })))
    renderApp('/admin/domains')
    await screen.findByRole('button', { name: row.fqdn })
  } else {
    const row = gpuAllocationFixture({ orgId: uuid(2), workspaceId: uuid(12), metadataVisible: false, allowedWorkIds: ['gpu.acl.support.read'] })
    server.use(http.get('*/api/v1/admin/gpu-allocations/:allocationId', () => HttpResponse.json(row)))
    renderApp(`/admin/gpus/${row.id}`)
    await screen.findByRole('heading', { name: row.name })
  }
  if (mode === 'allowed') expect(screen.getByRole('link', { name: '접근 권한' })).toHaveAttribute('href', expect.stringContaining(`/admin/resource-access/${kind}/`))
  else expect(screen.queryByRole('link', { name: '접근 권한' })).not.toBeInTheDocument()
})

test.each(['VM', 'LLM_API_KEY'] as const)('a current %s ACL source still respects the resource row refusal', async (kind) => {
  const prefix = kind === 'VM' ? 'vm' : 'llm'
  const group = kind === 'VM' ? 'VM' : 'LLM'
  const context = mockInstitutionAuthority(orgAdminProfile)
  context.accountRole = 'ORG_MANAGER'
  context.authorityFingerprint = `synthetic-acl-server-refusal:${kind}`
  context.assignments[0].permission = { mode: 'SELECTED', work: [`${prefix}.acl.support.read`], revision: 18, scopes: { [group]: { mode: 'LISTED', workspaceIds: [uuid(12)] } } }
  AUTHORITY_OVERRIDES[orgAdminProfile.id] = context
  server.use(refreshSuccessHandler('access-org-admin'))
  if (kind === 'VM') {
    const row = { ...vmStore.find((vm) => vm.id === uuid(57))!, metadataVisible: true, allowedWorkIds: ['vm.metadata.support.read'] }
    server.use(http.get('*/api/v1/admin/vms/:vmId', () => HttpResponse.json(row)))
    renderApp(`/admin/vms/${row.id}`)
    await screen.findByRole('heading', { name: row.displayName || row.name })
  } else {
    const row = { ...adminLlmKeyStore[1], metadataVisible: true, observationVisible: false, financeVisible: false, tokenReferenceVisible: false, budgetReferenceVisible: false, allowedWorkIds: ['llm.metadata.support.read'] }
    server.use(http.get('*/api/v1/admin/llm/keys/:keyId', () => HttpResponse.json(row)))
    renderApp(`/admin/llm/keys/${row.id}`)
    await screen.findByRole('heading', { name: row.name })
  }
  expect(screen.queryByRole('link', { name: '접근 권한' })).not.toBeInTheDocument()
})
