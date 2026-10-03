import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { delay, http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import { PathnameProbe } from '../test/PathnameProbe'
import { orgAdminUser, orgManagerUser, orgViewerUser, refreshSuccessHandler, sysAdminUser, sysManagerUser, sysViewerUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { noticeStore } from '../test/msw/handlers/notices'
import { currentPath, renderApp } from '../test/render'

function system(path: string) {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(path)
}

describe('Dedicated notice authoring routes', () => {
  test('registration is a full page with the existing form and no modal drawer', async () => {
    system('/admin/notices/new')
    expect(await screen.findByRole('heading', { name: '공지 등록', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('본문')).toHaveAttribute('maxlength', '20000')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('an existing notice opens a dedicated exact-ID edit page', async () => {
    system(`/admin/notices/${uuid(201)}/edit`)
    expect(await screen.findByRole('heading', { name: '공지 수정', level: 1 })).toBeInTheDocument()
    expect(await screen.findByDisplayValue('데이터센터 정기 점검 안내')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('the list drawer remains read-only and editing navigates to a separate page', async () => {
    const user = userEvent.setup()
    system(`/admin/notices?selected=${uuid(201)}`)
    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    expect(await within(drawer).findByRole('link', { name: '공지 수정' })).toBeInTheDocument()
    expect(within(drawer).queryByLabelText('제목')).not.toBeInTheDocument()
    await user.click(within(drawer).getByRole('link', { name: '공지 수정' }))
    await screen.findByRole('heading', { name: '공지 수정', level: 1 })
    expect(currentPath()).toContain(`/admin/notices/${uuid(201)}/edit`)
  })

  test('the legacy creation URL replaces itself with the authoring route', async () => {
    system('/admin/notices?page=2&create=1')
    await screen.findByRole('heading', { name: '공지 등록', level: 1 })
    await waitFor(() => expect(currentPath()).toContain('/admin/notices/new?'))
    expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('returnTo')).toBe('/admin/notices?page=2')
  })
})

function HistoryProbe() {
  const navigate = useNavigate()
  const location = useLocation()
  return <><button data-testid="back" onClick={() => void navigate(-1)}>Back</button><button data-testid="forward" onClick={() => void navigate(1)}>Forward</button><output data-testid="history-state">{JSON.stringify(location.state)}</output></>
}
function withHistory(initialEntries: Array<string | { pathname: string; state: unknown }>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  return render(<MemoryRouter initialEntries={initialEntries}><QueryClientProvider client={queryClient}><AuthProvider><ToastProvider><App /><HistoryProbe /><PathnameProbe /></ToastProvider></AuthProvider></QueryClientProvider></MemoryRouter>)
}

describe('Notice authoring authority and return boundaries', () => {
  test.each([
    ['access-sys-admin', sysAdminUser, true], ['access-sys-manager', sysManagerUser, false], ['access-sys-viewer', sysViewerUser, false],
    ['access-org-admin', orgAdminUser, true], ['access-org-manager', orgManagerUser, false], ['access-org-viewer', orgViewerUser, false],
  ] as const)('%s may enter the dedicated editor only with global publishing authority', async (token, profile, allowed) => {
    server.use(refreshSuccessHandler(token, profile))
    renderApp(`/admin/notices/${uuid(201)}/edit`)
    if (allowed) expect(await screen.findByRole('heading', { name: '공지 수정', level: 1 })).toBeInTheDocument()
    else {
      await waitFor(() => expect(currentPath()).not.toContain('/edit'))
      expect(screen.queryByLabelText('본문')).not.toBeInTheDocument()
    }
  })

  test('valid selected targets take precedence over the legacy creation flag', async () => {
    system(`/admin/notices?create=1&selected=${uuid(201)}`)
    const reader = await screen.findByRole('dialog', { name: '공지 상세' })
    await within(reader).findByText(/8월 20일/)
    expect(screen.queryByRole('heading', { name: '공지 등록', level: 1 })).not.toBeInTheDocument()
    expect(currentPath()).not.toContain('/new')
  })

  test('malformed and absent editing targets never render a creation form', async () => {
    let reads = 0
    server.use(http.get('*/api/v1/admin/notices/:noticeId', () => { reads += 1 }))
    system('/admin/notices/bad/edit')
    await screen.findByText('공지 ID가 올바르지 않습니다.')
    expect(reads).toBe(0)
    expect(screen.queryByLabelText('본문')).not.toBeInTheDocument()
  })

  test('an external return destination falls back to the notice list', async () => {
    system(`/admin/notices/${uuid(201)}/edit?returnTo=${encodeURIComponent('https://example.test/steal')}`)
    await screen.findByRole('heading', { name: '공지 수정', level: 1 })
    expect(screen.getByRole('link', { name: '목록으로 돌아가기' })).toHaveAttribute('href', '/admin/notices')
  })

  test('automatic organisation restoration keeps the normalized originating page and reader target', async () => {
    const user = userEvent.setup()
    const returnTo = `/admin/notices?page=2&selected=${uuid(201)}`
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/notices/${uuid(201)}/edit?returnTo=${encodeURIComponent(returnTo)}`)
    await screen.findByDisplayValue('데이터센터 정기 점검 안내')
    expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('returnTo')).toContain('page=2')
    await user.click(screen.getByRole('link', { name: '목록으로 돌아가기' }))
    await screen.findByRole('dialog', { name: '공지 상세' })
    expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('page')).toBe('2')
    expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('selected')).toBe(uuid(201))
  })

  test('an empty org value in a return URL preserves the active organisation and original page', async () => {
    const user = userEvent.setup()
    const returnTo = `/admin/notices?org=&page=2&selected=${uuid(201)}`
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/notices/${uuid(201)}/edit?org=${uuid(1)}&returnTo=${encodeURIComponent(returnTo)}`)
    await screen.findByDisplayValue('데이터센터 정기 점검 안내')
    const backlink = screen.getByRole('link', { name: '목록으로 돌아가기' })
    expect(new URL(backlink.getAttribute('href')!, 'https://pickle.invalid').searchParams.get('org')).toBe(uuid(1))
    await user.click(backlink)
    await screen.findByRole('dialog', { name: '공지 상세' })
    expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('page')).toBe('2')
  })

  test('an explicit scope change clears the draft and its old return context', async () => {
    const user = userEvent.setup()
    system(`/admin/notices/${uuid(201)}/edit?org=${uuid(1)}&returnTo=${encodeURIComponent(`/admin/notices?page=2&org=${uuid(1)}`)}`)
    await user.type(await screen.findByLabelText('제목'), ' 미저장')
    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
    await waitFor(() => expect(screen.getByLabelText('제목')).toHaveValue('데이터센터 정기 점검 안내'))
    expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.has('returnTo')).toBe(false)
    expect(screen.getByRole('link', { name: '목록으로 돌아가기' })).toHaveAttribute('href', `/admin/notices?org=${uuid(2)}`)
  })

  test.each(['unexpected state', 7])('primitive history state does not crash the editor', async (state) => {
    withHistory([{ pathname: `/admin/notices/${uuid(201)}/edit`, state }])
    expect(await screen.findByDisplayValue('데이터센터 정기 점검 안내')).toBeInTheDocument()
    expect(screen.queryByText('저장됨')).not.toBeInTheDocument()
  })

  test('creation navigates by exact ID and consumes its receipt before history revisits the editor', async () => {
    withHistory(['/admin/notices', '/admin/notices/new'])
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('제목'), '전용 페이지 생성')
    await user.type(screen.getByLabelText('본문'), '본문')
    await user.click(screen.getByRole('button', { name: '등록' }))
    await screen.findByRole('heading', { name: '공지 수정', level: 1 })
    expect(await screen.findByText('저장됨')).toBeInTheDocument()
    expect(screen.getByTestId('history-state')).toHaveTextContent('null')
    expect(screen.getByLabelText('이미지 추가')).toBeEnabled()
    fireEvent.click(screen.getByTestId('back'))
    await screen.findByRole('heading', { name: '공지사항 관리', level: 1 })
    fireEvent.click(screen.getByTestId('forward'))
    await screen.findByRole('heading', { name: '공지 수정', level: 1 })
    await screen.findByDisplayValue('전용 페이지 생성')
    expect(screen.queryByText('저장됨')).not.toBeInTheDocument()
  })

  test('a pending old creation cannot navigate away from a replacement editor', async () => {
    let done = false
    server.use(http.post('*/api/v1/admin/notices', async ({ request }) => {
      const body = await request.json() as Record<string, unknown>
      await delay(200); done = true
      return HttpResponse.json({ ...noticeStore[0], ...body, id: uuid(999), active: true }, { status: 201 })
    }))
    const user = userEvent.setup()
    system('/admin/notices/new')
    await user.type(await screen.findByLabelText('제목'), '이전 생성')
    await user.type(screen.getByLabelText('본문'), '본문')
    await user.click(screen.getByRole('button', { name: '등록' }))
    await user.click(screen.getByRole('link', { name: '목록으로 돌아가기' }))
    await user.click(await screen.findByRole('button', { name: '콘솔 기능 업데이트' }))
    const reader = screen.getByRole('dialog')
    await user.click(await within(reader).findByRole('link', { name: '공지 수정' }))
    await screen.findByDisplayValue('콘솔 기능 업데이트')
    await waitFor(() => expect(done).toBe(true))
    expect(currentPath()).toContain(`/admin/notices/${uuid(202)}/edit`)
    expect(screen.queryByText('공지를 등록했습니다. 이어서 이미지를 첨부할 수 있습니다.')).not.toBeInTheDocument()
  })
})
