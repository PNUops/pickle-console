import { http, HttpResponse, type RequestHandler } from 'msw'
import type { AdminLlmUsage, AdminLlmUsageDays } from '../../../api/queries'
import { isSysTier } from '../../../auth/permissions'
import { uuid } from '../ids'
import { ACCESS_TOKENS } from './auth'
import { adminReadScope } from './org-scope'

const TO = '2026-08-31'

export const adminLlmUsageQueries: string[] = []

export function resetAdminLlmUsageFixtures() {
  adminLlmUsageQueries.length = 0
}

function profileOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token] ?? null
}

function dayBefore(offset: number): string {
  const date = new Date(`${TO}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

function daily(days: AdminLlmUsageDays): AdminLlmUsage['demand']['daily'] {
  return Array.from({ length: days }, (_, index) => {
    const offset = days - index - 1
    const active = offset < 3
    const requests = active ? 12 - offset * 3 : 0
    const token = active ? 8 - offset * 2 : 0
    const credit = active ? 3 : 0
    const unknown = active ? 1 : 0
    return {
      day: dayBefore(offset),
      requests,
      inputTokens: active ? 1_200 - offset * 200 : 0,
      outputTokens: active ? 400 - offset * 50 : 0,
      estimatedRequests: active ? 1 : 0,
      tokenAxisRequests: token,
      creditAxisRequests: credit,
      unknownAxisRequests: unknown,
      axisCoverage: requests === 0 ? null : (token + credit) / requests,
    }
  })
}

function windows(): AdminLlmUsage['demand']['windows'] {
  return [
    {
      days: 7,
      requests: 27,
      inputTokens: 3_000,
      outputTokens: 1_050,
      estimatedRequests: 3,
      tokenAxisRequests: 18,
      creditAxisRequests: 6,
      unknownAxisRequests: 3,
      axisCoverage: 24 / 27,
    },
    {
      days: 30,
      requests: 90,
      inputTokens: 12_000,
      outputTokens: 4_200,
      estimatedRequests: 9,
      tokenAxisRequests: 60,
      creditAxisRequests: 20,
      unknownAxisRequests: 10,
      axisCoverage: 80 / 90,
    },
    {
      days: 90,
      requests: 240,
      inputTokens: 32_000,
      outputTokens: 11_000,
      estimatedRequests: 24,
      tokenAxisRequests: 160,
      creditAxisRequests: 50,
      unknownAxisRequests: 30,
      axisCoverage: 210 / 240,
    },
  ]
}

function consumers(orgId: string | null, workspaceId: string | null): AdminLlmUsage['consumers'] {
  if (workspaceId) {
    return {
      level: 'KEY',
      items: [
        {
          orgId: orgId ?? uuid(1),
          orgName: '정보컴퓨터공학부 실습지원센터',
          workspaceId,
          workspaceName: '캡스톤 3조',
          keyId: uuid(501),
          keyName: 'capstone-chatbot',
          requests: 18,
          inputTokens: 2_400,
          outputTokens: 800,
          attributedCostUsd: 0.124_5,
          pricedRequests: 6,
        },
      ],
      totalItems: 1,
      truncated: false,
    }
  }
  if (orgId) {
    return {
      level: 'WORKSPACE',
      items: [
        {
          orgId: null,
          orgName: null,
          workspaceId: uuid(12),
          workspaceName: '캡스톤 3조',
          keyId: null,
          keyName: null,
          requests: 18,
          inputTokens: 2_400,
          outputTokens: 800,
          attributedCostUsd: 0.124_5,
          pricedRequests: 6,
        },
      ],
      totalItems: 3,
      truncated: true,
    }
  }
  return {
    level: 'ORG',
    items: [
      {
        orgId: uuid(1),
        orgName: '정보컴퓨터공학부 실습지원센터',
        workspaceId: null,
        workspaceName: null,
        keyId: null,
        keyName: null,
        requests: 21,
        inputTokens: 2_700,
        outputTokens: 900,
        attributedCostUsd: 0.124_5,
        pricedRequests: 6,
      },
      {
        orgId: uuid(2),
        orgName: '테스트 기관',
        workspaceId: null,
        workspaceName: null,
        keyId: null,
        keyName: null,
        requests: 6,
        inputTokens: 300,
        outputTokens: 150,
        // 자체 서빙만 쓴 기관. 금액은 0이 아니라 없음이다.
        attributedCostUsd: null,
        pricedRequests: 0,
      },
    ],
    totalItems: 3,
    truncated: true,
  }
}

function quality(systemTier: boolean, globalScope: boolean): AdminLlmUsage['quality'] {
  return {
    rollupLastSuccessAt: '2026-08-31T12:05:00+09:00',
    latestUsageReceivedAt: '2026-08-31T12:04:00+09:00',
    creditMetersTotal: 2,
    creditMetersObserved: 1,
    oldestCreditUsageAt: '2026-08-31T11:30:00+09:00',
    latestCreditUsageAt: '2026-08-31T12:00:00+09:00',
    totalRequests: 27,
    estimatedRequests: 3,
    estimatedRequestRatio: 3 / 27,
    totalTokens: 4_050,
    estimatedTokens: 450,
    estimatedTokenRatio: 450 / 4_050,
    gatewayReportState: 'FRESH',
    usageQueueReportState: 'FRESH',
    lastContactAt: '2026-08-31T12:05:00+09:00',
    lastUsageShipSuccessAt: systemTier ? '2026-08-31T12:04:30+09:00' : null,
    usageQueueObservedAt: systemTier ? '2026-08-31T12:04:40+09:00' : null,
    oldestUnshippedEventAt: systemTier ? '2026-08-31T12:03:00+09:00' : null,
    queuedUsageEvents: systemTier ? 0 : null,
    queuedUsageBytes: systemTier ? 0 : null,
    spoolWriteFailures: systemTier ? 0 : null,
    usageShipFailures: systemTier ? 2 : null,
    usageQueueScanFailures: systemTier ? 0 : null,
    unattributedRequests: systemTier && globalScope ? 0 : null,
    pricedRequests: 6,
    // 27건 중 24건만 경로가 기록돼 있다. 경로 축 도입 전 요청이 섞인 구간을
    // 화면이 그대로 말하는지 보는 자료다.
    endpointRecordedRequests: 24,
  }
}

function breakdown(): AdminLlmUsage['breakdown'] {
  return {
    models: [
      {
        modelName: 'pickle-general',
        requests: 21,
        failed: 1,
        inputTokens: 2_700,
        outputTokens: 900,
        attributedCostUsd: null,
        pricedRequests: 0,
        avgLatencyMs: 820,
      },
      {
        modelName: 'openai/gpt-5.6',
        requests: 6,
        failed: 0,
        inputTokens: 300,
        outputTokens: 150,
        attributedCostUsd: 0.124_5,
        pricedRequests: 6,
        avgLatencyMs: 1_450,
      },
    ],
    endpointKinds: [
      // 셋은 같은 요청 집합을 다르게 자른 것이라 **가격이 붙은 요청 수의 합이
      // 절단면마다 같아야 한다.** 모델별이 6이고 quality 가 6이므로 여기도 6이며,
      // 유료 모델의 6건이 채팅 3건과 이미지 3건으로 갈린 모양이다. 행마다
      // pricedRequests <= requests 도 함께 지킨다.
      {
        endpoint: 'chat',
        requests: 21,
        succeeded: 20,
        // 셋을 더하면 requests 가 된다. 서버가 지키는 불변식을 목이 어기면
        // 화면 시험이 초록으로 거짓말한다.
        rateLimited: 0,
        failed: 1,
        inputTokens: 2_700,
        outputTokens: 900,
        attributedCostUsd: 0.062_3,
        pricedRequests: 3,
        imageCount: 0,
      },
      {
        endpoint: 'images',
        requests: 3,
        succeeded: 3,
        rateLimited: 0,
        failed: 0,
        inputTokens: 90,
        outputTokens: 0,
        attributedCostUsd: 0.062_2,
        pricedRequests: 3,
        imageCount: 3,
      },
      {
        // 경로가 기록되기 전의 요청. 「기타」가 아니라 「종류 미상」이고,
        // 화면이 둘을 같은 조각으로 묶으면 안 된다.
        endpoint: null,
        requests: 3,
        succeeded: 3,
        rateLimited: 0,
        failed: 0,
        inputTokens: 210,
        outputTokens: 150,
        attributedCostUsd: null,
        pricedRequests: 0,
        imageCount: 0,
      },
    ],
    passthroughGrants: [
      { capability: 'images', grantedKeys: 2, usedKeys: 1, requests: 3 },
      // 부여만 되고 아무도 안 쓰는 기능. 이 행이 없는 것이 아니라 0인 것이 답이다.
      { capability: 'embeddings', grantedKeys: 1, usedKeys: 0, requests: 0 },
    ],
  }
}

export function adminLlmUsageFixture({
  days = 7,
  orgId = null,
  workspaceId = null,
  systemTier = true,
}: {
  days?: AdminLlmUsageDays
  orgId?: string | null
  workspaceId?: string | null
  systemTier?: boolean
} = {}): AdminLlmUsage {
  return {
    generatedAt: '2026-08-31T12:05:00+09:00',
    timezone: 'Asia/Seoul',
    from: dayBefore(days - 1),
    to: TO,
    days,
    demand: { windows: windows(), daily: daily(days) },
    consumers: consumers(orgId, workspaceId),
    breakdown: breakdown(),
    limitReview: {
      items: [
        {
          keyId: uuid(501),
          keyName: 'capstone-chatbot',
          orgId: orgId ?? uuid(1),
          orgName: '정보컴퓨터공학부 실습지원센터',
          workspaceId: workspaceId ?? uuid(12),
          workspaceName: '캡스톤 3조',
          status: 'ACTIVE',
          dailyTokens: 100_000,
          todayTokens: 90_000,
          todayUnknownAxisTokens: 1_000,
          quotaExhausted: true,
          creditLimit: 10,
          creditLimitReset: 'MONTHLY',
          creditUsage: 0,
          creditLimitRemaining: 10,
          creditUsageAt: '2026-08-31T12:00:00+09:00',
          creditAxisConnected: true,
          openrouterAccountId: uuid(410),
          openrouterAccountName: 'AI 교육 사업 A',
          pressure: [
            { reason: 'quota_exhausted', requests: 2 },
            { reason: 'credit_exhausted', requests: 1 },
            { reason: 'rate_limit_requests', requests: 3 },
            { reason: 'rate_limit_tokens', requests: 4 },
            { reason: 'rate_limit_concurrency', requests: 5 },
          ],
        },
        {
          keyId: uuid(502),
          keyName: 'batch-summarizer',
          orgId: orgId ?? uuid(1),
          orgName: '정보컴퓨터공학부 실습지원센터',
          workspaceId: workspaceId ?? uuid(12),
          workspaceName: '캡스톤 3조',
          status: 'SUSPENDED',
          dailyTokens: null,
          todayTokens: 0,
          todayUnknownAxisTokens: 0,
          quotaExhausted: false,
          creditLimit: 0,
          creditLimitReset: null,
          creditUsage: null,
          creditLimitRemaining: null,
          creditUsageAt: null,
          creditAxisConnected: false,
          openrouterAccountId: null,
          openrouterAccountName: null,
          pressure: [{ reason: 'rate_limit_requests', requests: 1 }],
        },
      ],
      totalItems: 4,
      truncated: true,
    },
    quality: quality(systemTier, orgId == null && workspaceId == null),
  }
}

export const llmAdminUsageHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/llm/usage', ({ request }) => {
    const url = new URL(request.url)
    adminLlmUsageQueries.push(url.search)
    const orgId = url.searchParams.get('orgId')
    const workspaceId = url.searchParams.get('workspaceId')
    const parsedDays = Number(url.searchParams.get('days'))
    const days: AdminLlmUsageDays = parsedDays === 30 || parsedDays === 90 ? parsedDays : 7
    const profile = profileOf(request)
    const scope = profile ? adminReadScope(profile, orgId, '/api/v1/admin/llm/usage') : null
    if (scope?.notFound) return scope.notFound
    return HttpResponse.json(adminLlmUsageFixture({
      days,
      orgId,
      workspaceId,
      systemTier: profile ? isSysTier(profile.role) : false,
    }))
  }),
]
