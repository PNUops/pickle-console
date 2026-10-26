import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import type { AdminLlmCapacity } from '../api/queries'
import pipelineTelemetryJson from '../test/fixtures/inference-telemetry.json?raw'
import { orgViewerUser, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { llmCapacityFixture } from '../test/msw/handlers/llm-capacity'
import { inferenceDeviceFixture, inferenceTelemetryFixture, observationMetric } from '../test/msw/handlers/inference-observations'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

const from = '2026-10-20T00:00:00.125Z'
const to = '2026-10-20T00:03:00.125Z'
const fixtureNow = Date.parse('2026-10-21T00:00:00Z')
const route = `/admin/llm/status?tab=metrics&view=capacity&from=${from}&to=${to}`

function reported() {
  const value = llmCapacityFixture({ from, to })
  value.generatedAt = new Date(fixtureNow).toISOString()
  value.telemetry = { status: 'REPORTED', device: inferenceDeviceFixture({ from, to }, fixtureNow) }
  return value
}

test('renders reported global history and keeps measured zero distinct from unsupported signals', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(reported())))
  renderApp(route)
  const chart = await screen.findByRole('img', { name: '장비 관측: GPU 활성도' })
  const figure = within(chart.closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox', { name: '장비 관측: GPU 활성도 정확값' }), String(Date.parse(from) / 1000))
  expect(figure.getByText('관측 평균 0%')).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: '장비 관측 지표' }), 'gpu_memory_total_bytes')
  expect(await screen.findByText('지원되지 않는 지표입니다. 0으로 표시하지 않습니다.')).toBeInTheDocument()
  expect(screen.getByText(/기관·공간·키·원인별 수요 필터로 나눈 장비 점유율이 아닙니다/)).toBeInTheDocument()
})

test('leaves the final empty bucket blank instead of extending the last sample', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(reported())))
  renderApp(route)
  const chart = await screen.findByRole('img', { name: '장비 관측: GPU 활성도' })
  const figure = within(chart.closest('figure')!)
  const last = (Date.parse(to) - 60_000) / 1000
  await user.selectOptions(figure.getByRole('combobox', { name: '장비 관측: GPU 활성도 정확값' }), String(last))
  expect(figure.getByText('관측 평균 —')).toBeInTheDocument()
  expect(figure.getByText(/표본 최대.*순간 최댓값이 아닙니다/)).toBeInTheDocument()
})

test('separates an expired historical window from configured but unreported telemetry', async () => {
  const value = reported()
  value.telemetry.device!.evidence = { ...value.telemetry.device!.evidence, retentionState: 'OUTSIDE',
    samplesInWindow: null, expectedSamples: null, failedSamples: null, baselineIntervals: null, resetIntervals: null, gapIntervals: null }
  value.telemetry.device!.series = []
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
  expect(await screen.findByText(/요청 기간 전체가 장비 이력의 보존 경계 밖입니다/)).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: '장비 관측: GPU 활성도' })).not.toBeInTheDocument()
  expect(screen.queryByText(/장비·추론 수집이 구성되지 않았습니다/)).not.toBeInTheDocument()
})

test('labels present reporter staleness without discarding historical observations', async () => {
  const value = reported()
  value.telemetry.device!.evidence.freshness = 'STALE'
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
  expect(await screen.findByText(/현재 원천 보고가 늦습니다.*과거 조회 기간의 이력과 구분합니다/)).toBeInTheDocument()
  expect(screen.getByRole('img', { name: '장비 관측: GPU 활성도' })).toBeInTheDocument()
})

test('does not render device identity or charts for an institution despite a malicious flag', async () => {
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(reported())))
  renderApp(`${route}&org=${uuid(1)}`)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  expect(screen.queryByRole('heading', { name: '장비 전체와 추론 관측' })).not.toBeInTheDocument()
  expect(screen.queryByText('합성 관측 원천')).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: '장비 관측: GPU 활성도' })).not.toBeInTheDocument()
})

