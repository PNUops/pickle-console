import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import type { LlmCapacityQuery } from '../api/queries'
import { orgViewerProfile, orgViewerUser, problemResponse, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { llmCapacityFixture } from '../test/msw/handlers/llm-capacity'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { AuthProvider } from '../auth/AuthProvider'
import { useAuth, type AuthContextValue } from '../auth/auth-context'
import { ToastProvider } from '../components/ui'
import App from '../App'

const base = `/admin/llm/status?tab=metrics&view=capacity&org=${uuid(1)}&from=2026-10-20T00:00:00.125Z&to=2026-10-21T00:00:00.125Z`

function capacityHandler(queries: URLSearchParams[], firstFailure = false) {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', ({ request }) => {
    const params = new URL(request.url).searchParams
    queries.push(params)
    if (firstFailure && queries.length === 1) return problemResponse({ status: 503, code: 'UPSTREAM_UNAVAILABLE', title: '합성 조회 실패', detail: '잠시 후 다시 조회해 주세요.' })
    for (const field of ['publicModelName', 'errorType']) {
      const value = params.get(field)
      if (value != null && (/^ *$/.test(value) || value.length > 256)) return problemResponse({
        status: 422, code: 'VALIDATION_FAILED', title: '입력값이 올바르지 않습니다', detail: '요청 값을 확인해 주세요.',
        errors: [{ field, message: '필터는 1~256자의 정확한 값이어야 합니다.' }],
      })
    }
    return HttpResponse.json(llmCapacityFixture({
      from: params.get('from')!, to: params.get('to')!, orgId: params.get('orgId') ?? undefined,
      workspaceId: params.get('workspaceId') ?? undefined, upstreamId: params.get('upstreamId') ?? undefined,
      publicModelName: params.get('publicModelName') ?? undefined,
      errorType: params.get('errorType') ?? undefined, reasonCategory: params.get('reasonCategory') as LlmCapacityQuery['reasonCategory'] ?? undefined,
      group: params.get('group') === 'KEY' ? 'KEY' : params.get('group') === 'ORG' ? 'ORG' : 'WORKSPACE', page: Number(params.get('page') ?? 0),
    }))
  }))
}

test.each([{ label: 'blank', invalid: '   ' }, { label: 'overlong', invalid: 'm'.repeat(257) }])('recovers from a $label model rejection without losing the scope or detail return', async ({ invalid }) => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  capacityHandler(queries)
  renderApp(`${base}&group=KEY&workspaceId=${uuid(12)}&upstreamId=${uuid(302)}&errorType=server_busy&reasonCategory=PROVIDER&publicModelName=campus%2Fstart`)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  await user.clear(screen.getByRole('textbox', { name: '요청한 공개 모델' }))
  await user.type(screen.getByRole('textbox', { name: '요청한 공개 모델' }), invalid)
  await user.click(screen.getByRole('button', { name: '모델 적용' }))
  await screen.findByText(/갱신하지 못했습니다/)
  expect(queries.at(-1)?.get('publicModelName')).toBe(invalid)
  expect(screen.queryByRole('table', { name: '같은 조건의 소비처' })).not.toBeInTheDocument()
  const editor = screen.getByRole('textbox', { name: '요청한 공개 모델' })
  expect(editor).toHaveValue(invalid)
  await user.clear(editor)
  await user.type(editor, 'campus/recovered')
  await user.click(screen.getByRole('button', { name: '모델 적용' }))
  const link = await screen.findByRole('link', { name: 'suspended-admin-key' })
  const params = new URL(currentPath(), 'https://pickle.invalid').searchParams
  expect(params.get('publicModelName')).toBe('campus/recovered')
  expect(params.has('page')).toBe(false)
  for (const [name, value] of Object.entries({ org: uuid(1), from: '2026-10-20T00:00:00.125Z', to: '2026-10-21T00:00:00.125Z', workspaceId: uuid(12), upstreamId: uuid(302), errorType: 'server_busy', reasonCategory: 'PROVIDER', group: 'KEY' })) expect(params.get(name)).toBe(value)
  expect(queries.map((query) => query.get('publicModelName'))).toEqual(['campus/start', invalid, 'campus/recovered'])
  for (const [name, value] of Object.entries({ orgId: uuid(1), from: '2026-10-20T00:00:00.125Z', to: '2026-10-21T00:00:00.125Z', workspaceId: uuid(12), upstreamId: uuid(302), errorType: 'server_busy', reasonCategory: 'PROVIDER', group: 'KEY' })) expect(queries.at(-1)?.get(name)).toBe(value)
  await user.click(link)
  await user.click(await screen.findByRole('link', { name: '← 장비와 수요 비교' }))
  expect(await screen.findByRole('link', { name: 'suspended-admin-key' })).toBeInTheDocument()
  expect([...new URL(currentPath(), 'https://pickle.invalid').searchParams].sort()).toEqual([...params].sort())
})

