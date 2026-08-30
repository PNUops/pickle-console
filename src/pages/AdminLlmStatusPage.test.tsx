import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import type { AdminLlmMetrics, AdminLlmStatus, LlmUpstreamStatus } from '../api/queries'
import {
  orgViewerUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { llmStatusFixture } from '../test/msw/handlers/llm-observability'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

function statusUpstream(name: string, ref: string): LlmUpstreamStatus {
  return {
    id: uuid(ref === 'org-one' ? 401 : 402),
    ref,
    name,
    kind: 'ON_PREM',
    orgId: ref === 'org-one' ? uuid(1) : uuid(2),
    dedicated: true,
    enabled: true,
    configured: true,
    reportState: 'OK',
    availability: 'HEALTHY',
    lastReportedAt: '2026-08-30T18:20:00+09:00',
    passive: {
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureType: null,
      consecutiveFailures: 0,
      cooldownUntil: null,
    },
    active: {
      lastAttemptAt: '2026-08-30T18:20:00+09:00',
      lastSuccessAt: '2026-08-30T18:20:00+09:00',
      lastFailureAt: null,
      status: 'OK',
      intervalSeconds: 60,
      stale: false,
      failureType: null,
      latencyMs: 20,
      modelCount: 1,
      consecutiveFailures: 0,
    },
    catalog: {
      status: 'MATCH',
      expectedModelCount: 1,
      missingModelCount: 0,
      unexpectedModelCount: 0,
      missingPublicModels: [],
    },
  }
}

describe('관리자 LLM 서비스 상태', () => {
  test('ORG_VIEWER는 기관 범위의 평문 상태를 읽고 내부 진단과 action은 보지 않는다', async () => {
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp('/admin/llm/status')

    expect(await screen.findByRole('heading', { name: 'LLM 서비스', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Pickle 자체 서빙')).toBeInTheDocument()
    const openRouter = screen.getByText('OpenRouter').closest('tr') as HTMLElement
    expect(within(openRouter).getByText('주의')).toBeInTheDocument()
    expect(within(openRouter).getByText('비교 대상 아님')).toBeInTheDocument()
    expect(within(openRouter).queryByText(/누락|추가|예상/)).not.toBeInTheDocument()
    expect(screen.getByText('자동 연결 확인')).toBeInTheDocument()
    expect(screen.getByText('도달함 · 인증 미확인')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '요청 처리 연결' })).toBeInTheDocument()
    expect(screen.getByText('마지막 상태 보고')).toBeInTheDocument()
    expect(screen.getByText('사용량 전송 관측')).toBeInTheDocument()
    expect(screen.getByText('최근 확인됨')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'LLM Gateway' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Gateway/)).not.toBeInTheDocument()
    expect(screen.queryByText('pickle-onprem')).not.toBeInTheDocument()
    expect(screen.queryByText('openrouter')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '사용량 전달 상태' })).not.toBeInTheDocument()
    expect(screen.queryByText('HTTP_401')).not.toBeInTheDocument()
    expect(screen.queryByText('설정 반영')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /수정|삭제|재시작|즉시|probe/i }),
    ).not.toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: '관리자 메뉴' })
    expect(within(nav).getByRole('link', { name: 'LLM 서비스' })).toHaveAttribute(
      'href',
      `/admin/llm/status?org=${uuid(1)}`,
    )
  })

  test('SYS 계층에는 raw ref와 pipeline 진단을 보이되 상태 축을 합치지 않는다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/llm/status')

    expect(await screen.findByText('pickle-onprem')).toBeInTheDocument()
    expect(screen.getByText('openrouter')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '사용량 전달 상태' })).toBeInTheDocument()
    expect(screen.getByText('Active probe')).toBeInTheDocument()
    expect(screen.getByText('Passive 요청')).toBeInTheDocument()
    expect(screen.getByText('Catalog')).toBeInTheDocument()
    expect(screen.getByText('문서 지원 형식')).toBeInTheDocument()
    expect(screen.getByText('Gateway 현재 프로세스 누적 진단 counter')).toBeInTheDocument()
    expect(screen.getByText('Queue 마지막 관측')).toBeInTheDocument()
    expect(screen.getByText('Queue 확인 실패')).toBeInTheDocument()
    expect(screen.getByText('본문 수집 누락')).toBeInTheDocument()
    expect(screen.queryByText(/uptime/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ttft/i)).not.toBeInTheDocument()
  })

  test('기관 scope 변경 중에는 직전 기관 응답을 재사용하지 않는다', async () => {
    const user = userEvent.setup()
    let releaseSecond!: () => void
    const secondReady = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/status', async ({ request }) => {
        const orgId = new URL(request.url).searchParams.get('orgId')
        if (orgId === uuid(2)) await secondReady
        const body: AdminLlmStatus = {
          ...llmStatusFixture,
          upstreams: [
            orgId === uuid(2)
              ? statusUpstream('두 번째 기관 서비스', 'org-two')
              : statusUpstream('첫 번째 기관 서비스', 'org-one'),
          ],
        }
        return HttpResponse.json(body)
      }),
    )
    renderApp(`/admin/llm/status?org=${uuid(1)}`)

    expect(await screen.findByText('첫 번째 기관 서비스')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))

    await waitFor(() => {
      expect(screen.queryByText('첫 번째 기관 서비스')).not.toBeInTheDocument()
      expect(screen.getByText('LLM 서비스 정보 불러오는 중')).toBeInTheDocument()
    })
    releaseSecond()
    expect(await screen.findByText('두 번째 기관 서비스')).toBeInTheDocument()
  })

  test('기관에 전용 upstream이 없어도 아직 요청하지 않았다는 뜻으로 단정하지 않는다', async () => {
    server.use(
      refreshSuccessHandler('access-org-viewer', orgViewerUser),
      http.get('*/api/v1/admin/llm/status', () =>
        HttpResponse.json({ ...llmStatusFixture, upstreams: [] }),
      ),
    )
    renderApp('/admin/llm/status')

    expect(await screen.findByRole('heading', { name: '표시할 LLM 서비스가 없습니다' })).toBeInTheDocument()
    expect(
      screen.getByText('선택한 기관이 소유하거나 연결된 공용 서비스가 없습니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/실제 요청에 사용/)).not.toBeInTheDocument()
  })

  test('이전 Gateway가 새 진단 counter를 보고하지 않아도 0으로 꾸미지 않는다', async () => {
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/status', () =>
        HttpResponse.json({
          ...llmStatusFixture,
          gateway: {
            ...llmStatusFixture.gateway,
            rejectedEntries: null,
            reloadFailures: null,
            bodiesDropped: null,
            usageShipFailures: null,
            spoolWriteFailures: null,
            queuedUsageEvents: null,
            queuedUsageBytes: null,
            usageQueueObservedAt: null,
            usageQueueReportState: 'NOT_REPORTED',
            usageQueueScanFailures: null,
          },
          upstreams: [],
        }),
      ),
    )
    renderApp('/admin/llm/status')

    expect(
      await screen.findByText('Gateway 현재 프로세스 누적 진단 counter'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('미보고').length).toBeGreaterThanOrEqual(6)
  })

  test('플랫폼 미등록 upstream의 registry flag를 false로 단정하지 않는다', async () => {
    const unregistered: LlmUpstreamStatus = {
      ...statusUpstream('Gateway에서만 발견', 'runtime-only'),
      id: null,
      kind: null,
      orgId: null,
      dedicated: null,
      enabled: null,
      reportState: 'UNREGISTERED',
    }
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/status', () =>
        HttpResponse.json({ ...llmStatusFixture, upstreams: [unregistered] }),
      ),
    )
    renderApp('/admin/llm/status')

    expect(await screen.findByText('Gateway에서만 발견')).toBeInTheDocument()
    expect(screen.getByText('플랫폼에 미등록')).toBeInTheDocument()
    expect(screen.queryByText(/운영 중지/)).not.toBeInTheDocument()
  })

  test('Queue scan 실패 뒤의 보존 수치를 현재의 빈 queue처럼 표시하지 않는다', async () => {
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/status', () =>
        HttpResponse.json({
          ...llmStatusFixture,
          gateway: {
            ...llmStatusFixture.gateway,
            usageQueueObservedAt: '2026-08-29T18:00:00+09:00',
            usageQueueReportState: 'STALE',
            usageQueueScanFailures: 2,
            queuedUsageEvents: 0,
            queuedUsageBytes: 0,
          },
          upstreams: [],
        }),
      ),
    )
    renderApp('/admin/llm/status')

    expect(await screen.findByText('Queue 상태를 현재 값으로 확인할 수 없습니다')).toBeInTheDocument()
    expect(screen.getByText('0건 · 0 B')).toBeInTheDocument()
    expect(screen.getByText('마지막 관측 기준')).toBeInTheDocument()
    expect(screen.getByText(/0건으로 보여도 지금 queue가 비어 있다는 뜻은 아닙니다/)).toBeInTheDocument()
    const counters = screen.getByRole('table', {
      name: 'Gateway 현재 프로세스 누적 진단 counter',
    })
    expect(within(counters).getAllByRole('cell')[2]).toHaveTextContent('2회')
  })

  test('과거 scan 실패 뒤 최근 관측이 성공하면 누적 counter만 남기고 현재 경고는 지운다', async () => {
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/status', () =>
        HttpResponse.json({
          ...llmStatusFixture,
          gateway: {
            ...llmStatusFixture.gateway,
            usageQueueObservedAt: new Date().toISOString(),
            usageQueueReportState: 'FRESH',
            usageQueueScanFailures: 2,
            queuedUsageEvents: 0,
            queuedUsageBytes: 0,
          },
          upstreams: [],
        }),
      ),
    )
    renderApp('/admin/llm/status')

    expect(await screen.findByText('0건 · 0 B')).toBeInTheDocument()
    expect(screen.queryByText('Queue 상태를 현재 값으로 확인할 수 없습니다')).not.toBeInTheDocument()
    expect(screen.queryByText('마지막 관측 기준')).not.toBeInTheDocument()
    const counters = screen.getByRole('table', {
      name: 'Gateway 현재 프로세스 누적 진단 counter',
    })
    expect(within(counters).getAllByRole('cell')[2]).toHaveTextContent('2회')
  })

  test('오래된 probe 성공을 현재 정상으로 재생하지 않고 원래 cadence를 표시한다', async () => {
    const replayed = statusUpstream('오래된 probe 서비스', 'stale-probe')
    replayed.active = {
      ...replayed.active,
      status: 'OK',
      intervalSeconds: 60,
      stale: true,
      lastAttemptAt: '2026-08-29T18:00:00+09:00',
      lastSuccessAt: '2026-08-29T18:00:00+09:00',
    }
    replayed.availability = 'UNKNOWN'
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/status', () =>
        HttpResponse.json({ ...llmStatusFixture, upstreams: [replayed] }),
      ),
    )
    renderApp('/admin/llm/status')

    const row = (await screen.findByText('오래된 probe 서비스')).closest('tr') as HTMLElement
    expect(within(row).getByText('확인되지 않음')).toBeInTheDocument()
    expect(within(row).getByText('마지막 연결 확인 성공 · 관측 기한 지남')).toBeInTheDocument()
    expect(within(row).getByText(/60초 주기/)).toBeInTheDocument()
    expect(within(row).getByText('2026-08-29 18:00 KST')).toBeInTheDocument()
    expect(within(row).queryByText('연결 확인 성공')).not.toBeInTheDocument()
  })

  test('key-local 요청 시도를 upstream 성공이나 최신 실패 시각으로 오인하지 않는다', async () => {
    const localOnly = statusUpstream('로컬 거절 서비스', 'local-only')
    localOnly.passive = {
      ...localOnly.passive,
      lastAttemptAt: '2026-08-30T18:10:00+09:00',
    }
    const oldFailure = statusUpstream('과거 실패 서비스', 'old-failure')
    oldFailure.passive = {
      ...oldFailure.passive,
      lastAttemptAt: '2026-08-30T18:10:00+09:00',
      lastFailureAt: '2026-08-28T18:00:00+09:00',
      lastFailureType: 'UPSTREAM_TIMEOUT',
      consecutiveFailures: 1,
    }
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/status', () =>
        HttpResponse.json({ ...llmStatusFixture, upstreams: [localOnly, oldFailure] }),
      ),
    )
    renderApp('/admin/llm/status')

    const localRow = (await screen.findByText('로컬 거절 서비스')).closest('tr') as HTMLElement
    expect(within(localRow).getByText('가용성 판정 기록 없음')).toBeInTheDocument()
    expect(within(localRow).queryByText('최근 요청 성공')).not.toBeInTheDocument()
    expect(within(localRow).getByTitle('2026-08-30 18:10 KST')).toHaveTextContent(
      '마지막 요청 시도',
    )
    expect(within(localRow).getByText('2026-08-30 18:10 KST')).toBeInTheDocument()

    const failureRow = screen.getByText('과거 실패 서비스').closest('tr') as HTMLElement
    expect(within(failureRow).getByText('최근 요청 실패')).toBeInTheDocument()
    expect(within(failureRow).getByTitle('2026-08-28 18:00 KST')).toHaveTextContent(
      '가용성 결과',
    )
    expect(within(failureRow).getByText('2026-08-28 18:00 KST')).toBeInTheDocument()
    expect(within(failureRow).getByTitle('2026-08-30 18:10 KST')).toHaveTextContent(
      '마지막 요청 시도',
    )
    expect(within(failureRow).getByText('2026-08-30 18:10 KST')).toBeInTheDocument()
  })

  test('기관 화면은 catalog 차이 개수만 보이고 누락 모델 이름은 렌더하지 않는다', async () => {
    const mismatch = statusUpstream('기관 catalog 서비스', 'org-catalog')
    mismatch.catalog = {
      status: 'MISMATCH',
      expectedModelCount: 3,
      missingModelCount: 1,
      unexpectedModelCount: 2,
      // API도 기관 응답에서 지우지만 UI가 이름을 기대하지 않는지 방어적으로 확인한다.
      missingPublicModels: ['restricted-secret-model'],
    }
    server.use(
      refreshSuccessHandler('access-org-viewer', orgViewerUser),
      http.get('*/api/v1/admin/llm/status', () =>
        HttpResponse.json({ ...llmStatusFixture, upstreams: [mismatch] }),
      ),
    )
    renderApp('/admin/llm/status')

    expect(await screen.findByText(/누락 1개 · 추가 2개 \/ 예상 3개/)).toBeInTheDocument()
    expect(screen.queryByText('restricted-secret-model')).not.toBeInTheDocument()
  })
})