test('preserves a source through detail return and explicitly clears it without losing the window', async () => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', ({ request }) => {
    const params = new URL(request.url).searchParams
    queries.push(params)
    const value = llmCapacityFixture({ from: params.get('from')!, to: params.get('to')!, group: 'KEY' })
    value.telemetry = { status: 'REPORTED', device: inferenceDeviceFixture({ from: params.get('from')!, to: params.get('to')!, telemetrySourceId: params.get('telemetrySourceId') ?? undefined }, fixtureNow) }
    return HttpResponse.json(value)
  }))
  renderApp(`${route}&org=${uuid(1)}&telemetrySourceId=${uuid(401)}&group=KEY`)
  await user.click(await screen.findByRole('link', { name: 'active-admin-key' }))
  await user.click(await screen.findByRole('link', { name: '← 장비와 수요 비교' }))
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('telemetrySourceId')).toBe(uuid(401))
  await user.click(screen.getByRole('button', { name: '조회 필터 초기화' }))
  await waitFor(() => expect(queries.at(-1)?.has('telemetrySourceId')).toBe(false))
  const result = new URL(currentPath(), 'https://pickle.invalid').searchParams
  expect(result.get('org')).toBe(uuid(1))
  expect(result.get('from')).toBe(from)
  expect(result.get('to')).toBe(to)
})

test('refuses device charts whose response window differs from the demand response', async () => {
  const value = reported()
  value.telemetry.device!.from = '2026-10-19T00:00:00Z'
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
  expect(await screen.findByText(/장비 이력의 응답 기간이 수요 응답과 다릅니다/)).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: '장비 관측: GPU 활성도' })).not.toBeInTheDocument()
})

test('refuses a response for a different explicitly selected observation source', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(reported())))
  renderApp(`${route}&telemetrySourceId=${uuid(402)}`)
  expect(await screen.findByText(/장비 이력의 원천이 선택한 관측 원천과 다릅니다/)).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: '장비 관측: GPU 활성도' })).not.toBeInTheDocument()
})

test('names changed engine configurations separately and never joins their gauge points', async () => {
  const user = userEvent.setup()
  const value = reported()
  value.telemetry.device!.series[1].engines[0].configId = 'example-config-2'
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
  const select = await screen.findByRole('combobox', { name: '관측 모델·엔진' })
  const changed = within(select).getByRole('option', { name: /example-config-2/ })
  await user.selectOptions(select, changed.getAttribute('value')!)
  const chart = screen.getByRole('img', { name: '엔진 관측: 실행 중인 요청' })
  const figure = within(chart.closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox', { name: '엔진 관측: 실행 중인 요청 정확값' }), String(Date.parse(from) / 1000))
  expect(figure.getByText('관측 평균 —')).toBeInTheDocument()
  expect(screen.getByText('example-config-2')).toBeInTheDocument()
})

test('does not reinterpret an unknown zero-shaped metric as a measured zero', async () => {
  const user = userEvent.setup()
  const value = reported()
  value.telemetry.device!.series[0].host.gpu_utilization_percent.state = 'UNKNOWN'
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
  const chart = await screen.findByRole('img', { name: '장비 관측: GPU 활성도' })
  const figure = within(chart.closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox', { name: '장비 관측: GPU 활성도 정확값' }), String(Date.parse(from) / 1000))
  expect(figure.getByText('관측 평균 —')).toBeInTheDocument()
})

test('keeps old device history visibly tied to its response window after a new-window failure', async () => {
  const user = userEvent.setup()
  let calls = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => {
    calls++
    return calls === 1 ? HttpResponse.json(reported()) : HttpResponse.json({ title: '합성 갱신 실패', status: 503 }, { status: 503 })
  }))
  renderApp(route)
  await screen.findByRole('img', { name: '장비 관측: GPU 활성도' })
  await user.click(screen.getByRole('button', { name: '1시간' }))
  await screen.findByText(/갱신하지 못했습니다/)
  expect(screen.getByText(/장비 이력도 이전 응답 기간의 자료입니다/)).toBeInTheDocument()
  expect(screen.getByRole('img', { name: '장비 관측: GPU 활성도' })).toBeInTheDocument()
  expect(screen.queryByRole('table', { name: '같은 조건의 소비처' })).not.toBeInTheDocument()
})