test.each(['publicModelName', 'errorType'])('clears an initial rejected %s filter only after an explicit reset', async (field) => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  capacityHandler(queries)
  renderApp(`${base}&group=KEY&${field}=${encodeURIComponent('   ')}&page=2`)
  await screen.findByText(/성공한 조회 결과가 없습니다/)
  expect(queries).toHaveLength(1)
  expect(queries[0].get(field)).toBe('   ')
  await user.click(screen.getByRole('button', { name: '조회 필터 초기화' }))
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  const params = new URL(currentPath(), 'https://pickle.invalid').searchParams
  expect(params.has(field)).toBe(false)
  expect(params.has('page')).toBe(false)
  expect(params.get('org')).toBe(uuid(1))
  expect(params.get('from')).toBe('2026-10-20T00:00:00.125Z')
  expect(params.get('to')).toBe('2026-10-21T00:00:00.125Z')
  expect(queries.at(-1)?.has(field)).toBe(false)
})

test.each(['workspaceId=invalid', 'group=invalid', 'bucketSeconds=invalid', 'reasonCategory=invalid'])('recovers an invalid URL filter %s without querying a silently widened scope', async (invalid) => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  capacityHandler(queries)
  renderApp(`${base}&${invalid}&publicModelName=campus%2Fstart&page=2`)
  const reset = await screen.findByRole('button', { name: '조회 필터 초기화' })
  await waitFor(() => expect(reset).toBeEnabled())
  expect(queries).toHaveLength(0)
  await user.click(reset)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  expect(queries).toHaveLength(1)
  const params = new URL(currentPath(), 'https://pickle.invalid').searchParams
  for (const name of ['workspaceId', 'upstreamId', 'publicModelName', 'errorType', 'errorTypeMissing', 'reasonCategory', 'group', 'bucketSeconds', 'page']) expect(params.has(name)).toBe(false)
  expect(params.get('org')).toBe(uuid(1))
  expect(params.get('from')).toBe('2026-10-20T00:00:00.125Z')
  expect(params.get('to')).toBe('2026-10-21T00:00:00.125Z')
})

test('retries a first transport failure with the exact original filter', async () => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  capacityHandler(queries, true)
  renderApp(`${base}&publicModelName=campus%2Fstart`)
  await screen.findByText(/갱신하지 못했습니다/)
  await user.click(screen.getByRole('button', { name: '다시 조회' }))
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  await waitFor(() => expect(queries).toHaveLength(2))
  expect(queries[0].toString()).toBe(queries[1].toString())
})

test('drops an unsubmitted model draft and stale selectors when another institution fails', async () => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', ({ request }) => {
    const params = new URL(request.url).searchParams
    queries.push(params)
    if (params.get('orgId') === uuid(2) && params.has('publicModelName')) return problemResponse({ status: 503, code: 'UPSTREAM_UNAVAILABLE', title: '합성 조회 실패' })
    const fixture = llmCapacityFixture({ orgId: params.get('orgId') ?? undefined, from: params.get('from')!, to: params.get('to')!, group: params.get('group') === 'KEY' ? 'KEY' : 'WORKSPACE' })
    fixture.selectors.workspaces.items[0].name = '이전 기관의 선택 이름'
    return HttpResponse.json(fixture)
  }))
  renderApp(`${base}&publicModelName=campus%2Fstart`)
  await screen.findByRole('combobox', { name: '수요 워크스페이스' })
  const editor = screen.getByRole('textbox', { name: '요청한 공개 모델' })
  await user.clear(editor)
  await user.type(editor, 'unsubmitted/private-draft')
  await user.selectOptions(screen.getByRole('combobox', { name: '관리 기관 선택' }), uuid(2))
  await screen.findByText(/갱신하지 못했습니다/)
  expect(screen.getByRole('textbox', { name: '요청한 공개 모델' })).toHaveValue('campus/start')
  expect(screen.queryByText('이전 기관의 선택 이름')).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: '수요 워크스페이스' })).not.toBeInTheDocument()
  expect(screen.queryByRole('table', { name: '같은 조건의 소비처' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '조회 필터 초기화' }))
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  expect(queries.at(-1)?.get('orgId')).toBe(uuid(2))
  expect(queries.at(-1)?.get('from')).toBe('2026-10-20T00:00:00.125Z')
  expect(queries.at(-1)?.has('publicModelName')).toBe(false)
})

