import { http, HttpResponse, type RequestHandler } from 'msw'
import type { AdminLlmPerformance, AdminLlmUsageDays } from '../../../api/queries'
import { canQueryWork, hasWork, SYS_READERS } from '../../../auth/institution-authority'
import { mockAuthorityActor } from '../institution-authority'
import { uuid } from '../ids'
import { ACCESS_TOKENS, problemResponse } from './auth'

const TO = '2026-11-12'
const MODELS = ['pickle-general', 'openai/gpt-6.1', 'anthropic/claude-sonnet-4.5', 'google/gemini-3-pro']
const rows = Array.from({ length: 9 }, (_institution, institution) => Array.from({ length: 4 }, (_workspace, workspace) =>
  Array.from({ length: 2 }, (_key, key) => Array.from({ length: 11 }, (_month, month) => {
    const requests = 1_500 + institution * 180 + workspace * 100 + key * 70 + month * 290
    return {
      day: `2026-${String(month + 1).padStart(2, '0')}-${month === 10 ? '09' : '15'}`,
      orgId: uuid(institution + 1), orgName: institution === 0 ? '정보컴퓨터공학부' : `실습 기관 ${institution + 1}`,
      workspaceId: uuid(institution === 0 ? 12 + workspace : 1200 + institution * 4 + workspace),
      workspaceName: ['클라우드 실습', 'AI 활용 교육', '연구 프로젝트', '캡스톤 프로젝트'][workspace],
      keyId: uuid(171 + institution * 8 + workspace * 2 + key), keyName: `실습 키 ${key + 1}`,
      publicModelName: MODELS[(workspace + key + month) % MODELS.length], requests,
      inputTokens: requests * (600 + month * 30), outputTokens: requests * (120 + month * 10),
      estimatedRequests: month % 3 === 0 ? Math.floor(requests / 10) : 0,
    }
  })).flat()).flat()).flat()

type Row = typeof rows[number]

function before(days: number): string {
  const date = new Date(`${TO}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days + 1)
  return date.toISOString().slice(0, 10)
}

export function llmPerformanceFixture({ days, orgId, workspaceId, allowed = () => true }: {
  days?: AdminLlmUsageDays; orgId?: string | null; workspaceId?: string | null; allowed?: (row: Row) => boolean;
} = {}): AdminLlmPerformance {
  const selected = rows.filter((row) => (!orgId || row.orgId === orgId) && (!workspaceId || row.workspaceId === workspaceId) && (!days || row.day >= before(days)) && allowed(row))
  const from = days ? before(days) : selected[0]?.day ?? null
  const granularity = from && (Date.parse(TO) - Date.parse(from)) / 86_400_000 > 180 ? 'MONTH' : 'DAY'
  const totals = { requests: 0, inputTokens: 0, outputTokens: 0, estimatedRequests: 0, usedModelCount: 0, cachedInputTokens: 0, reasoningTokens: 0, streamedRequests: 0 }
  const trend = new Map<string, { periodStart: string; requests: number; inputTokens: number; outputTokens: number }>()
  const models = new Map<string, { publicModelName: string; requests: number; inputTokens: number; outputTokens: number }>()
  const consumers = new Map<string, { id: string; name: string; requests: number; inputTokens: number; outputTokens: number }>()
  const level = workspaceId ? 'KEY' : orgId ? 'WORKSPACE' : 'ORG'
  for (const row of selected) {
    for (const field of ['requests', 'inputTokens', 'outputTokens', 'estimatedRequests'] as const) totals[field] += row[field]
    totals.cachedInputTokens += Math.floor(row.inputTokens * 0.6)
    totals.reasoningTokens += Math.floor(row.outputTokens * 0.2)
    totals.streamedRequests += Math.floor(row.requests * 0.3)
    const periodStart = granularity === 'MONTH' ? row.day.slice(0, 7) + '-01' : row.day
    const point = trend.get(periodStart) ?? { periodStart, requests: 0, inputTokens: 0, outputTokens: 0 }
    const model = models.get(row.publicModelName) ?? { publicModelName: row.publicModelName, requests: 0, inputTokens: 0, outputTokens: 0 }
    const id = level === 'ORG' ? row.orgId : level === 'WORKSPACE' ? row.workspaceId : row.keyId
    const consumer = consumers.get(id) ?? { id, name: level === 'ORG' ? row.orgName : level === 'WORKSPACE' ? row.workspaceName : row.keyName, requests: 0, inputTokens: 0, outputTokens: 0 }
    for (const field of ['requests', 'inputTokens', 'outputTokens'] as const) {
      point[field] += row[field]; model[field] += row[field]; consumer[field] += row[field]
    }
    trend.set(periodStart, point); models.set(row.publicModelName, model); consumers.set(id, consumer)
  }
  totals.usedModelCount = models.size
  const modelRows = [...models.values()].sort((a, b) => b.requests - a.requests)
  const consumerRows = [...consumers.values()].sort((a, b) => b.requests - a.requests)
  return {
    days: days ?? null, from, to: TO, timezone: 'Asia/Seoul', totals,
    population: {
      institutionCount: new Set(selected.map((row) => row.orgId)).size,
      workspaceCount: new Set(selected.map((row) => row.workspaceId)).size,
      keyCount: new Set(selected.map((row) => row.keyId)).size,
    }, granularity, trend: [...trend.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
    models: modelRows.slice(0, 8), otherModelRequests: modelRows.slice(8).reduce((sum, row) => sum + row.requests, 0),
    consumers: { level, items: consumerRows.slice(0, 8), totalItems: consumerRows.length, otherRequests: consumerRows.slice(8).reduce((sum, row) => sum + row.requests, 0), unattributedRequests: 0 },
    rollupLastSuccessAt: '2026-11-12T12:00:00+09:00', gatewayReportState: 'FRESH', usageQueueReportState: 'FRESH',
  }
}

export const llmPerformanceHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/llm/usage/performance', ({ request }) => {
    const url = new URL(request.url)
    const orgId = url.searchParams.get('orgId')
    const workspaceId = url.searchParams.get('workspaceId')
    const rawDays = url.searchParams.get('days')
    if (rawDays != null && !['7', '30', '90'].includes(rawDays)) return problemResponse({ status: 422, title: '기간을 확인해 주세요.', code: 'VALIDATION_FAILED' })
    const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const profile = ACCESS_TOKENS[token]
    const actor = profile ? mockAuthorityActor(profile) : null
    if (!actor) return problemResponse({ status: 403, title: '조회 권한이 없어요.', code: 'ACCESS_DENIED' })
    const allowed = (row: Row) => hasWork(actor, 'llm.observe', { orgId: row.orgId, workspaceId: row.workspaceId }, SYS_READERS)
    if (!canQueryWork(actor, ['llm.observe'], { orgId, workspaceId }, SYS_READERS)) return problemResponse({ status: 403, title: '조회 권한이 없어요.', code: 'ACCESS_DENIED' })
    return HttpResponse.json(llmPerformanceFixture({ days: rawDays == null ? undefined : Number(rawDays) as AdminLlmUsageDays, orgId, workspaceId, allowed }))
  }),
]