test('shows engine interval means and elapsed-time rates without inventing baseline values', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(reported())))
  renderApp(route)
  const metric = await screen.findByRole('combobox', { name: '엔진 관측 지표' })
  await user.selectOptions(metric, JSON.stringify(['rates', 'vllm:generation_tokens_total']))
  let figure = within(screen.getByRole('img', { name: '엔진 관측: 출력 토큰 /초' }).closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), String(Date.parse(from) / 1000))
  expect(figure.getByText('구간율 평균 —')).toBeInTheDocument()
  const valid = (Date.parse(from) + 60_000) / 1000
  await user.selectOptions(figure.getByRole('combobox'), String(valid))
  expect(figure.getByText('구간율 평균 20 토큰/초')).toBeInTheDocument()
  await user.selectOptions(metric, JSON.stringify(['histogramMeans', 'vllm:time_to_first_token_seconds']))
  figure = within(screen.getByRole('img', { name: '엔진 관측: 첫 토큰 지연 (TTFT)' }).closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), String(valid))
  expect(figure.getByText('구간 평균 250 ms')).toBeInTheDocument()
  expect(figure.getByText(/개별 요청 최댓값이나 분위수가 아닙니다/)).toBeInTheDocument()
  await user.selectOptions(metric, JSON.stringify(['histogramMeans', 'vllm:request_time_per_output_token_seconds']))
  figure = within(screen.getByRole('img', { name: '엔진 관측: 요청별 출력 토큰 시간 (TPOT)' }).closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), String(valid))
  expect(figure.getByText('구간 평균 20 ms')).toBeInTheDocument()
})

test('keeps configured but unreported history separate from missing installation', async () => {
  const value = llmCapacityFixture({ from, to })
  value.telemetry = inferenceTelemetryFixture({ from, to }, 'not-reported', fixtureNow)
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
  expect(await screen.findByText('요청 기간의 장비 표본이 없습니다')).toBeInTheDocument()
  expect(screen.getByText(/원천의 보고 시각이 없습니다/)).toBeInTheDocument()
  expect(screen.queryByText(/장비·추론 수집이 구성되지 않았습니다/)).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: '장비 관측: GPU 활성도' })).not.toBeInTheDocument()
})

test('preserves a partial retention boundary instead of rendering a supplied zero outside it', async () => {
  const user = userEvent.setup()
  const value = reported()
  const device = value.telemetry.device!
  device.evidence.retentionState = 'PARTIAL'
  device.evidence.retainedFrom = device.series[1].from
  device.series[0].retentionState = 'OUTSIDE'
  device.series[0].samples = null
  device.series[0].failedSamples = null
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
  expect(await screen.findByText(/요청 기간 일부가 장비 이력의 보존 경계 밖입니다/)).toBeInTheDocument()
  const chart = screen.getByRole('img', { name: '장비 관측: GPU 활성도' })
  const figure = within(chart.closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), String(Date.parse(from) / 1000))
  expect(figure.getByText('관측 평균 —')).toBeInTheDocument()
})

test('retains source timestamp precision separately from the chart bucket axis', async () => {
  const value = reported()
  value.telemetry.device!.evidence.latestObservedAt = '2026-10-20T00:01:00.123456789Z'
  value.telemetry.device!.evidence.latestReceivedAt = '2026-10-20T00:01:01.987654321Z'
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
  expect(await screen.findByText(/\.123456789 KST/)).toBeInTheDocument()
  expect(screen.getByText(/\.987654321 KST/)).toBeInTheDocument()
})

test('honors an explicitly requested bucket for both demand and device history in the shared mock', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`${route}&bucketSeconds=120`)
  expect(await screen.findAllByText('120초')).toHaveLength(2)
})

