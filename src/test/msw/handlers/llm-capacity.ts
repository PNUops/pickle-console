import { http, HttpResponse, type RequestHandler } from 'msw'
import type { AdminLlmCapacity, LlmCapacityQuery } from '../../../api/queries'
import { canQueryWork, hasWork, hasSameSourceWorks, SYS_READERS } from '../../../auth/institution-authority'
import { isSysTier } from '../../../auth/permissions'
import { mockAuthorityActor, mockHasAggregateMoneySource } from '../institution-authority'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { llmStatusFixture } from './llm-observability'
import { adminLlmKeyStore } from './llm-keys'
import { uuid } from '../ids'
import { inferenceTelemetryFixture } from './inference-observations'
import { isUuid } from '../../../lib/validation'

type ReasonCase = AdminLlmCapacity['reasons'][number] & { keyNumber: number; finalUpstream: string | null; outcome: 'rateLimited' | 'failed' | 'canceled' }

const reasonCases: ReasonCase[] = [
  { errorType: 'quota_exhausted', category: 'USER_QUOTA', requests: 3, knownKeys: 1, keyNumber: 171, finalUpstream: null, outcome: 'rateLimited' },
  { errorType: 'large_request_busy', category: 'LARGE_REQUEST', requests: 1, knownKeys: 1, keyNumber: 171, finalUpstream: null, outcome: 'rateLimited' },
  { errorType: 'upstream_rejected', category: 'PROVIDER', requests: 1, knownKeys: 1, keyNumber: 172, finalUpstream: uuid(302), outcome: 'failed' },
  { errorType: 'future_public_reason', category: 'UNCLASSIFIED', requests: 1, knownKeys: 1, keyNumber: 173, finalUpstream: null, outcome: 'failed' },
  { errorType: 'server_busy', category: 'GLOBAL_ADMISSION', requests: 2, knownKeys: 1, keyNumber: 171, finalUpstream: null, outcome: 'rateLimited' },
  { errorType: 'server_busy', category: 'PROVIDER', requests: 3, knownKeys: 1, keyNumber: 172, finalUpstream: uuid(302), outcome: 'failed' },
  { errorType: 'server_busy', category: 'UNCLASSIFIED', requests: 1, knownKeys: 1, keyNumber: 174, finalUpstream: null, outcome: 'rateLimited' },
  { errorType: null, category: 'CANCELED', requests: 4, knownKeys: 1, keyNumber: 173, finalUpstream: null, outcome: 'canceled' },
  { errorType: null, category: 'UNCLASSIFIED', requests: 5, knownKeys: 1, keyNumber: 174, finalUpstream: null, outcome: 'failed' },
]

function caseCounts(rows: ReasonCase[], successes: number, financeVisible: boolean): AdminLlmCapacity['summary'] {
  const total = (predicate: (item: ReasonCase) => boolean) => rows.filter(predicate).reduce((sum, item) => sum + item.requests, 0)
  const canceled = total((item) => item.outcome === 'canceled')
  const rateLimited = total((item) => item.outcome === 'rateLimited')
  const refused = total(() => true)
  const priced = total((item) => item.finalUpstream != null)
  return { requests: successes + refused, succeeded: successes, rateLimited, failed: refused - canceled - rateLimited, canceled,
    inputTokens: successes * 1200, outputTokens: successes * 300, estimatedRequests: successes > 0 ? 1 : 0,
    tokenAxisRequests: successes + total((item) => item.errorType === 'quota_exhausted' || item.finalUpstream != null), creditAxisRequests: 0,
    unknownAxisRequests: total((item) => item.errorType !== 'quota_exhausted' && item.finalUpstream == null),
    unknownKeyRequests: 0, unknownModelRequests: total((item) => item.errorType == null), unknownFinalUpstreamRequests: total((item) => item.finalUpstream == null),
    costUsd: financeVisible && priced > 0 ? priced * 0.001 : null, pricedRequests: financeVisible ? priced : null, financeVisible }
}

