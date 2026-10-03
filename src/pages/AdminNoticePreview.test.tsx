import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useNavigate } from 'react-router'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { ACCESS_TOKENS, orgAdminDualProfile, orgAdminUser, orgManagerUser, orgViewerUser, refreshSuccessHandler, sysAdminUser, sysManagerUser, sysViewerUser } from '../test/msw/handlers/auth'
import { makeNotice, noticeStore, seedNotices } from '../test/msw/handlers/notices'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import { PathnameProbe } from '../test/PathnameProbe'

function system(path = '/admin/notices') {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(path)
}
function HistoryButtons() {
  const navigate = useNavigate()
  return <><button data-testid="back" onClick={() => void navigate(-1)}>Back</button><button data-testid="forward" onClick={() => void navigate(1)}>Forward</button></>
}

describe('Notice exact targets, windows and preview', () => {
  test.each(['ORG_MANAGER', 'ORG_VIEWER'] as const)('global notice publishing uses the author role even while selecting an %s institution', async (selectedRole) => {
    const token = 'access-global-notice-author'
    ACCESS_TOKENS[token] = { ...orgAdminDualProfile, managedOrgs: [{ ...orgAdminDualProfile.managedOrgs[0] }, { ...orgAdminDualProfile.managedOrgs[1], role: selectedRole }] }
    try {
      server.use(refreshSuccessHandler(token, orgAdminUser))
      renderApp(`/admin/notices?org=${uuid(2)}&selected=${uuid(201)}`)
      const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
      expect(await within(drawer).findByLabelText('제목')).toHaveValue('데이터센터 정기 점검 안내')
      expect(within(drawer).getByRole('button', { name: '저장' })).toBeEnabled()
      expect(screen.getByRole('button', { name: '공지 등록' })).toBeInTheDocument()
    } finally { delete ACCESS_TOKENS[token] }
  })
  test.each([
    ['access-sys-admin', sysAdminUser, true], ['access-sys-manager', sysManagerUser, false], ['access-sys-viewer', sysViewerUser, false],
    ['access-org-admin', orgAdminUser, true], ['access-org-manager', orgManagerUser, false], ['access-org-viewer', orgViewerUser, false],
  ] as const)('%s reads the direct target and retains the publishing gate', async (token, profile, writable) => {
    server.use(refreshSuccessHandler(token, profile))
    renderApp(`/admin/notices?selected=${uuid(201)}`)
    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    await waitFor(() => expect(within(drawer).queryByLabelText('제목') || within(drawer).queryByText(/작성자 이시스템/)).toBeTruthy())
    expect(!!within(drawer).queryByRole('button', { name: '저장' })).toBe(writable)
    expect(currentPath()).toContain(`selected=${uuid(201)}`)
  })

  test('the list differentiates scheduled, published and ended notices with end times', async () => {
    system()
    const future = (await screen.findByRole('button', { name: '서비스 점검 팝업' })).closest('tr')!
    expect(within(future).getByText('게시 예정')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: '지난 점검 공지' }).closest('tr')!).getByText('게시 종료')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: '콘솔 기능 업데이트' }).closest('tr')!).getByText('게시 중')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '게시 종료' })).toBeInTheDocument()
  })

  test('a paged-out existing notice remains PATCH-only after changing its publication order', async () => {
    seedNotices(Array.from({ length: 25 }, (_, index) => makeNotice({ id: uuid(700 + index), title: `공지${index}`, startsAt: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00+09:00` })))
    let posts = 0
    const patches: string[] = []
    server.use(http.post('*/api/v1/admin/notices', () => { posts += 1 }), http.patch('*/api/v1/admin/notices/:noticeId', ({ params }) => { patches.push(String(params.noticeId)) }))
    const user = userEvent.setup()
    system(`/admin/notices?page=2&selected=${uuid(700)}`)
    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    const start = await within(drawer).findByLabelText('게시 시작')
    fireEvent.change(start, { target: { value: '2099-01-01T00:00' } })
    await user.click(within(drawer).getByRole('button', { name: '저장' }))
    await within(drawer).findByText('저장됨')
    await waitFor(() => expect(screen.queryByRole('button', { name: '공지0' })).not.toBeInTheDocument())
    expect(within(drawer).getByRole('button', { name: '저장' })).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(patches).toEqual([uuid(700), uuid(700)]))
    expect(posts).toBe(0)
    expect(currentPath()).toContain('page=2')
  })

  test('an absent or malformed detail never renders a new-notice form', async () => {
    let reads = 0
    server.use(http.get('*/api/v1/admin/notices/:noticeId', () => { reads += 1 }))
    system(`/admin/notices?selected=${uuid(999)}`)
    await screen.findByText('해당 공지가 존재하지 않습니다.')
    expect(screen.queryByRole('button', { name: '등록' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('본문')).not.toBeInTheDocument()
    expect(reads).toBe(1)
  })

  test('a malformed notice identifier does not issue a detail GET', async () => {
    let calls = 0
    server.use(http.get('*/api/v1/admin/notices/:noticeId', () => { calls += 1 }))
    system('/admin/notices?selected=bad')
    await screen.findByText('공지 ID가 올바르지 않습니다.')
    expect(calls).toBe(0)
    expect(screen.queryByRole('button', { name: '등록' })).not.toBeInTheDocument()
  })

  test('plain text and saved images render identically in full and popup draft previews', async () => {
    noticeStore[0].body = '<b>첫 줄</b>\n둘째 줄'
    const user = userEvent.setup()
    system(`/admin/notices?selected=${uuid(201)}`)
    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    await within(drawer).findByLabelText('본문')
    await user.click(within(drawer).getByRole('checkbox', { name: /팝업으로 표시/ }))
    await user.click(within(drawer).getByRole('button', { name: '내용 미리보기' }))
    const preview = within(drawer).getByRole('region', { name: '공지 내용 미리보기' })
    expect(within(preview).getAllByText('<b>첫 줄</b> 둘째 줄')).toHaveLength(2)
    expect(preview.querySelector('b')).toBeNull()
    expect(within(preview).getByRole('dialog', { name: '데이터센터 정기 점검 안내' })).not.toHaveAttribute('aria-modal')
    expect(within(preview).getAllByText('첨부 이미지')).toHaveLength(1)
    await waitFor(() => expect(within(preview).getAllByRole('img', { name: 'maintenance.png' })).toHaveLength(2))
  })

  test('a new notice preview does not write a draft or publish before submission', async () => {
    let posts = 0
    server.use(http.post('*/api/v1/admin/notices', () => { posts += 1 }))
    const user = userEvent.setup()
    system('/admin/notices?create=1')
    const drawer = await screen.findByRole('dialog', { name: '공지 등록' })
    await user.type(within(drawer).getByLabelText('제목'), '미리보기만')
    await user.type(within(drawer).getByLabelText('본문'), '평문 미리보기')
    expect(within(drawer).getByLabelText('본문')).toHaveAttribute('maxlength', '20000')
    await user.click(within(drawer).getByRole('button', { name: '내용 미리보기' }))
    expect(within(drawer).getByRole('region', { name: '공지 내용 미리보기' })).toBeInTheDocument()
    expect(posts).toBe(0)
    expect(noticeStore.some((notice) => notice.title === '미리보기만')).toBe(false)
  })

  test('the current notice body limit is accepted and the creation receipt survives exact detail navigation', async () => {
    const user = userEvent.setup()
    system('/admin/notices?create=1')
    const drawer = await screen.findByRole('dialog', { name: '공지 등록' })
    await user.type(within(drawer).getByLabelText('제목'), '본문 경계 확인')
    fireEvent.change(within(drawer).getByLabelText('본문'), { target: { value: '가'.repeat(20_000) } })
    await user.click(within(drawer).getByRole('button', { name: '등록' }))
    const detail = await screen.findByRole('dialog', { name: '공지 상세' })
    expect(await within(detail).findByText('저장됨')).toBeInTheDocument()
    expect(currentPath()).toContain('selected=')
    expect(currentPath()).not.toContain('create=')
    expect(noticeStore.find((notice) => notice.title === '본문 경계 확인')?.body).toHaveLength(20_000)
  })

  test('one character beyond the body limit fails before posting', async () => {
    let writes = 0
    server.use(http.post('*/api/v1/admin/notices', () => { writes += 1 }))
    const user = userEvent.setup()
    system('/admin/notices?create=1')
    const drawer = await screen.findByRole('dialog', { name: '공지 등록' })
    await user.type(within(drawer).getByLabelText('제목'), '너무 긴 본문')
    fireEvent.change(within(drawer).getByLabelText('본문'), { target: { value: '가'.repeat(20_001) } })
    await user.click(within(drawer).getByRole('button', { name: '등록' }))
    expect(await within(drawer).findByText('본문은 20,000자 이하여야 합니다.')).toBeInTheDocument()
    expect(writes).toBe(0)
  })

  test('editing a saved notice removes the receipt while the new draft remains unsaved', async () => {
    const user = userEvent.setup()
    system(`/admin/notices?selected=${uuid(201)}`)
    const drawer = await screen.findByRole('dialog')
    await within(drawer).findByLabelText('제목')
    await user.click(within(drawer).getByRole('button', { name: '저장' }))
    await within(drawer).findByText('저장됨')
    await user.type(within(drawer).getByLabelText('제목'), ' 미저장')
    expect(within(drawer).queryByText('저장됨')).not.toBeInTheDocument()
  })

  test('a modified and reopened created notice never restores its original creation receipt', async () => {
    const user = userEvent.setup()
    system('/admin/notices?create=1')
    const creator = await screen.findByRole('dialog')
    await user.type(within(creator).getByLabelText('제목'), '저장 근거 재개')
    await user.type(within(creator).getByLabelText('본문'), '본문')
    await user.click(within(creator).getByRole('button', { name: '등록' }))
    const editor = await screen.findByRole('dialog', { name: '공지 상세' })
    await within(editor).findByText('저장됨')
    fireEvent.change(within(editor).getByLabelText('게시 시작'), { target: { value: '2099-01-01T00:00' } })
    await user.click(within(editor).getByRole('button', { name: '저장' }))
    await within(editor).findByText(/게시 예정 설정/)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: '저장 근거 재개' }))
    const reopened = screen.getByRole('dialog', { name: '공지 상세' })
    await within(reopened).findByDisplayValue('2099-01-01T00:00')
    expect(within(reopened).queryByText('저장됨')).not.toBeInTheDocument()
  })

  test('the first creation receipt is consumed when leaving its surface through history', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<MemoryRouter initialEntries={['/admin/notices?create=1']}><QueryClientProvider client={queryClient}><AuthProvider><ToastProvider><App /><HistoryButtons /><PathnameProbe /></ToastProvider></AuthProvider></QueryClientProvider></MemoryRouter>)
    const user = userEvent.setup()
    const creator = await screen.findByRole('dialog', { name: '공지 등록' })
    await user.type(within(creator).getByLabelText('제목'), '이력 왕복 확인')
    await user.type(within(creator).getByLabelText('본문'), '본문')
    await user.click(within(creator).getByRole('button', { name: '등록' }))
    const created = await screen.findByRole('dialog', { name: '공지 상세' })
    await within(created).findByText('저장됨')
    fireEvent.click(screen.getByTestId('back'))
    await screen.findByRole('dialog', { name: '공지 등록' })
    fireEvent.click(screen.getByTestId('forward'))
    const reopened = await screen.findByRole('dialog', { name: '공지 상세' })
    await within(reopened).findByDisplayValue('이력 왕복 확인')
    expect(within(reopened).queryByText('저장됨')).not.toBeInTheDocument()
  })

  test('a late save refreshes data without closing or announcing success in a different target', async () => {
    const user = userEvent.setup()
    let finished = false
    server.use(http.patch('*/api/v1/admin/notices/:noticeId', async ({ request, params }) => { await delay(200); finished = true; return HttpResponse.json({ ...noticeStore.find((notice) => notice.id === String(params.noticeId))!, ...(await request.json() as Record<string, unknown>), active: true }) }))
    system(`/admin/notices?selected=${uuid(201)}`)
    const old = await screen.findByRole('dialog')
    await within(old).findByLabelText('제목')
    await user.click(within(old).getByRole('button', { name: '저장' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: '콘솔 기능 업데이트' }))
    const next = screen.getByRole('dialog')
    await within(next).findByDisplayValue('콘솔 기능 업데이트')
    await waitFor(() => expect(finished).toBe(true))
    expect(screen.getByRole('dialog')).toBe(next)
    expect(screen.queryByText('공지를 수정했습니다.')).not.toBeInTheDocument()
    expect(within(next).queryByText('저장됨')).not.toBeInTheDocument()
  })

  test('Escape preserves the list URL and returns focus to its notice row', async () => {
    const user = userEvent.setup()
    system()
    const opener = await screen.findByRole('button', { name: '콘솔 기능 업데이트' })
    await user.click(opener)
    const drawer = screen.getByRole('dialog')
    await within(drawer).findByLabelText('제목')
    await user.keyboard('{Tab}')
    expect(drawer.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(opener).toHaveFocus())
    expect(currentPath()).toBe('/admin/notices')
  })
})
