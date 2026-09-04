import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import type { AdminLlmUsage } from '../api/queries'
import {
  orgAdminUser,
  orgManagerUser,
  orgViewerUser,
  refreshSuccessHandler,
  regularUser,
  sysAdminUser,
  sysManagerUser,
  sysViewerUser,
} from '../test/msw/handlers/auth'
import {
  adminLlmUsageFixture,
  adminLlmUsageQueries,
} from '../test/msw/handlers/llm-admin-usage'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

const readerCases = [
  ['ORG_VIEWER', 'access-org-viewer', orgViewerUser],
  ['ORG_MANAGER', 'access-org-manager', orgManagerUser],
  ['ORG_ADMIN', 'access-org-admin', orgAdminUser],
  ['SYS_VIEWER', 'access-sys-viewer', sysViewerUser],
  ['SYS_MANAGER', 'access-sys-manager', sysManagerUser],
  ['SYS_ADMIN', 'access-sys-admin', sysAdminUser],
] as const

describe('관리자 LLM 사용량 route와 수요 추이', () => {
  test.each(readerCases)('%s가 같은 read-only 화면을 읽는다', async (_role, token, user) => {
    server.use(refreshSuccessHandler(token, user))
    const view = renderApp('/admin/llm/usage')

    expect(await screen.findByRole('heading', { name: 'LLM 사용량', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '수요 추이' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: '관리자 메뉴' })
    expect(within(nav).getByRole('link', { name: 'LLM 사용량' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /수정|삭제|저장/ })).not.toBeInTheDocument()
    view.unmount()
  })

  test('USER는 관리자 route를 상속받지 않고 사용자 콘솔로 돌아간다', async () => {
    server.use(refreshSuccessHandler('access-user', regularUser))
    renderApp('/admin/llm/usage')

    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
    await waitFor(() => expect(currentPath()).toBe('/console'))
  })

  test('7·30·90 numeric URL 선택과 TOKEN·CREDIT·UNKNOWN을 숨김없이 표시한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/llm/usage')

    expect(await screen.findByText('최근 7일')).toBeInTheDocument()
    expect(screen.getByText('최근 30일')).toBeInTheDocument()
    expect(screen.getByText('최근 90일')).toBeInTheDocument()
    expect(screen.getByText('18건 · 66.7%')).toBeInTheDocument()
    expect(screen.getByText('6건 · 22.2%')).toBeInTheDocument()
    expect(screen.getAllByText('3건 · 11.1%').length).toBeGreaterThan(0)
    expect(screen.getByText('88.9%')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: '일별 요청 수' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '일별 입력·출력 token' })).toBeInTheDocument()

    const requestSummary = screen.getByText('날짜별 요청 수 표')
    requestSummary.focus()
    await user.keyboard('{Enter}')
    expect(requestSummary.closest('details')).toHaveAttribute('open')
    const requestTable = screen.getByRole('table', { name: '날짜별 요청 수' })
    expect(within(requestTable).getByRole('columnheader', { name: '날짜 (KST)' })).toBeInTheDocument()
    expect(within(requestTable).getByRole('columnheader', { name: '요청' })).toBeInTheDocument()
    const requestDay = within(requestTable).getByRole('rowheader', { name: '2026-08-31' }).closest('tr')!
    expect(within(requestDay).getByRole('cell', { name: '12건' })).toBeInTheDocument()

    const tokenSummary = screen.getByText('날짜별 입력·출력 token 표')
    tokenSummary.focus()
    await user.keyboard(' ')
    expect(tokenSummary.closest('details')).toHaveAttribute('open')
    const tokenTable = screen.getByRole('table', { name: '날짜별 입력·출력 token' })
    expect(within(tokenTable).getByRole('columnheader', { name: '입력 token' })).toBeInTheDocument()
    expect(within(tokenTable).getByRole('columnheader', { name: '출력 token' })).toBeInTheDocument()
    const tokenDay = within(tokenTable).getByRole('rowheader', { name: '2026-08-31' }).closest('tr')!
    expect(within(tokenDay).getByRole('cell', { name: '1,200' })).toBeInTheDocument()
    expect(within(tokenDay).getByRole('cell', { name: '400' })).toBeInTheDocument()
    expect(screen.getAllByRole('table')).toHaveLength(4)
    expect(screen.getByText('일부 token은 추정값입니다')).toBeInTheDocument()
    expect(adminLlmUsageQueries.some((query) => query.includes('days=7') && query.includes('top=20'))).toBe(true)

    const thirty = screen.getByRole('button', { name: '30일' })
    thirty.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(currentPath()).toBe('/admin/llm/usage?days=30'))
    await waitFor(() => expect(adminLlmUsageQueries.some((query) => query.includes('days=30'))).toBe(true))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '30일' })).toHaveAttribute('aria-pressed', 'true')
    })

    await user.click(screen.getByRole('button', { name: '90일' }))
    await waitFor(() => expect(adminLlmUsageQueries.some((query) => query.includes('days=90'))).toBe(true))
    expect(screen.getByRole('button', { name: '90일' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.body).not.toHaveTextContent(/leaderboard|모델 순위|금액 추이|key 생성 추이|retry|fallback|TTFT/i)
  })
})

