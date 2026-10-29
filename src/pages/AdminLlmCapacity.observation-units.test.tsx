import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { llmCapacityFixture } from '../test/msw/handlers/llm-capacity'
import { inferenceDeviceFixture, observationMetric } from '../test/msw/handlers/inference-observations'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

const axisProbe = vi.hoisted(() => ({ ticks: [1] }))

// Keep the real chart component/options. Model the cached axis labels of an
// unchanged zero-domain canvas; updating a formatter ref alone cannot redraw it.
vi.mock('uplot', () => ({ default: class {
  static rangeNum(min: number, max: number) { return [min, max] }
  data: unknown
  cursor = { idx: null, left: null, top: null }
  over = document.createElement('div')
  axis = document.createElement('span')
  constructor(options: { axes: { values?: (plot: unknown, splits: number[]) => string[] }[] }, data: unknown, host: HTMLElement) {
    this.data = data
    this.axis.textContent = options.axes[1].values?.(this, axisProbe.ticks).join(' ') ?? ''
    host.append(this.axis)
  }
  setData(data: unknown) { this.data = data }
  setSize() {}
  destroy() { this.axis.remove() }
} }))

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
})
beforeEach(() => { axisProbe.ticks = [1] })
afterAll(() => vi.restoreAllMocks())

const from = '2026-10-20T00:00:00.125Z'
const to = '2026-10-20T00:03:00.125Z'
const route = `/admin/llm/status?tab=metrics&view=capacity&from=${from}&to=${to}`

function setup(tokenRate?: number) {
  const value = llmCapacityFixture({ from, to })
  const device = inferenceDeviceFixture({ from, to }, Date.parse('2026-10-21T00:00:00Z'))
  for (const point of device.series) {
    if (!point.samples) continue
    point.host.cpu_load1 = observationMetric(0)
    point.host.memory_available_bytes = observationMetric(0)
    point.host.gpu_power_watts = observationMetric(null, 'UNKNOWN')
    for (const engine of point.engines) {
      if (tokenRate != null) engine.rates['vllm:generation_tokens_total'] = observationMetric(tokenRate, 'OBSERVED', 60)
      engine.histogramMeans['vllm:request_prompt_tokens'] = observationMetric(0)
      engine.histogramMeans['vllm:time_to_first_token_seconds'] = observationMetric(0)
      engine.histogramMeans['vllm:request_time_per_output_token_seconds'] = observationMetric(0)
    }
  }
  value.telemetry = { status: 'REPORTED', device }
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(value)))
  renderApp(route)
}

test('refreshes cached host axis units across percent, unknown watts, load and memory', async () => {
  const user = userEvent.setup()
  setup()
  let chart = await screen.findByRole('img', { name: '장비 관측: GPU 활성도' })
  expect(within(chart).getByText('1%')).toBeInTheDocument()
  const metric = screen.getByRole('combobox', { name: '장비 관측 지표' })
  await user.selectOptions(metric, 'gpu_power_watts')
  chart = screen.getByRole('img', { name: '장비 관측: GPU 전력' })
  expect(within(chart).getByText('1 W')).toBeInTheDocument()
  await user.selectOptions(metric, 'cpu_load1')
  chart = screen.getByRole('img', { name: '장비 관측: CPU 1분 load average' })
  expect(within(chart).getByText('1')).toBeInTheDocument()
  expect(within(chart).queryByText('1%')).not.toBeInTheDocument()
  await user.selectOptions(metric, 'memory_available_bytes')
  chart = screen.getByRole('img', { name: '장비 관측: 시스템 통합 메모리 사용 가능' })
  expect(within(chart).getByText('9.31e-10 GiB')).toBeInTheDocument()
})

test('refreshes cached engine axes across requests, histogram tokens and TTFT or TPOT milliseconds', async () => {
  const user = userEvent.setup()
  setup()
  let chart = await screen.findByRole('img', { name: '엔진 관측: 실행 중인 요청' })
  expect(within(chart).getByText('1 건')).toBeInTheDocument()
  const metric = screen.getByRole('combobox', { name: '엔진 관측 지표' })
  await user.selectOptions(metric, JSON.stringify(['histogramMeans', 'vllm:request_prompt_tokens']))
  chart = screen.getByRole('img', { name: '엔진 관측: 요청 입력 길이' })
  expect(within(chart).getByText('1 토큰')).toBeInTheDocument()
  await user.selectOptions(metric, JSON.stringify(['histogramMeans', 'vllm:time_to_first_token_seconds']))
  chart = screen.getByRole('img', { name: '엔진 관측: 첫 토큰 지연 (TTFT)' })
  expect(within(chart).getByText('1,000 ms')).toBeInTheDocument()
  await user.selectOptions(metric, JSON.stringify(['histogramMeans', 'vllm:request_time_per_output_token_seconds']))
  chart = screen.getByRole('img', { name: '엔진 관측: 요청별 출력 토큰 시간 (TPOT)' })
  expect(within(chart).getByText('1,000 ms')).toBeInTheDocument()
})

test('abbreviates a fractional token rate on the axis while preserving its exact value', async () => {
  const user = userEvent.setup()
  axisProbe.ticks = [2500.5]
  setup(2500.5)
  await user.selectOptions(await screen.findByRole('combobox', { name: '엔진 관측 지표' }), JSON.stringify(['rates', 'vllm:generation_tokens_total']))
  const chart = screen.getByRole('img', { name: '엔진 관측: 출력 토큰 /초' })
  expect(within(chart).getByText('2.5K 토큰/초')).toBeInTheDocument()
  const figure = within(chart.closest('figure')!)
  await user.selectOptions(figure.getByRole('combobox'), String((Date.parse(from) + 60_000) / 1000))
  expect(figure.getByText('구간율 평균 2,500.5 토큰/초')).toBeInTheDocument()
})
