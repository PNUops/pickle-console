import { http, HttpResponse, type RequestHandler } from 'msw'
import type {
  AdminLlmMetrics,
  AdminLlmStatus,
  LlmUpstreamMetric,
  LlmUpstreamStatus,
} from '../../../api/queries'
import { isSysTier } from '../../../auth/permissions'
import { ACCESS_TOKENS } from './auth'
import { adminReadScope } from './org-scope'
import { uuid } from '../ids'

interface ScopedUpstream<T> {
  value: T
  visibleOrgIds: string[]
}

const observedNow = new Date().toISOString()

const upstreamStatuses: ScopedUpstream<LlmUpstreamStatus>[] = [
  {
    visibleOrgIds: [uuid(1)],
    value: {
      id: uuid(301),
      ref: 'pickle-onprem',
      name: 'Pickle 자체 서빙',
      kind: 'ON_PREM',
      orgId: uuid(1),
      dedicated: true,
      enabled: true,
      configured: true,
      reportState: 'OK',
      availability: 'HEALTHY',
      lastReportedAt: observedNow,
      passive: {
        lastAttemptAt: '2026-08-30T18:19:40+09:00',
        lastSuccessAt: '2026-08-30T18:19:40+09:00',
        lastFailureAt: '2026-08-30T17:42:00+09:00',
        lastFailureType: 'UPSTREAM_5XX',
        consecutiveFailures: 0,
        cooldownUntil: null,
      },
      active: {
        lastAttemptAt: observedNow,
        lastSuccessAt: observedNow,
        lastFailureAt: null,
        status: 'OK',
        intervalSeconds: 60,
        stale: false,
        failureType: null,
        latencyMs: 24,
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
    },
  },
  {
    visibleOrgIds: [uuid(1), uuid(2)],
    value: {
      id: uuid(302),
      ref: 'openrouter',
      name: 'OpenRouter',
      kind: 'EXTERNAL_API',
      orgId: null,
      dedicated: false,
      enabled: true,
      configured: true,
      reportState: 'OK',
      // /models의 401은 도달 성공·인증 미확인이지 서비스 장애가 아니다.
      availability: 'DEGRADED',
      lastReportedAt: observedNow,
      passive: {
        lastAttemptAt: '2026-08-30T18:18:00+09:00',
        lastSuccessAt: '2026-08-30T18:18:00+09:00',
        lastFailureAt: null,
        lastFailureType: null,
        consecutiveFailures: 0,
        cooldownUntil: null,
      },
      active: {
        lastAttemptAt: observedNow,
        lastSuccessAt: null,
        lastFailureAt: null,
        status: 'AUTH_UNVERIFIED',
        intervalSeconds: 300,
        stale: false,
        failureType: null,
        latencyMs: 128,
        modelCount: null,
        consecutiveFailures: 0,
      },
      catalog: {
        status: 'NOT_APPLICABLE',
        expectedModelCount: null,
        missingModelCount: null,
        unexpectedModelCount: null,
        missingPublicModels: [],
      },
    },
  },
]

const upstreamMetrics: ScopedUpstream<LlmUpstreamMetric>[] = [
  {
    visibleOrgIds: [uuid(1)],
    value: {
      id: uuid(301),
      ref: 'pickle-onprem',
      name: 'Pickle 자체 서빙',
      finalOutcomes: 96,
      succeeded: 92,
      timeoutOrError: 4,
      timeoutOrErrorRate: 4 / 96,
      inputTokens: 1_240_000,
      outputTokens: 320_000,
      attemptsKnown: 94,
      multiAttemptRequests: 3,
      multiAttemptRate: 3 / 94,
      attemptAmplification: 1.04,
      latencySamples: 92,
      latencyP50Ms: 840,
      latencyP95Ms: 2_340,
      latencyP99Ms: 3_880,
    },
  },
  {
    visibleOrgIds: [uuid(1), uuid(2)],
    value: {
      id: uuid(302),
      ref: 'openrouter',
      name: 'OpenRouter',
      finalOutcomes: 28,
      succeeded: 26,
      timeoutOrError: 2,
      timeoutOrErrorRate: 2 / 28,
      inputTokens: 420_000,
      outputTokens: 96_000,
      attemptsKnown: 28,
      multiAttemptRequests: 1,
      multiAttemptRate: 1 / 28,
      attemptAmplification: 1.04,
      latencySamples: 26,
      latencyP50Ms: 920,
      latencyP95Ms: 2_880,
      latencyP99Ms: 4_120,
    },
  },
]

export const llmStatusFixture: Omit<AdminLlmStatus, 'upstreams'> = {
  observedAt: observedNow,
  gateway: {
    reportState: 'FRESH',
    desiredGeneration: 42,
    appliedGeneration: 42,
    supportedFormat: 1,
    agentVersion: '0.9.0',
    startedAt: '2026-08-30T09:00:00+09:00',
    inFlight: 2,
    maxInFlight: 32,
    rejectedEntries: 1,
    reloadFailures: 2,
    lastError: null,
    bodiesDropped: 0,
    usageShipFailures: 3,
    spoolWriteFailures: 0,
    lastContactAt: observedNow,
    lastUsageShipSuccessAt: observedNow,
    oldestUnshippedEventAt: observedNow,
    queuedUsageEvents: 2,
    queuedUsageBytes: 2048,
    usageQueueObservedAt: observedNow,
    usageQueueReportState: 'FRESH',
    usageQueueScanFailures: 0,
  },
}

export const llmMetricsFixture: Omit<AdminLlmMetrics, 'upstreams'> = {
  from: '2026-08-24T00:00:00+09:00',
  to: '2026-08-31T00:00:00+09:00',
  totalEvents: 140,
  attributedEvents: 124,
  attributionCoverage: 124 / 140,
  attemptsKnownEvents: 122,
  attemptCoverage: 122 / 140,
  estimatedEvents: 12,
  estimatedCoverage: 12 / 140,
  localRejections: [
    { errorType: 'quota_exhausted', requests: 9 },
    { errorType: 'server_busy', requests: 7 },
  ],
}

function profileOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token] ?? null
}

function visibleRows<T>(
  rows: ScopedUpstream<T>[],
  requestedOrgId: string | null,
  systemTier: boolean,
): T[] {
  const visible = requestedOrgId
    ? rows.filter((row) => row.visibleOrgIds.includes(requestedOrgId))
    : rows
  return visible.map((row) => {
    if (systemTier) return row.value
    return { ...row.value, ref: null } as T
  })
}

export const llmObservabilityHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/llm/status', ({ request }) => {
    const orgId = new URL(request.url).searchParams.get('orgId')
    const profile = profileOf(request)
    const scope = profile ? adminReadScope(profile, orgId, '/api/v1/admin/llm/status') : null
    if (scope?.notFound) return scope.notFound
    const systemTier = profile ? isSysTier(profile.role) : false
    const body: AdminLlmStatus = {
      ...llmStatusFixture,
      upstreams: visibleRows(upstreamStatuses, orgId, systemTier),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.get('*/api/v1/admin/llm/metrics', ({ request }) => {
    const orgId = new URL(request.url).searchParams.get('orgId')
    const profile = profileOf(request)
    const scope = profile ? adminReadScope(profile, orgId, '/api/v1/admin/llm/metrics') : null
    if (scope?.notFound) return scope.notFound
    const systemTier = profile ? isSysTier(profile.role) : false
    const body: AdminLlmMetrics = {
      ...llmMetricsFixture,
      upstreams: visibleRows(upstreamMetrics, orgId, systemTier),
    }
    return HttpResponse.json(body, { status: 200 })
  }),
]
