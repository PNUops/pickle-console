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

  test('7·30·90 numeric URL 선택과 세 축을 숨김없이 표시한다', async () => {
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
    expect(screen.getByRole('img', { name: '일별 입력·출력 토큰' })).toBeInTheDocument()

    const requestSummary = screen.getByText('날짜별 요청 수 표')
    requestSummary.focus()
    await user.keyboard('{Enter}')
    expect(requestSummary.closest('details')).toHaveAttribute('open')
    const requestTable = screen.getByRole('table', { name: '날짜별 요청 수' })
    expect(within(requestTable).getByRole('columnheader', { name: '날짜 (KST)' })).toBeInTheDocument()
    expect(within(requestTable).getByRole('columnheader', { name: '요청' })).toBeInTheDocument()
    const requestDay = within(requestTable).getByRole('rowheader', { name: '2026-08-31' }).closest('tr')!
    expect(within(requestDay).getByRole('cell', { name: '12건' })).toBeInTheDocument()

    const tokenSummary = screen.getByText('날짜별 입력·출력 토큰 표')
    tokenSummary.focus()
    await user.keyboard(' ')
    expect(tokenSummary.closest('details')).toHaveAttribute('open')
    const tokenTable = screen.getByRole('table', { name: '날짜별 입력·출력 토큰' })
    expect(within(tokenTable).getByRole('columnheader', { name: '입력 토큰' })).toBeInTheDocument()
    expect(within(tokenTable).getByRole('columnheader', { name: '출력 토큰' })).toBeInTheDocument()
    const tokenDay = within(tokenTable).getByRole('rowheader', { name: '2026-08-31' }).closest('tr')!
    expect(within(tokenDay).getByRole('cell', { name: '1,200' })).toBeInTheDocument()
    expect(within(tokenDay).getByRole('cell', { name: '400' })).toBeInTheDocument()
    // 정확한 개수를 유지한다 — 이 단언이 아니면 표가 하나 늘어난 것을 아무도 못 본다.
    // 다섯째는 「호출 분해」 카드의 기본 눈금(모델별)이다.
    expect(screen.getAllByRole('table')).toHaveLength(5)
    const modelTable = screen.getByRole('table', { name: '모델별 사용' })
    expect(modelTable).toBeInTheDocument()
    // 실패율은 비율이지 백분율이 아니다. 픽스처는 21건 중 1건 실패이므로 4.8%이고,
    // 100을 두 번 곱하면 476%가 나온다. 그 자리를 이 단언이 지킨다.
    const selfHosted = within(modelTable).getByText('pickle-general').closest('tr')!
    expect(within(selfHosted).getByText('4.8%')).toBeInTheDocument()
    // 자체 서빙 모델에는 금액이라는 것이 없다. $0.00이 아니라 —.
    expect(within(selfHosted).getByText('—')).toBeInTheDocument()
    // 금액을 아는 요청과 모르는 요청이 **완전한 두 행**으로 갈린다. 한 행에
    // 「2건 미상」이라고 적으면 모르는 쪽이 얼마쯤일지 추정할 토큰 수가 없다.
    const paidRows = within(modelTable).getAllByText('openai/gpt-5.6')
      .map((cell) => cell.closest('tr')!)
    expect(paidRows).toHaveLength(2)
    const [known, unknown] = paidRows
    // 둘은 언제나 붙어 있다 — 사이에 다른 모델이 끼면 합계로 정렬한 순위가 깨진다.
    expect(known.nextElementSibling).toBe(unknown)
    expect(within(known).getByText('4건')).toBeInTheDocument()
    expect(within(known).getByText('300 토큰')).toBeInTheDocument()
    expect(within(known).getByText('$0.1245')).toBeInTheDocument()
    expect(within(unknown).getByText('2건')).toBeInTheDocument()
    expect(within(unknown).getByText('150 토큰')).toBeInTheDocument()
    // 자체 서빙의 「—」와 다른 말이라야 한다. 저쪽은 금액이라는 것이 없고
    // 이쪽은 있어야 하는데 모른다.
    expect(within(unknown).getByText('정보 없음')).toBeInTheDocument()
    // 응답 시간은 각 행이 자기 요청의 값을 갖는다. 한 값을 되풀이하면 서로 다른
    // 요청 수를 갖고도 같은 응답 시간을 말하게 된다.
    expect(within(known).getByText('1,300ms')).toBeInTheDocument()
    expect(within(unknown).getByText('1,750ms')).toBeInTheDocument()
    expect(screen.getByText('일부 토큰은 추정값입니다')).toBeInTheDocument()
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
  test('기관→workspace→key drill-down이 scope와 days를 보존하고 마지막 단계가 키 상세로 나간다', async () => {
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
    // 종전에는 같은 행에 키 목록으로 가는 링크가 하나 더 있었다. 지웠다 — 이름을
    // 누르면 이 표가 그 워크스페이스의 키 행으로 바뀌고, 그 행이 키 상세로 간다.
    // 아래 단언이 그 경로를 그대로 지키므로 「키에 닿는다」는 불변식은 살아 있다.
    expect(screen.queryByRole('link', { name: /키 목록/ })).not.toBeInTheDocument()
    // 워크스페이스 행은 종류를 함께 말한다.
    expect(await screen.findByText(/\(팀\)/)).toBeInTheDocument()
    await user.click(workspace)

    const keyConsumers = (await screen.findByRole('heading', { name: '주요 소비처' })).closest('div')!
      .parentElement as HTMLElement
    expect(within(keyConsumers).getByRole('link', { name: 'capstone-chatbot' })).toHaveAttribute(
      'href',
      `/admin/llm/keys/${uuid(501)}?org=${uuid(1)}`,
    )
    // 좁힌 뒤 돌아오는 길이 있어야 한다는 것이 이 단언이 지키던 것이다. 그 길이
    // 헤더의 링크에서 선택기 옆 버튼으로 바뀌었으므로 불변식을 그쪽에 다시 세운다.
    expect(screen.getByRole('combobox', { name: 'LLM 사용량 워크스페이스 필터' }))
      .toHaveValue(uuid(12))
    const back = screen.getByRole('button', { name: '기관 전체로' })
    await user.click(back)
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'LLM 사용량 워크스페이스 필터' }))
        .toHaveValue(''))
    expect(await screen.findByRole('heading', { name: '주요 소비처' })).toBeInTheDocument()
  })

  test('워크스페이스를 골라 이 화면 전체를 그 범위로 좁힌다', async () => {
    // 종전에는 「주요 소비처」 표에서 이름을 눌러야만 이 범위에 닿았고, 같은 행의
    // 마지막 열은 다른 화면으로 갔다. 수업 하나를 보는 것이 흔한 동작이면 그것이
    // 표를 뒤지는 일이어서는 안 된다.
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/llm/usage?org=${uuid(1)}`)

    const picker = await screen.findByRole('combobox', {
      name: 'LLM 사용량 워크스페이스 필터',
    })
    expect(picker).toHaveValue('')
    // 목록이 도착하기 전에는 「기관 전체」 하나뿐이다.
    await screen.findByRole('option', { name: '캡스톤 3조' })
    await user.selectOptions(picker, uuid(12))

    // 좁혀진 범위로 서버에 다시 물었는지를 요청으로 센다. 선택기가 눌린 것만으로는
    // 화면이 그 범위를 읽었다는 뜻이 아니다.
    await waitFor(() =>
      expect(adminLlmUsageQueries.some((query) => query.includes(`workspaceId=${uuid(12)}`)))
        .toBe(true))
    expect(await screen.findByRole('heading', { name: '호출 분해' })).toBeInTheDocument()
  })

  test('금액 칸이 값을 그리고, 빠진 건수를 유료 요청에서만 센다', async () => {
    // 두 가지를 한꺼번에 지킨다. 하나는 금액이 응답에 있는데 화면에 없던 결함이
    // 되살아나지 않는 것이고(그 자리를 보는 시험이 종전에는 하나도 없었다), 다른
    // 하나는 「N건 미상」의 분모다. 전체 요청에서 빼면 자체 서빙 요청이 전부
    // 「금액을 모르는 요청」이 되는데, 자체 서빙에는 알아낼 금액이 없다.
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/llm/usage')

    const consumers = await screen.findByRole('table', { name: 'LLM 주요 소비처' })
    // 유료만 쓴 기관: 여섯 건 전부 유료 축인데 넷에만 금액이 붙었다.
    const paidOrg = within(consumers).getByText('테스트 기관').closest('tr')!
    expect(within(paidOrg).getByText('$0.1245 (2건 미상)')).toBeInTheDocument()
    // 자체 서빙만 쓴 기관: 스물한 건 전부인데 미상은 한 건도 아니다.
    const selfHostedOrg = within(consumers)
      .getByText('정보컴퓨터공학부 실습지원센터').closest('tr')!
    expect(within(selfHostedOrg).getByText('—')).toBeInTheDocument()
    expect(within(selfHostedOrg).queryByText(/미상/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '호출 종류별' }))
    const kinds = await screen.findByRole('table', { name: '호출 종류별 사용' })
    // 채팅은 스물한 건이지만 유료로 나간 것은 셋이고 그중 둘에 금액이 붙었다.
    const chat = within(kinds).getByText('채팅').closest('tr')!
    expect(within(chat).getByText('21건')).toBeInTheDocument()
    expect(within(chat).getByText('$0.0623 (1건 미상)')).toBeInTheDocument()
    // 경로가 기록되기 전의 요청에는 유료 축이 없다.
    const unknown = within(kinds).getByText('종류 미상').closest('tr')!
    expect(within(unknown).getByText('—')).toBeInTheDocument()
    expect(within(unknown).queryByText(/미상 \(/)).not.toBeInTheDocument()
  })

  test('actual exhaustion만 danger이고 exact 5 reasons·null/0·deep link를 보존한다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/llm/usage')

    const actual = (await screen.findByRole('link', { name: 'capstone-chatbot' })).closest('tr')!
    expect(within(actual).getByText('실제 소진 확인')).toBeInTheDocument()
    expect(within(actual).getByText('자체 서빙 90,000 토큰')).toBeInTheDocument()
    expect(within(actual).getByText('종류 미상 1,000 토큰')).toBeInTheDocument()
    expect(within(actual).getByText('사용 $0.00')).toBeInTheDocument()
    expect(within(actual).getByText('잔여 $10.00')).toBeInTheDocument()
    expect(actual.querySelector('time[datetime="2026-08-31T12:00:00+09:00"]')).not.toBeNull()
    expect(within(actual).getByText('일일 토큰 한도 소진 2건')).toBeInTheDocument()
    expect(within(actual).getByText('금액 한도 소진 1건')).toBeInTheDocument()
    expect(within(actual).getByText('분당 요청 수 한도 3건')).toBeInTheDocument()
    expect(within(actual).getByText('분당 토큰 한도 4건')).toBeInTheDocument()
    expect(within(actual).getByText('동시 요청 한도 5건')).toBeInTheDocument()
    expect(within(actual).getByRole('link', { name: 'AI 교육 사업 A' })).toHaveAttribute(
      'href',
      `/admin/llm/accounts/${uuid(410)}`,
    )

    const rateOnly = screen.getByRole('link', { name: 'batch-summarizer' }).closest('tr')!
    expect(within(rateOnly).getByText('한도 압력')).toBeInTheDocument()
    expect(within(rateOnly).queryByText('실제 소진 확인')).not.toBeInTheDocument()
    expect(within(rateOnly).getByText('사용 확인 전')).toBeInTheDocument()
    expect(within(rateOnly).getByText('종류 미상 0 토큰')).toBeInTheDocument()
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