test('rejects an oversized bucket count and recovers through the existing explicit reset', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`/admin/llm/status?tab=metrics&view=capacity&from=${from}&to=2026-10-20T00:25:00.125Z&bucketSeconds=1`)
  expect(await screen.findByText(/갱신하지 못했습니다/)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '같은 시간창의 수요' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '조회 필터 초기화' }))
  expect(await screen.findByRole('heading', { name: '같은 시간창의 수요' })).toBeInTheDocument()
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('from')).toBe(from)
})

test('keeps a small positive statistical rate nonzero in the exact-value readout', async () => {
  const user = userEvent.setup()
  const rate = 1e-7
  const value = reported()
  value.telemetry.device!.series[1].engines[0].rates['vllm:generation_tokens_total'] = observationMetric(rate, 'OBSERVED', 60)
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
  await user.selectOptions(await screen.findByRole('combobox', { name: '엔진 관측 지표' }), JSON.stringify(['rates', 'vllm:generation_tokens_total']))
  const figure = within(screen.getByRole('img', { name: '엔진 관측: 출력 토큰 /초' }).closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), String((Date.parse(from) + 60_000) / 1000))
  const text = figure.getByText(/^구간율 평균 /).textContent!
  const shown = Number(text.replace('구간율 평균 ', '').replace(' 토큰/초', '').replaceAll(',', ''))
  expect(shown).toBeGreaterThan(0)
  expect(shown).toBeCloseTo(rate, 15)
})

test('renders an observed gauge in its sample-time bucket even with no snapshot row in that bucket', async () => {
  const user = userEvent.setup()
  const value = reported()
  const device = value.telemetry.device!
  device.series[0].samples = 0
  device.series[0].host = {}
  device.series[0].engines[0].gauges = { 'vllm:num_requests_running': observationMetric(0) }
  device.series[0].engines[0].intervalState = 'UNAVAILABLE'
  device.series[0].engines[0].baselineIntervals = 0
  device.series[1].engines[0].gauges = { 'vllm:num_requests_waiting': observationMetric(0) }
  device.series[1].engines[0].intervalState = 'BASELINE'
  device.series[1].engines[0].validIntervals = 0
  device.series[1].engines[0].baselineIntervals = 1
  device.series[1].engines[0].rates = {}
  device.series[1].engines[0].histogramMeans = {}
  device.evidence.samplesInWindow = 1
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
  const chart = await screen.findByRole('img', { name: '엔진 관측: 실행 중인 요청' })
  const figure = within(chart.closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), String(Date.parse(from) / 1000))
  expect(figure.getByText('관측 평균 0 건')).toBeInTheDocument()
})

test('labels partially comparable engine intervals while keeping their valid metrics visible', async () => {
  const user = userEvent.setup()
  const value = reported()
  value.telemetry.device!.series[1].engines[0].intervalState = 'PARTIAL'
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
  expect(await screen.findByText(/일부 지표만 비교할 수 있는 구간을 포함합니다/)).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: '엔진 관측 지표' }), JSON.stringify(['rates', 'vllm:generation_tokens_total']))
  const figure = within(screen.getByRole('img', { name: '엔진 관측: 출력 토큰 /초' }).closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), String((Date.parse(from) + 60_000) / 1000))
  expect(figure.getByText('구간율 평균 20 토큰/초')).toBeInTheDocument()
})

test('retains the selected host metric and exact date across a same-context response refresh', async () => {
  const user = userEvent.setup()
  let calls = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => {
    calls++
    const value = reported()
    if (calls > 1) value.generatedAt = '2026-10-21T00:00:01Z'
    return HttpResponse.json(value)
  }))
  renderApp(route)
  await user.selectOptions(await screen.findByRole('combobox', { name: '장비 관측 지표' }), 'gpu_power_watts')
  let figure = within(screen.getByRole('img', { name: '장비 관측: GPU 전력' }).closest('figure')!)
  const selectedDate = String(Date.parse(from) / 1000)
  await user.selectOptions(figure.getByRole('combobox'), selectedDate)
  expect(figure.getByText('관측 평균 20 W')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '다시 조회' }))
  await screen.findByText(/09:00:01 KST/)
  expect(calls).toBe(2)
  expect(screen.getByRole('combobox', { name: '장비 관측 지표' })).toHaveValue('gpu_power_watts')
  figure = within(screen.getByRole('img', { name: '장비 관측: GPU 전력' }).closest('figure')!)
  expect(figure.getByRole('combobox')).toHaveValue(selectedDate)
  expect(figure.getByText('관측 평균 20 W')).toBeInTheDocument()
})