describe('관리자 LLM 사용량 소비처와 한도 검토', () => {
  test('기관→workspace→key drill-down과 filtered key 목록 link가 scope와 days를 보존한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/llm/usage?days=30')

    const org = await screen.findByRole('link', { name: '정보컴퓨터공학부 실습지원센터' })
    expect(org).toHaveAttribute('href', `/admin/llm/usage?days=30&org=${uuid(1)}`)
    const consumers = screen.getByRole('heading', { name: '주요 소비처' }).closest('div')!
      .parentElement as HTMLElement
    expect(within(consumers).getByText(/상위 2개만 표시합니다/)).toBeInTheDocument()
    await user.click(org)

    const workspace = await screen.findByRole('link', { name: '캡스톤 3조' })
    expect(workspace).toHaveAttribute(
      'href',
      `/admin/llm/usage?workspaceId=${uuid(12)}&days=30&org=${uuid(1)}`,
    )
    expect(screen.getByRole('link', { name: '필터된 key 목록' })).toHaveAttribute(
      'href',
      `/admin/llm/keys?workspaceId=${uuid(12)}&org=${uuid(1)}`,
    )
    await user.click(workspace)

    const keyConsumers = (await screen.findByRole('heading', { name: '주요 소비처' })).closest('div')!
      .parentElement as HTMLElement
    expect(within(keyConsumers).getByRole('link', { name: 'capstone-chatbot' })).toHaveAttribute(
      'href',
      `/admin/llm/keys/${uuid(501)}?org=${uuid(1)}`,
    )
    expect(screen.getByRole('link', { name: '전체 소비처로 돌아가기' })).toHaveAttribute(
      'href',
      `/admin/llm/usage?days=30&org=${uuid(1)}`,
    )
  })

  test('actual exhaustion만 danger이고 exact 5 reasons·null/0·deep link를 보존한다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/llm/usage')

    const actual = (await screen.findByRole('link', { name: 'capstone-chatbot' })).closest('tr')!
    expect(within(actual).getByText('실제 소진 확인')).toBeInTheDocument()
    expect(within(actual).getByText('TOKEN 90,000 token')).toBeInTheDocument()
    expect(within(actual).getByText('UNKNOWN 1,000 token')).toBeInTheDocument()
    expect(within(actual).getByText('사용 $0.00')).toBeInTheDocument()
    expect(within(actual).getByText('잔여 $10.00')).toBeInTheDocument()
    expect(actual.querySelector('time[datetime="2026-08-31T12:00:00+09:00"]')).not.toBeNull()
    expect(within(actual).getByText('일일 token 한도 소진 2건')).toBeInTheDocument()
    expect(within(actual).getByText('금액 한도 소진 1건')).toBeInTheDocument()
    expect(within(actual).getByText('분당 요청 수 한도 3건')).toBeInTheDocument()
    expect(within(actual).getByText('분당 token 한도 4건')).toBeInTheDocument()
    expect(within(actual).getByText('동시 요청 한도 5건')).toBeInTheDocument()
    expect(within(actual).getByRole('link', { name: 'AI 교육 사업 A' })).toHaveAttribute(
      'href',
      `/admin/llm/accounts/${uuid(410)}`,
    )

    const rateOnly = screen.getByRole('link', { name: 'batch-summarizer' }).closest('tr')!
    expect(within(rateOnly).getByText('한도 압력')).toBeInTheDocument()
    expect(within(rateOnly).queryByText('실제 소진 확인')).not.toBeInTheDocument()
    expect(within(rateOnly).getByText('사용 확인 전')).toBeInTheDocument()
    expect(within(rateOnly).getByText('UNKNOWN 0 token')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('server_busy')
    expect(document.body).not.toHaveTextContent('80%')
    expect(screen.getByText(/4개 중 상위 2개만 표시합니다/)).toBeInTheDocument()
  })
})

