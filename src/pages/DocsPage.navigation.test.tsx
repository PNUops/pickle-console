import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ReauthProvider } from '../auth/ReauthProvider'
import { ToastProvider } from '../components/ui'
import { guideArticles, guideGroups } from '../docs/catalog'
import { parseGuidePath } from '../lib/docs-paths'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

afterEach(() => localStorage.removeItem('pickle_sidebar_collapsed'))

function HistoryControls() {
  const navigate = useNavigate()
  const location = useLocation()
  return <>
    <button onClick={() => void navigate(-1)}>Test back</button>
    <output data-testid="location">{location.pathname + location.search + location.hash}</output>
    <output data-testid="return-to">{(location.state as { from?: string } | null)?.from}</output>
  </>
}

function renderHistory(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={client}><AuthProvider><ToastProvider><ReauthProvider>
        <App /><HistoryControls />
      </ReauthProvider></ToastProvider></AuthProvider></QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('guide content and navigation', () => {
  test('introduces every supported journey from the public home', async () => {
    renderApp('/docs')
    expect(await screen.findByRole('heading', { level: 1, name: '사용 가이드' })).toBeInTheDocument()
    for (const group of guideGroups) expect(screen.getAllByRole('heading', { name: group }).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '처음 이용하기부터 시작 →' })).toHaveAttribute('href', '/docs/start')
    await userEvent.setup().click(screen.getByRole('link', { name: '서비스 소개 →' }))
    expect(await screen.findByRole('heading', { level: 1, name: '서비스 소개' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '서비스 소개' })).toHaveTextContent('부산대학교 클라우드 플랫폼')
  })

  test.each(guideArticles.map((article) => [article.slug, article.title]))('renders %s and resolves every guide link', async (slug, title) => {
    renderApp(`/docs/${slug}`)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    const article = guideArticles.find((entry) => entry.slug === slug)!
    expect(new Set(article.sections.map((section) => section.id)).size).toBe(article.sections.length)
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const url = new URL(link.href)
      if (url.origin !== window.location.origin) continue
      const destination = parseGuidePath(url.pathname)
      if (!destination || destination.slug === '') continue
      const target = guideArticles.find((entry) => entry.slug === destination.slug)
      expect(target, link.href).toBeDefined()
      if (url.hash) expect(target?.sections.some((section) => section.id === decodeURIComponent(url.hash.slice(1))), link.href).toBe(true)
    }
    await waitFor(() => expect(document.title).toBe(`${title} · 사용 가이드 · Pickle`))
  })

  test('keeps workspace context without showing task selectors in the guide', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderHistory(`/console/${uuid(7)}/docs/vm/connect#ssh`)
    const user = userEvent.setup()
    await screen.findByRole('heading', { level: 1, name: '가상머신 접속과 파일 전송' })
    expect(screen.queryByRole('navigation', { name: '콘솔 메뉴' })).not.toBeInTheDocument()
    const articleNav = await screen.findByRole('navigation', { name: '문서 목차' })
    expect(within(articleNav).getByRole('link', { name: 'LLM API 신청과 키 발급' })).toHaveAttribute('href', `/console/${uuid(7)}/docs/llm/start`)
    expect(screen.queryByRole('button', { name: '워크스페이스 선택' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '콘솔로 돌아가기' })).toHaveAttribute('href', `/console/${uuid(7)}`)
    const collapse = screen.getByRole('button', { name: '사이드바 접기' })
    await user.click(collapse)
    await user.click(within(screen.getByRole('navigation', { name: '이전 다음 문서' })).getByRole('link', { name: '가상머신 관리와 사용 종료' }))
    expect(await screen.findByRole('heading', { level: 1, name: '가상머신 관리와 사용 종료' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false')
    localStorage.removeItem('pickle_sidebar_collapsed')
  })

  test('retains administrator scope in document links without a selector', async () => {
    server.use(refreshSuccessHandler('access-sys-admin'))
    renderHistory(`/admin/docs/vm/connect?org=${uuid(1)}#ssh`)
    const user = userEvent.setup()
    await screen.findByRole('heading', { level: 1, name: '가상머신 접속과 파일 전송' })
    expect(screen.queryByLabelText('관리 기관 선택')).not.toBeInTheDocument()
    const toc = screen.getByRole('navigation', { name: '이 문서의 목차' })
    await user.click(within(toc).getByRole('link', { name: '파일 업로드와 다운로드' }))
    expect(screen.getByTestId('location')).toHaveTextContent(`/admin/docs/vm/connect?org=${uuid(1)}#files`)
    expect(screen.queryByRole('navigation', { name: '관리자 메뉴' })).not.toBeInTheDocument()
    expect(await screen.findByRole('navigation', { name: '문서 목차' })).toBeInTheDocument()
  })

  test('keeps public content available when authentication fails', async () => {
    server.use(http.post('*/api/v1/auth/refresh', () => HttpResponse.error()))
    renderApp('/docs/vm/connect')
    expect(await screen.findByRole('heading', { level: 1, name: '가상머신 접속과 파일 전송' })).toBeInTheDocument()
  })

  test('offers the same public article from maintenance mode', async () => {
    server.use(refreshSuccessHandler('access-user'), http.get('*/api/v1/meta/status', () => HttpResponse.json({ maintenance: true, maintenanceMessage: '점검', bannerMessage: null, contactEmail: null })))
    renderApp('/console/docs/vm/connect#ssh')
    const link = await screen.findByRole('link', { name: '사용 가이드 읽기' })
    expect(link).toHaveAttribute('href', '/docs/vm/connect#ssh')
    await userEvent.setup().click(link)
    expect(await screen.findByRole('heading', { level: 1, name: '가상머신 접속과 파일 전송' })).toBeInTheDocument()
  })

  test('searches keywords and returns focus when the mobile contents close', async () => {
    renderApp('/docs')
    const user = userEvent.setup()
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' })
    await user.click(trigger)
    const drawer = screen.getByRole('dialog', { name: '문서 목차' })
    await user.type(within(drawer).getByRole('searchbox', { name: '문서 검색' }), 'ssh')
    expect(within(drawer).getByRole('link', { name: '가상머신 접속과 파일 전송' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('link', { name: 'LLM API 신청과 키 발급' })).not.toBeInTheDocument()
    await user.clear(within(drawer).getByRole('searchbox'))
    await user.type(within(drawer).getByRole('searchbox'), 'no-such-guide')
    expect(within(drawer).getByRole('status')).toHaveTextContent('검색 결과가 없습니다')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '문서 목차' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  test('omits header sharing controls while keeping command copying', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderApp(`/console/${uuid(7)}/docs/vm/connect?private=filter#files`)
    const heading = await screen.findByRole('heading', { level: 1, name: '가상머신 접속과 파일 전송' })
    expect(within(heading.closest('header')!).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '공유 링크 복사' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '가상머신 접속과 파일 전송' })).getAllByRole('button', { name: '복사' }).length).toBeGreaterThan(0)
  })

  test('restores application values and step after reading a guide', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderHistory('/console/requests/new?kind=VM')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('이름'), '가이드 왕복 확인')
    await user.click(screen.getByRole('radio', { name: 'Ubuntu' }))
    await user.click(screen.getByRole('radio', { name: /컴퓨팅 최적화/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.type(await screen.findByLabelText('사용 목적'), '실습용 서버')
    await user.click(screen.getByRole('link', { name: '신청 작성 가이드' }))
    await screen.findByRole('heading', { level: 1, name: '가상머신 신청하기' })
    await user.click(screen.getByRole('button', { name: 'Test back' }))
    expect(await screen.findByLabelText('사용 목적')).toHaveValue('실습용 서버')
    await user.click(screen.getByRole('button', { name: '이전' }))
    expect(await screen.findByLabelText('이름')).toHaveValue('가이드 왕복 확인')
  })

  test('passes the public article to login and offers the same authenticated article', async () => {
    renderHistory('/docs/vm/connect#files')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('link', { name: '로그인' }))
    expect(screen.getByTestId('return-to')).toHaveTextContent('/docs/vm/connect#files')
  })

  test('opens authenticated reading without redirecting the public route', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderHistory('/docs/vm/connect#files')
    const link = await screen.findByRole('link', { name: '콘솔에서 읽기' })
    expect(link).toHaveAttribute('href', '/console/docs/vm/connect#files')
    expect(screen.getByTestId('location')).toHaveTextContent('/docs/vm/connect#files')
  })

  test('handles unknown articles inside the guide layout', async () => {
    renderApp('/docs/missing')
    expect(await screen.findByRole('heading', { level: 1, name: '문서를 찾을 수 없습니다' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '사용 가이드 홈으로 이동' })).toHaveAttribute('href', '/docs')
  })

  test('revisits the same fragment and falls back for an unknown fragment', async () => {
    renderHistory('/docs/vm/connect#missing-section')
    const user = userEvent.setup()
    const heading = await screen.findByRole('heading', { level: 1, name: '가상머신 접속과 파일 전송' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    const toc = screen.getByRole('navigation', { name: '이 문서의 목차' })
    const link = within(toc).getByRole('link', { name: 'SSH 개인키로 접속하기' })
    await user.click(link)
    const target = document.getElementById('ssh')!
    await waitFor(() => expect(document.activeElement).toBe(target))
    const scroll = vi.fn()
    Object.defineProperty(target, 'scrollIntoView', { value: scroll, configurable: true })
    heading.focus()
    await user.click(link)
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' })
    expect(document.activeElement).toBe(target)
  })

  test('reads administrator documentation even when institution loading fails', async () => {
    server.use(refreshSuccessHandler('access-sys-admin'), http.get('*/api/v1/orgs', () => HttpResponse.json({}, { status: 503 })))
    renderApp(`/admin/docs/start?org=${uuid(1)}`)
    expect(await screen.findByRole('heading', { level: 1, name: '처음 시작하기' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '리소스 신청' })).not.toBeInTheDocument()
  })

  test('returns to the original task after navigating between documents', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderHistory('/console/requests/new?kind=LLM_API_KEY&step=resource')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('이름'), '이어 쓰는 신청')
    await user.click(screen.getByRole('link', { name: '신청 작성 가이드' }))
    await screen.findByRole('heading', { level: 1, name: 'LLM API 신청과 키 발급' })
    await user.click(screen.getByRole('link', { name: '문서 본문으로 건너뛰기' }))
    expect(document.getElementById('guide-content')).toHaveFocus()
    await user.click(within(screen.getByRole('navigation', { name: '이전 다음 문서' })).getByRole('link', { name: '첫 호출과 도구 연결' }))
    const back = await screen.findByRole('link', { name: '콘솔로 돌아가기' })
    expect(back).toHaveClass('text-neutral-500', 'hover:bg-neutral-100')
    expect(back).not.toHaveClass('bg-primary-600', 'text-white')
    expect(back).toHaveAttribute('href', '/console/requests/new?kind=LLM_API_KEY&step=resource')
    await user.click(back)
    expect(await screen.findByLabelText('이름')).toHaveValue('이어 쓰는 신청')
    expect(screen.getByRole('navigation', { name: '콘솔 메뉴' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '문서 목차' })).not.toBeInTheDocument()
  })

  test('uses the shell hamburger for a numbered document contents list', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/docs/vm/connect')
    const user = userEvent.setup()
    await screen.findByRole('heading', { level: 1, name: '가상머신 접속과 파일 전송' })
    expect(screen.queryByRole('button', { name: '문서 목차' })).not.toBeInTheDocument()
    const contents = screen.getByRole('navigation', { name: '이 문서의 목차' })
    const list = within(contents).getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(list).toHaveClass('list-decimal', 'space-y-2')
    await user.click(screen.getByRole('button', { name: '메뉴 열기' }))
    const drawer = screen.getByRole('dialog', { name: '문서 목차' })
    expect(within(drawer).getByRole('searchbox', { name: '문서 검색' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('link', { name: '전체 리소스' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveFocus()
  })
})