/** Synthetic response for the shared browser fixture and consumer tests. */
export function llmCapacityFixture(query: Partial<LlmCapacityQuery> = {}, systemTier = true, financeVisible = systemTier): AdminLlmCapacity {
  const from = query.from ?? '2026-10-20T00:00:00.000Z'
  const to = query.to ?? '2026-10-21T00:00:00.000Z'
  const rows = reasonCases.filter((item) => (!query.errorType || item.errorType === query.errorType)
    && (!query.errorTypeMissing || item.errorType == null) && (!query.reasonCategory || item.category === query.reasonCategory)
    && (!query.upstreamId || item.finalUpstream === query.upstreamId)
    && (!query.openrouterAccountId || adminLlmKeyStore.find((key) => key.id === uuid(item.keyNumber))?.openrouterAccountId === query.openrouterAccountId))
  const successes = !query.errorType && !query.errorTypeMissing && !query.reasonCategory && (!query.upstreamId || query.upstreamId === uuid(301))
    && (!query.openrouterAccountId || adminLlmKeyStore.find((key) => key.id === uuid(171))?.openrouterAccountId === query.openrouterAccountId) ? 4 : 0
  const counts = caseCounts(rows, successes, financeVisible)
  const group = query.group ?? 'WORKSPACE'
  const orgId = query.orgId ?? uuid(1)
  const workspaceId = query.workspaceId ?? uuid(12)
  const matchingKeys = [...new Set([...rows.map((item) => item.keyNumber), ...(successes > 0 ? [171] : [])])]
  const consumers = group === 'KEY' ? matchingKeys.map((keyNumber) => {
    const key = adminLlmKeyStore.find((item) => item.id === uuid(keyNumber))!
    return { orgId, orgName: '정보컴퓨터공학부 실습지원센터', workspaceId, workspaceName: '캡스톤 3조', keyId: key.id, keyName: key.name,
      counts: caseCounts(rows.filter((item) => item.keyNumber === keyNumber), keyNumber === 171 ? successes : 0, financeVisible),
      currentLimits: { configurationObservedAt: new Date().toISOString(), dailyTokens: key.dailyTokens, quotaExhausted: key.quotaExhausted === true,
        rpm: key.rpm, tpm: key.tpm, concurrency: key.concurrency, serviceDefaultsReported: false } }
  }) : counts.requests ? [{ orgId, orgName: '정보컴퓨터공학부 실습지원센터', workspaceId: group === 'ORG' ? null : workspaceId,
    workspaceName: group === 'ORG' ? null : '캡스톤 3조', keyId: null, keyName: null, counts, currentLimits: null }] : []
  const span = (Date.parse(to) - Date.parse(from)) / 1000
  const bucketSeconds = query.bucketSeconds ?? [60, 300, 3600, 21600, 86400].find((step) => Math.ceil(span / step) <= 1440) ?? 86400
  const bucketCount = Math.ceil(span / bucketSeconds)
  const size = query.size ?? 20
  const references = (items: { id: string; name: string }[]) => ({ items, totalItems: items.length, truncated: false })
  consumers.sort((a, b) => {
    const metric = (row: typeof a) => query.sort === 'TOKENS_DESC' ? (row.counts.inputTokens ?? 0) + (row.counts.outputTokens ?? 0) : query.sort === 'REPORTED_COST_DESC' ? row.counts.costUsd : row.counts.requests
    const av = metric(a), bv = metric(b)
    return av == null ? bv == null ? 0 : 1 : bv == null ? -1 : bv - av || (b.keyId ?? b.workspaceId ?? b.orgId ?? '').localeCompare(a.keyId ?? a.workspaceId ?? a.orgId ?? '')
  })
  return {
    generatedAt: new Date().toISOString(), timezone: 'Asia/Seoul', from, to, openrouterAccountId: query.openrouterAccountId ?? null,
    bucketSeconds,
    summary: counts,
    series: Array.from({ length: bucketCount }, (_, index) => {
      const active = index === bucketCount - 1
      return { from: new Date(Date.parse(from) + bucketSeconds * 1000 * index).toISOString(), to: new Date(Math.min(Date.parse(to), Date.parse(from) + bucketSeconds * 1000 * (index + 1))).toISOString(), rawHistoryState: 'NOT_SWEPT',
        counts: active ? counts : { ...counts, requests: 0, succeeded: 0, rateLimited: 0, failed: 0, canceled: 0, inputTokens: 0, outputTokens: 0, estimatedRequests: 0, tokenAxisRequests: 0, creditAxisRequests: 0, unknownAxisRequests: 0, unknownKeyRequests: 0, unknownModelRequests: 0, unknownFinalUpstreamRequests: 0, costUsd: null, pricedRequests: financeVisible ? 0 : null } }
    }),
    reasons: rows.map(({ errorType, category, requests, knownKeys }) => ({ errorType, category, requests, knownKeys })),
    consumers: { group, sort: query.sort ?? 'REQUESTS_DESC', page: query.page ?? 0, size, totalElements: consumers.length, totalPages: Math.ceil(consumers.length / size), items: consumers.slice((query.page ?? 0) * size, ((query.page ?? 0) + 1) * size) },
    selectors: { institutions: references([{ id: orgId, name: '정보컴퓨터공학부 실습지원센터' }]),
      workspaces: references([{ id: workspaceId, name: '캡스톤 3조' }]),
      upstreams: references([{ id: uuid(301), name: '합성 자체 서빙' }, { id: uuid(302), name: '합성 외부 공급원' }]) },
    quality: { rawHistoryState: 'NOT_SWEPT', rawRetainedFrom: null, configuredRetentionDays: 0,
      latestUsageReceivedAt: '2026-10-21T00:00:00Z', rollupLastSuccessAt: '2026-10-21T00:01:00Z', completeness: 'UNKNOWN',
      gateway: { ...llmStatusFixture.gateway, inFlight: systemTier ? 0 : null, maxInFlight: systemTier ? 32 : null,
        queuedUsageEvents: systemTier ? 0 : null, queuedUsageBytes: systemTier ? 0 : null,
        rejectedEntries: systemTier ? 0 : null, reloadFailures: systemTier ? 0 : null,
        usageShipFailures: systemTier ? 0 : null, spoolWriteFailures: systemTier ? 0 : null,
        bodiesDropped: systemTier ? 0 : null, usageQueueScanFailures: systemTier ? 0 : null } },
    telemetryVisible: systemTier, telemetry: { status: systemTier ? 'NOT_CONFIGURED' : 'NOT_PROVIDED' },
  }
}