describe('관리자 LLM 사용량 신뢰도와 상태 처리', () => {
  test('ORG에는 source 신선도만 보이고 SYS queue/loss DOM은 만들지 않는다', async () => {
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp('/admin/llm/usage')

    expect(await screen.findByRole('heading', { name: '데이터 신선도·신뢰도' })).toBeInTheDocument()
    expect(screen.getByText('1 / 2개')).toBeInTheDocument()
    expect(document.querySelectorAll('time[datetime="2026-08-31T12:05:00+09:00"]').length)
      .toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'LLM 서비스 상태 보기' })).toHaveAttribute(
      'href',
      `/admin/llm/status?org=${uuid(1)}`,
    )
    expect(screen.queryByRole('heading', { name: '사용량 전달 진단' })).not.toBeInTheDocument()
    expect(screen.queryByText('전송 대기 기록')).not.toBeInTheDocument()
    expect(screen.queryByText('사용량 전송 실패')).not.toBeInTheDocument()
    expect(screen.queryByText('어느 키인지 모르는 요청')).not.toBeInTheDocument()
  })

  test('SYS는 nonnull queue/loss와 실제 0을 숨기지 않는다', async () => {
    server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser))
    renderApp('/admin/llm/usage')

    const diagnostics = await screen.findByRole('heading', { name: '사용량 전달 진단' })
    const card = diagnostics.closest('div')!.parentElement as HTMLElement
    expect(within(card).getByText('전송 대기 기록').closest('div')).toHaveTextContent('0건')
    expect(within(card).getByText('전송 대기 용량').closest('div')).toHaveTextContent('0 B')
    expect(within(card).getByText('게이트웨이 저장 실패').closest('div')).toHaveTextContent('0회')
    expect(within(card).getByText('사용량 전송 실패').closest('div')).toHaveTextContent('2회')
    expect(within(card).getByText('어느 키인지 모르는 요청').closest('div')).toHaveTextContent('0건')
  })

  test('scope 변경 대기 중 직전 기관 응답을 한 frame도 렌더하지 않는다', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const secondReady = new Promise<void>((resolve) => { release = resolve })
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/usage', async ({ request }) => {
        const orgId = new URL(request.url).searchParams.get('orgId')
        if (orgId === uuid(2)) await secondReady
        const body = adminLlmUsageFixture({ orgId, systemTier: true })
        body.consumers.items[0] = {
          ...body.consumers.items[0],
          workspaceName: orgId === uuid(2) ? '두 번째 기관 workspace' : '첫 번째 기관 workspace',
        }
        return HttpResponse.json(body)
      }),
    )
    renderApp(`/admin/llm/usage?org=${uuid(1)}`)

    expect(await screen.findByText('첫 번째 기관 workspace')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
    await waitFor(() => {
      expect(screen.queryByText('첫 번째 기관 workspace')).not.toBeInTheDocument()
      expect(screen.getByText('LLM 사용량 불러오는 중')).toBeInTheDocument()
    })
    release()
    expect(await screen.findByText('두 번째 기관 workspace')).toBeInTheDocument()
  })

  test('empty와 API error를 각각 명시한다', async () => {
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/usage', () => {
        const body: AdminLlmUsage = adminLlmUsageFixture()
        body.demand.windows = body.demand.windows.map((window) => ({
          ...window,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedRequests: 0,
          tokenAxisRequests: 0,
          creditAxisRequests: 0,
          unknownAxisRequests: 0,
          axisCoverage: null,
        }))
        body.demand.daily = body.demand.daily.map((point) => ({
          ...point,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedRequests: 0,
          tokenAxisRequests: 0,
          creditAxisRequests: 0,
          unknownAxisRequests: 0,
          axisCoverage: null,
        }))
        body.consumers = { level: 'ORG', items: [], totalItems: 0, truncated: false }
        body.limitReview = { items: [], totalItems: 0, truncated: false }
        body.quality = { ...body.quality, totalRequests: 0, totalTokens: 0, estimatedRequests: 0,
          estimatedRequestRatio: null, estimatedTokens: 0, estimatedTokenRatio: null }
        return HttpResponse.json(body)
      }),
    )
    const empty = renderApp('/admin/llm/usage')
    expect(await screen.findByRole('heading', { name: '선택 기간에 LLM 요청이 없습니다' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '표시할 소비처가 없습니다' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '검토할 한도가 없습니다' })).toBeInTheDocument()
    empty.unmount()

    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/usage', () =>
        HttpResponse.json(
          { title: '오류', status: 500, detail: '사용량 조회 실패', code: 'INTERNAL_ERROR' },
          { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    renderApp('/admin/llm/usage')
    expect(await screen.findByRole('alert')).toHaveTextContent('사용량 조회 실패')
  })
})