test.each([1, 59, 86401])('recovers an initial rejected bucket %s through the explicit reset', async (bucket) => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`${route}&bucketSeconds=${bucket}`)
  expect(await screen.findByText(/갱신하지 못했습니다/)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '같은 시간창의 수요' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '조회 필터 초기화' }))
  expect(await screen.findByRole('heading', { name: '같은 시간창의 수요' })).toBeInTheDocument()
  const params = new URL(currentPath(), 'https://pickle.invalid').searchParams
  expect(params.has('bucketSeconds')).toBe(false)
  expect(params.get('from')).toBe(from)
  expect(params.get('to')).toBe(to)
})

test.each([60, 86400])('accepts the actual API bucket boundary %s', async (bucket) => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`${route}&bucketSeconds=${bucket}`)
  expect(await screen.findAllByText(`${bucket.toLocaleString('ko-KR')}초`)).toHaveLength(2)
})

test('consumes the sample-ingestion response with observed mean, rate, zero and unsupported null', async () => {
  const user = userEvent.setup()
  const telemetry = JSON.parse(pipelineTelemetryJson) as AdminLlmCapacity['telemetry']
  const device = telemetry.device!
  const value = llmCapacityFixture({ from: device.from, to: device.to, bucketSeconds: device.bucketSeconds })
  value.generatedAt = device.evidence.latestReceivedAt!
  value.telemetry = telemetry
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  const params = new URLSearchParams({ tab: 'metrics', view: 'capacity', from: device.from, to: device.to,
    bucketSeconds: String(device.bucketSeconds), telemetrySourceId: device.sourceId })
  renderApp(`/admin/llm/status?${params}`)
  let chart = await screen.findByRole('img', { name: '장비 관측: GPU 활성도' })
  let figure = within(chart.closest('figure')!)
  const first = String(Date.parse(device.series[0].from) / 1000)
  const valid = String(Date.parse(device.series[1].from) / 1000)
  await user.selectOptions(figure.getByRole('combobox'), first)
  expect(figure.getByText('관측 평균 0%')).toBeInTheDocument()
  const host = screen.getByRole('combobox', { name: '장비 관측 지표' })
  await user.selectOptions(host, 'cpu_load1')
  figure = within(screen.getByRole('img', { name: '장비 관측: CPU 1분 load average' }).closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), first)
  expect(figure.getByText('관측 평균 0.125')).toBeInTheDocument()
  await user.selectOptions(host, 'gpu_memory_total_bytes')
  figure = within(screen.getByRole('img', { name: '장비 관측: GPU 메모리 보고값' }).closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), first)
  expect(figure.getByText('관측 평균 —')).toBeInTheDocument()
  expect(screen.getByText('지원되지 않는 지표입니다. 0으로 표시하지 않습니다.')).toBeInTheDocument()
  const engine = screen.getByRole('combobox', { name: '엔진 관측 지표' })
  await user.selectOptions(engine, JSON.stringify(['rates', 'vllm:prompt_tokens_total']))
  chart = screen.getByRole('img', { name: '엔진 관측: 입력 토큰 /초' })
  figure = within(chart.closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), valid)
  expect(figure.getByText('구간율 평균 1 토큰/초')).toBeInTheDocument()
  await user.selectOptions(engine, JSON.stringify(['histogramMeans', 'vllm:time_to_first_token_seconds']))
  figure = within(screen.getByRole('img', { name: '엔진 관측: 첫 토큰 지연 (TTFT)' }).closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), valid)
  expect(figure.getByText('구간 평균 150 ms')).toBeInTheDocument()
})