export const llmCapacityHandlers: RequestHandler[] = [http.get('*/api/v1/admin/llm/capacity', ({ request }) => {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const profile = ACCESS_TOKENS[token]
  if (!profile) return problemResponse({ status: 401, code: 'AUTH_REQUIRED', title: '로그인이 필요합니다.' })
  const params = new URL(request.url).searchParams
  const orgId = params.get('orgId') ?? undefined
  const workspaceId = params.get('workspaceId') ?? undefined
  if (!canQueryWork(mockAuthorityActor(profile), ['llm.observe'], { orgId, workspaceId }, SYS_READERS)) return problemResponse({ status: 403, code: 'ACCESS_DENIED', title: '기관 LLM 관측 업무가 필요합니다.' })
  // Represent ASCII-blank and UTF-16 length failures in the synthetic browser.
  for (const field of ['publicModelName', 'errorType']) {
    const value = params.get(field)
    if (value != null && (/^ *$/.test(value) || value.length > 256)) return problemResponse({
      status: 422, code: 'VALIDATION_FAILED', title: '입력값이 올바르지 않습니다', detail: '요청 값을 확인해 주세요.',
      errors: [{ field, message: '필터는 1~256자의 정확한 값이어야 합니다.' }],
    })
  }
  const sourceId = params.get('telemetrySourceId') || undefined
  const accountId = params.get('openrouterAccountId') || undefined
  const sort = (params.get('sort') ?? 'REQUESTS_DESC') as LlmCapacityQuery['sort']
  const size = Number(params.get('size') ?? 20)
  if (!Number.isSafeInteger(size) || size < 1 || size > 100) return problemResponse({ status: 422, code: 'VALIDATION_FAILED', title: '페이지 크기는 1~100이어야 합니다.' })
  if (accountId && !isUuid(accountId) || !['REQUESTS_DESC', 'TOKENS_DESC', 'REPORTED_COST_DESC'].includes(sort!)) return problemResponse({ status: 422, code: 'VALIDATION_FAILED', title: '조회 대상이나 정렬을 확인해 주세요.' })
  if (sourceId && !isUuid(sourceId)) return problemResponse({ status: 422, code: 'VALIDATION_FAILED', title: '입력값이 올바르지 않습니다',
    errors: [{ field: 'telemetrySourceId', message: '관측 원천 식별자가 올바르지 않습니다.' }] })
  const rawBucket = params.get('bucketSeconds')
  const bucketSeconds = rawBucket ? Number(rawBucket) : undefined
  const span = (Date.parse(params.get('to') ?? '') - Date.parse(params.get('from') ?? '')) / 1000
  if (rawBucket && (!/^\d+$/.test(rawBucket) || !Number.isSafeInteger(bucketSeconds) || !bucketSeconds || bucketSeconds < 60 || bucketSeconds > 86400
    || !Number.isFinite(span) || span <= 0 || Math.ceil(span / bucketSeconds) > 1440)) {
    return problemResponse({ status: 422, code: 'VALIDATION_FAILED', title: '입력값이 올바르지 않습니다',
      detail: '집계 간격과 조회 구간 수를 확인해 주세요.', errors: [{ field: 'bucketSeconds', message: '버킷은 60~86400초이며 조회 구간의 버킷 수는 1440개 이하여야 합니다.' }] })
  }
  const query: Partial<LlmCapacityQuery> = {
    from: params.get('from')!, to: params.get('to')!, orgId, workspaceId,
    group: params.get('group') === 'KEY' ? 'KEY' : params.get('group') === 'ORG' ? 'ORG' : 'WORKSPACE',
    page: Number(params.get('page') ?? 0), size, errorType: params.get('errorType') ?? undefined,
    publicModelName: params.get('publicModelName') ?? undefined,
    errorTypeMissing: params.get('errorTypeMissing') === 'true',
    reasonCategory: params.get('reasonCategory') as LlmCapacityQuery['reasonCategory'] ?? undefined,
    upstreamId: params.get('upstreamId') ?? undefined,
    telemetrySourceId: sourceId, bucketSeconds, openrouterAccountId: accountId, sort,
  }
  const systemTier = isSysTier(profile.role)
  const actor = mockAuthorityActor(profile)
  const baseKeys = adminLlmKeyStore.filter((key) => (!orgId || key.orgId === orgId) && (!workspaceId || key.workspaceId === workspaceId)
    && (!accountId || key.openrouterAccountId === accountId) && hasWork(actor, 'llm.observe', { orgId: key.orgId, workspaceId: key.workspaceId }, SYS_READERS))
  const financeVisible = mockHasAggregateMoneySource(actor) && baseKeys.every((key) => hasSameSourceWorks(actor, ['llm.observe', 'llm.key.cost.read'], { orgId: key.orgId, workspaceId: key.workspaceId }, SYS_READERS))
  if (sort === 'REPORTED_COST_DESC' && !financeVisible) return problemResponse({ status: 403, code: 'ACCESS_DENIED', title: '현재 조회 집합의 금액 정렬을 제공하지 않습니다.' })
  const fixture = llmCapacityFixture(query, systemTier, financeVisible)
  const scenario = typeof window === 'undefined' ? 'reported' : new URLSearchParams(window.location.search).get('observationFixture') ?? 'reported'
  fixture.telemetry = systemTier ? inferenceTelemetryFixture(query, scenario) : { status: 'NOT_PROVIDED', device: null }
  return HttpResponse.json(fixture)
})]
