import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'
import { VM_METRICS_UNAVAILABLE_ID, VM_NOT_PROVISIONED_ID } from '../ids'

type Schemas = components['schemas']

/** 픽스처 기준 시각 — 결정적인 시계열을 만들기 위해 고정한다. */
const BASE_TIME = Date.parse('2026-08-10T12:00:00+09:00')

/** 구간별 점 간격(초) — 계약의 해상도(구간이 길수록 거칠어짐)를 흉내낸다. */
const STEP_SECONDS: Record<string, number> = {
  HOUR: 60,
  DAY: 600,
  WEEK: 1800,
  MONTH: 7200,
  YEAR: 86_400,
}

const POINT_COUNT = 12

function timeframeOf(request: Request): string {
  return new URL(request.url).searchParams.get('timeframe') ?? 'HOUR'
}

function timesOf(timeframe: string): string[] {
  const step = (STEP_SECONDS[timeframe] ?? 60) * 1000
  return Array.from({ length: POINT_COUNT }, (_, index) =>
    new Date(BASE_TIME - (POINT_COUNT - 1 - index) * step).toISOString(),
  )
}

/** 뒤에서 두 점은 자료가 없는 구간(VM 중지 등) — 빈 구간 렌더를 확인한다. */
function isGap(index: number): boolean {
  return index >= POINT_COUNT - 2
}

export function vmMetricsFixture(timeframe: string): Schemas['VmMetricsResponse'] {
  return {
    timeframe,
    fetchedAt: new Date(BASE_TIME).toISOString(),
    available: true,
    unavailableReason: null,
    points: timesOf(timeframe).map((time, index) => ({
      time,
      cpu: isGap(index) ? null : 0.1 + index * 0.05,
      memBytes: isGap(index) ? null : (512 + index * 32) * 1024 * 1024,
      memHostBytes: isGap(index) ? null : (640 + index * 32) * 1024 * 1024,
      maxmemBytes: 2048 * 1024 * 1024,
      netinBps: isGap(index) ? null : 120_000 + index * 10_000,
      netoutBps: isGap(index) ? null : 80_000 + index * 8_000,
      diskReadBps: isGap(index) ? null : 40_000 + index * 5_000,
      diskWriteBps: isGap(index) ? null : 20_000 + index * 3_000,
    })),
  }
}

/** 아직 프로비저닝되지 않은(또는 삭제된) VM — 200 + available=false. */
export function notProvisionedMetrics(timeframe: string): Schemas['VmMetricsResponse'] {
  return {
    timeframe,
    fetchedAt: new Date(BASE_TIME).toISOString(),
    available: false,
    unavailableReason: 'NOT_PROVISIONED',
    points: [],
  }
}

/** 하이퍼바이저에 물어볼 수 없을 때의 503. */
export function metricsUnavailableProblem(instance: string) {
  return problemResponse({
    type: 'about:blank',
    title: '사용량을 조회할 수 없습니다',
    status: 503,
    detail: '하이퍼바이저에서 사용량을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    instance,
    code: 'METRICS_UNAVAILABLE',
  })
}

export function nodeMetricsFixture(timeframe: string): Schemas['NodeMetricsResponse'] {
  return {
    timeframe,
    fetchedAt: new Date(BASE_TIME).toISOString(),
    points: timesOf(timeframe).map((time, index) => ({
      time,
      cpu: isGap(index) ? null : 0.2 + index * 0.02,
      iowait: isGap(index) ? null : 0.01 + index * 0.002,
      loadavg: isGap(index) ? null : 1.2 + index * 0.1,
      memTotalBytes: 79_872 * 1024 * 1024,
      memUsedBytes: isGap(index) ? null : (24_000 + index * 512) * 1024 * 1024,
      swapTotalBytes: 8192 * 1024 * 1024,
      swapUsedBytes: isGap(index) ? null : 128 * 1024 * 1024,
      rootTotalBytes: 100 * 1024 * 1024 * 1024,
      rootUsedBytes: isGap(index) ? null : 42 * 1024 * 1024 * 1024,
      netinBps: isGap(index) ? null : 2_000_000 + index * 100_000,
      netoutBps: isGap(index) ? null : 1_500_000 + index * 80_000,
    })),
  }
}

/** 일 단위 스냅샷 — 기간 첫날 12 vCPU에서 마지막 날 20 vCPU로 늘어나는 추이. */
export function capacityTrendFixture(days: number): Schemas['CapacityTrendResponse'] {
  const count = Math.min(days, 12)
  const points: Schemas['CapacityTrendPointResponse'][] = Array.from(
    { length: count },
    (_, index) => {
      const day = new Date(BASE_TIME - (count - 1 - index) * 86_400_000)
      const grown = index >= count / 2
      return {
        day: day.toISOString().slice(0, 10),
        vmCount: grown ? 8 : 6,
        vcpu: grown ? 20 : 12,
        memoryMb: grown ? 49_152 : 32_768,
        diskGb: grown ? 460 : 320,
      }
    },
  )
  return {
    from: points[0].day,
    to: points[points.length - 1].day,
    capacityCpuThreads: 40,
    capacityMemoryMb: 79_872,
    capacityDiskGb: 900,
    points,
  }
}

export const metricsHandlers: RequestHandler[] = [
  http.get('*/api/v1/vms/:vmId/metrics', ({ params, request }) => {
    const vmId = String(params.vmId)
    const timeframe = timeframeOf(request)
    // 생성 중 VM은 아직 실체가 없고, 생성 실패 VM은 하이퍼바이저 조회가 실패한다.
    // 두 값은 VmDetailPage 테스트와 공유한다 — 한쪽만 옮기면 분기가 죽은 채로
    // 테스트는 계속 통과한다.
    if (vmId === VM_NOT_PROVISIONED_ID) {
      return HttpResponse.json(notProvisionedMetrics(timeframe), { status: 200 })
    }
    if (vmId === VM_METRICS_UNAVAILABLE_ID)
      return metricsUnavailableProblem(`/api/v1/vms/${vmId}/metrics`)
    return HttpResponse.json(vmMetricsFixture(timeframe), { status: 200 })
  }),

  http.get('*/api/v1/admin/nodes/:nodeId/metrics', ({ request }) =>
    HttpResponse.json(nodeMetricsFixture(timeframeOf(request)), { status: 200 }),
  ),

  http.get('*/api/v1/admin/capacity-trend', ({ request }) => {
    const days = Number(new URL(request.url).searchParams.get('days') ?? '90')
    return HttpResponse.json(capacityTrendFixture(days), { status: 200 })
  }),
]