test('resets a draft after a same-role authority revision without exposing old selectors', async () => {
  const user = userEvent.setup()
  const initial = mockInstitutionAuthority(orgViewerProfile)
  initial.authorityFingerprint = 'synthetic-recovery-first'
  initial.assignments[0].permission = { mode: 'SELECTED', work: ['llm.observe'], scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(12)] } }, revision: 40 }
  AUTHORITY_OVERRIDES[orgViewerProfile.id] = initial
  let calls = 0
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/llm/capacity', () => {
    calls++
    if (calls > 1) return problemResponse({ status: 503, code: 'UPSTREAM_UNAVAILABLE', title: '합성 조회 실패' })
    const fixture = llmCapacityFixture({}, false)
    fixture.selectors.workspaces.items[0].name = '이전 권한의 선택 이름'
    return HttpResponse.json(fixture)
  }))
  let auth!: AuthContextValue
  function Capture() { auth = useAuth(); return null }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<MemoryRouter initialEntries={[`${base}&workspaceId=${uuid(12)}&publicModelName=campus%2Fstart`]}><QueryClientProvider client={client}><AuthProvider><ToastProvider><Capture /><App /></ToastProvider></AuthProvider></QueryClientProvider></MemoryRouter>)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  const editor = screen.getByRole('textbox', { name: '요청한 공개 모델' })
  await user.clear(editor)
  await user.type(editor, 'unsubmitted/private-draft')
  const changed = structuredClone(initial)
  changed.authorityFingerprint = 'synthetic-recovery-second'
  changed.assignments[0].permission.revision = 41
  AUTHORITY_OVERRIDES[orgViewerProfile.id] = changed
  await act(async () => { await auth.refreshProfile() })
  await screen.findByText(/갱신하지 못했습니다/)
  expect(auth.user?.role).toBe('ORG_VIEWER')
  expect(screen.getByRole('textbox', { name: '요청한 공개 모델' })).toHaveValue('campus/start')
  expect(screen.queryByText('이전 권한의 선택 이름')).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: '수요 워크스페이스' })).not.toBeInTheDocument()
})

test('clears a now-denied workspace filter without replaying the previous authority data', async () => {
  const user = userEvent.setup()
  const initial = mockInstitutionAuthority(orgViewerProfile)
  initial.authorityFingerprint = 'synthetic-recovery-allowed'
  initial.assignments[0].permission = { mode: 'SELECTED', work: ['llm.observe'], scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(12)] } }, revision: 40 }
  AUTHORITY_OVERRIDES[orgViewerProfile.id] = initial
  const queries: URLSearchParams[] = []
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/llm/capacity', ({ request }) => {
    const params = new URL(request.url).searchParams
    queries.push(params)
    const fixture = llmCapacityFixture({ workspaceId: queries.length === 1 ? uuid(12) : uuid(13), from: params.get('from')!, to: params.get('to')! }, false)
    fixture.selectors.workspaces.items[0].name = queries.length === 1 ? '이전 권한의 공간' : '현재 허용된 공간'
    return HttpResponse.json(fixture)
  }))
  let auth!: AuthContextValue
  function Capture() { auth = useAuth(); return null }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<MemoryRouter initialEntries={[`${base}&workspaceId=${uuid(12)}&publicModelName=campus%2Fstart`]}><QueryClientProvider client={client}><AuthProvider><ToastProvider><Capture /><App /></ToastProvider></AuthProvider></QueryClientProvider></MemoryRouter>)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  const changed = structuredClone(initial)
  changed.authorityFingerprint = 'synthetic-recovery-restricted'
  changed.assignments[0].permission = { mode: 'SELECTED', work: ['llm.observe'], scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(13)] } }, revision: 41 }
  AUTHORITY_OVERRIDES[orgViewerProfile.id] = changed
  await act(async () => { await auth.refreshProfile() })
  await screen.findByText('선택한 기관·공간 범위의 LLM 관측 업무가 없습니다.')
  expect(queries).toHaveLength(1)
  expect(screen.queryByText('이전 권한의 공간')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: '요청한 공개 모델' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '조회 필터 초기화' }))
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  expect(queries).toHaveLength(2)
  expect(queries.at(-1)?.has('workspaceId')).toBe(false)
  expect(queries.at(-1)?.get('orgId')).toBe(uuid(1))
  expect(queries.at(-1)?.get('from')).toBe('2026-10-20T00:00:00.125Z')
  expect(queries.at(-1)?.get('to')).toBe('2026-10-21T00:00:00.125Z')
  expect(screen.getByRole('option', { name: '현재 허용된 공간' })).toBeInTheDocument()
})