describe('관리자 LLM 서비스 지표', () => {
  test('탭 query가 기관 scope를 보존하고 최종 처리 기준을 정확히 설명한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/llm/status?org=${uuid(1)}`)

    const tabs = await screen.findByRole('tablist', { name: 'LLM 서비스 화면' })
    const statusTab = within(tabs).getByRole('tab', { name: '상태' })
    const metricsTab = within(tabs).getByRole('tab', { name: '지표' })
    expect(statusTab).toHaveAttribute('aria-selected', 'true')
    expect(statusTab).toHaveAttribute('aria-controls', 'tabpanel-status')

    await user.click(metricsTab)
    await waitFor(() => expect(currentPath()).toBe(`/admin/llm/status?org=${uuid(1)}&tab=metrics`))
    expect(await screen.findByText('Upstream 귀속 범위')).toBeInTheDocument()
    expect(screen.getByText('최종 결과 timeout·upstream error')).toBeInTheDocument()
    expect(screen.getByText('성공 요청 end-to-end 지연')).toBeInTheDocument()
    expect(screen.getByText(/중간 시도의 서비스와 retry·fallback 경로는/)).toBeInTheDocument()
    expect(screen.getByText('Gateway 처리 여유 부족')).toBeInTheDocument()
    expect(screen.queryByText(/uptime/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ttft/i)).not.toBeInTheDocument()

    await user.click(statusTab)
    await waitFor(() => expect(currentPath()).toBe(`/admin/llm/status?org=${uuid(1)}`))
  })

  test('기관 계층 지표는 raw code와 ref 없이 같은 기관 요청만 설명한다', async () => {
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp('/admin/llm/status?tab=metrics')

    expect(await screen.findByText('처리 서비스 확인 범위')).toBeInTheDocument()
    expect(screen.getByText('수신 요청 기록')).toBeInTheDocument()
    expect(screen.getByText('시간 초과·서비스 오류')).toBeInTheDocument()
    expect(screen.getByText('성공 요청 응답 시간')).toBeInTheDocument()
    expect(screen.getByText('일일 토큰 한도 초과')).toBeInTheDocument()
    expect(screen.queryByText('quota_exhausted')).not.toBeInTheDocument()
    expect(screen.queryByText('pickle-onprem')).not.toBeInTheDocument()
    expect(screen.getByText('Pickle 자체 서빙')).toBeInTheDocument()
    expect(screen.getByText('서비스 처리 여유 부족')).toBeInTheDocument()
  })

  test('빈 지표와 API 오류를 각각 명시한다', async () => {
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/metrics', () =>
        HttpResponse.json({
          from: '2026-08-24T00:00:00+09:00',
          to: '2026-08-31T00:00:00+09:00',
          totalEvents: 0,
          attributedEvents: 0,
          attributionCoverage: 0,
          attemptsKnownEvents: 0,
          attemptCoverage: 0,
          estimatedEvents: 0,
          estimatedCoverage: 0,
          upstreams: [],
          localRejections: [],
        }),
      ),
    )
    const empty = renderApp('/admin/llm/status?tab=metrics')
    expect(await screen.findByRole('heading', { name: '집계할 upstream 요청이 없습니다' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '로컬 거절이 없습니다' })).toBeInTheDocument()
    expect(screen.getAllByText('표본 없음')).toHaveLength(3)
    expect(screen.queryByText('일부 지표에는 해석 범위가 있습니다')).not.toBeInTheDocument()
    empty.unmount()

    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/status', () =>
        HttpResponse.json(
          { title: '오류', status: 500, detail: '상태 조회 실패', code: 'INTERNAL_ERROR' },
          { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    renderApp('/admin/llm/status')
    expect(await screen.findByRole('alert')).toHaveTextContent('상태 조회 실패')
  })

  test('귀속된 RATE_LIMITED 결과를 timeout·upstream error에 합치지 않고 0회 시도 표본을 숨긴다', async () => {
    const metrics: AdminLlmMetrics = {
      from: '2026-08-24T00:00:00+09:00',
      to: '2026-08-31T00:00:00+09:00',
      totalEvents: 3,
      attributedEvents: 3,
      attributionCoverage: 1,
      attemptsKnownEvents: 0,
      attemptCoverage: 0,
      estimatedEvents: 0,
      estimatedCoverage: 0,
      upstreams: [
        {
          id: uuid(501),
          ref: 'rate-limited-upstream',
          name: 'Rate limited 서비스',
          // 성공 1 + timeout 1 + attributed RATE_LIMITED 1. 좁은 오류 열은 1만 센다.
          finalOutcomes: 3,
          succeeded: 1,
          timeoutOrError: 1,
          timeoutOrErrorRate: 1 / 3,
          inputTokens: 100,
          outputTokens: 20,
          attemptsKnown: 0,
          multiAttemptRequests: 0,
          multiAttemptRate: 0,
          attemptAmplification: 0,
          latencySamples: 1,
          latencyP50Ms: 10,
          latencyP95Ms: 10,
          latencyP99Ms: 10,
        },
      ],
      localRejections: [],
    }
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/metrics', () => HttpResponse.json(metrics)),
    )
    renderApp('/admin/llm/status?tab=metrics')

    const row = (await screen.findByText('Rate limited 서비스')).closest('tr') as HTMLElement
    const cells = within(row).getAllByRole('cell')
    expect(cells[1]).toHaveTextContent('3건')
    expect(cells[1]).toHaveTextContent('성공 1건')
    expect(cells[2]).toHaveTextContent('1건')
    expect(cells[2]).toHaveTextContent('33.3%')
    expect(cells[4]).toHaveTextContent('시도 횟수 표본 없음')
    expect(cells[4]).not.toHaveTextContent('0.00회')
  })
})
