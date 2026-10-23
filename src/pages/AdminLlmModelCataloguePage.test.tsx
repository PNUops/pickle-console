import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { orgViewerUser, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { openRouterCatalogueStore } from '../test/msw/handlers/openrouter-accounts'
import { server } from '../test/msw/server'
import userEvent from '@testing-library/user-event'
import { currentPath, renderApp } from '../test/render'

describe('model catalogue diagnostics', () => {
  beforeEach(() => {
    openRouterCatalogueStore.reset()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  })

  test('distinguishes a failed first refresh from a catalogue that was never attempted', async () => {
    openRouterCatalogueStore.response = {
      models: [], freshness: 'UNKNOWN', lastSuccessAt: null,
      lastAttemptAt: '2026-10-24T00:00:00Z', lastError: 'HTTP_503', consecutiveFailures: 2,
    }
    renderApp('/admin/llm/models')

    expect(await screen.findByText('공급자 갱신 실패')).toBeInTheDocument()
    expect(screen.getByText('HTTP_503')).toBeInTheDocument()
    expect(screen.getByText('연속 실패 2회')).toBeInTheDocument()
    expect(screen.getByText('아직 성공한 공급자 목록이 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장된 목록 다시 조회' })).toBeInTheDocument()
  })
})


test('keeps the last successful catalogue and timestamps after a failed GET', async () => {
  const user = userEvent.setup()
  openRouterCatalogueStore.reset()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/llm/models')
  await screen.findByText('openai/o1-pro')
  const supplier = screen.getByText('마지막 공급자 성공').nextElementSibling?.textContent
  const fetched = screen.getByText('마지막 콘솔 조회 성공').nextElementSibling?.textContent
  openRouterCatalogueStore.fail = true
  await user.click(screen.getByRole('button', { name: '저장된 목록 다시 조회' }))
  await screen.findByText(/저장된 목록 조회 실패:/)
  expect(screen.getByText('openai/o1-pro')).toBeInTheDocument()
  expect(screen.getByText('마지막 공급자 성공').nextElementSibling?.textContent).toBe(supplier)
  expect(screen.getByText('마지막 콘솔 조회 성공').nextElementSibling?.textContent).toBe(fetched)
  expect(screen.getByText(/마지막으로 조회한 자료를 유지합니다/)).toBeInTheDocument()
  openRouterCatalogueStore.fail = false
  await user.click(screen.getByRole('button', { name: '저장된 목록 다시 조회' }))
  await waitFor(() => expect(screen.queryByText(/저장된 목록 조회 실패:/)).not.toBeInTheDocument())
})

test('restores search from the URL and preserves other query parameters', async () => {
  const user = userEvent.setup()
  openRouterCatalogueStore.reset()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  const view = renderApp('/admin/llm/models?q=o1-pro&context=synthetic&org=00000000-0000-4000-8000-000000000001')
  await screen.findByText('openai/o1-pro')
  expect(screen.getByLabelText('모델 검색')).toHaveValue('o1-pro')
  await user.clear(screen.getByLabelText('모델 검색'))
  await user.type(screen.getByLabelText('모델 검색'), 'claude')
  const url = currentPath()
  const params = new URL(url, 'https://pickle.invalid').searchParams
  expect(params.get('q')).toBe('claude')
  expect(params.get('context')).toBe('synthetic')
  expect(params.get('org')).toBe('00000000-0000-4000-8000-000000000001')
  view.unmount()
  renderApp(url)
  expect(await screen.findByLabelText('모델 검색')).toHaveValue('claude')
  await screen.findByText('~anthropic/claude-sonnet-latest')
  expect(screen.queryByText('openai/o1-pro')).not.toBeInTheDocument()
  await user.clear(screen.getByLabelText('모델 검색'))
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.has('q')).toBe(false)
})


test('links institution observers to the same scoped service status collection', async () => {
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
  renderApp('/admin/llm/models?org=00000000-0000-4000-8000-000000000001')
  expect(await screen.findByRole('link', { name: '자체 서빙 모델의 주·대체 공급원 연결 확인' })).toHaveAttribute('href', '/admin/llm/status?org=00000000-0000-4000-8000-000000000001')
})
