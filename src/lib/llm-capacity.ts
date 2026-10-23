import { isUuid } from './validation'
import { safeInternalPath } from './redirect'
import { listPage } from './list-url'
import type { LlmCapacityQuery } from '../api/queries'

const REASON_CATEGORIES = ['USER_QUOTA', 'ENDPOINT_POLICY', 'MODEL_POLICY', 'LARGE_REQUEST', 'GLOBAL_ADMISSION', 'PROVIDER', 'INPUT', 'AUTHENTICATION', 'SERVICE', 'CANCELED', 'UNCLASSIFIED'] as const

export const CAPACITY_WINDOWS = [
  { label: '1시간', seconds: 3600 },
  { label: '6시간', seconds: 6 * 3600 },
  { label: '24시간', seconds: 24 * 3600 },
  { label: '7일', seconds: 7 * 86400 },
  { label: '30일', seconds: 30 * 86400 },
  { label: '90일', seconds: 90 * 86400 },
] as const

export function capacityWindow(seconds: number, now = Date.now()) {
  const to = new Date(Math.floor(now / 60_000) * 60_000).toISOString()
  return { from: new Date(Date.parse(to) - seconds * 1000).toISOString(), to }
}

function instant(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined
  const parsed = Date.parse(value)
  const civil = Date.parse(`${value.slice(0, 19)}Z`)
  if (!Number.isFinite(parsed) || !Number.isFinite(civil) || new Date(civil).toISOString().slice(0, 19) !== value.slice(0, 19)) return undefined
  return new Date(parsed).toISOString()
}

/** Parse the visible request without silently broadening an invalid filter. */
export function capacityState(params: URLSearchParams, fallback: ReturnType<typeof capacityWindow>) {
  const from = params.has('from') ? instant(params.get('from')) : fallback.from
  const to = params.has('to') ? instant(params.get('to')) : fallback.to
  let error: string | null = null
  if (!from || !to || Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 90 * 86400_000) {
    error = '조회 시작·종료 시각을 확인해 주세요. 기간은 0보다 크고 90일 이하여야 합니다.'
  }
  const ids: { workspaceId?: string; upstreamId?: string } = {}
  for (const field of ['workspaceId', 'upstreamId'] as const) {
    const value = params.get(field)
    if (value && !isUuid(value)) error = '조회 대상의 식별자가 올바르지 않습니다.'
    else if (value) ids[field] = value.toLowerCase()
  }
  const rawGroup = params.get('group')
  const group: NonNullable<LlmCapacityQuery['group']> = rawGroup === 'ORG' || rawGroup === 'KEY' ? rawGroup : 'WORKSPACE'
  if (rawGroup && !['ORG', 'WORKSPACE', 'KEY'].includes(rawGroup)) error = '소비처 구분이 올바르지 않습니다.'
  const bucket = params.get('bucketSeconds')
  const bucketSeconds = bucket && /^\d+$/.test(bucket) && Number.isSafeInteger(Number(bucket)) && Number(bucket) > 0 ? Number(bucket) : undefined
  if (bucket && !bucketSeconds) error = '집계 간격이 올바르지 않습니다.'
  const errorTypeMissing = params.get('errorTypeMissing')
  if (errorTypeMissing && !['true', 'false'].includes(errorTypeMissing)) error = '원인 미기록 필터가 올바르지 않습니다.'
  if (errorTypeMissing === 'true' && params.get('errorType')) error = '원인과 원인 미기록 필터를 동시에 선택할 수 없습니다.'
  const rawCategory = params.get('reasonCategory')
  const reasonCategory = REASON_CATEGORIES.find((category) => category === rawCategory)
  if (rawCategory && !reasonCategory) error = '원인 분류 필터가 올바르지 않습니다.'
  return {
    error,
    query: {
      from: from ?? fallback.from, to: to ?? fallback.to, ...ids,
      publicModelName: params.get('publicModelName') || undefined,
      errorType: params.get('errorType') || undefined,
      errorTypeMissing: params.get('errorTypeMissing') === 'true' ? true : undefined,
      reasonCategory,
      group, page: listPage(params.get('page')), size: 20, bucketSeconds,
    },
  }
}

/** Allow only this read surface as a detail return, with its original scope. */
export function capacityReturn(value: string | null, activeOrgId: string | undefined, systemTier: boolean): string | null {
  if (!safeInternalPath(value)) return null
  const url = new URL(value!, 'https://pickle.invalid')
  const org = url.searchParams.get('org') ?? undefined
  if (url.pathname !== '/admin/llm/status' || url.hash || url.searchParams.get('tab') !== 'metrics'
    || url.searchParams.get('view') !== 'capacity' || org && !isUuid(org)
    || !systemTier && org !== activeOrgId || capacityState(url.searchParams, capacityWindow(86400)).error) return null
  if (!url.searchParams.has('from') || !url.searchParams.has('to')) return null
  const next = new URLSearchParams()
  for (const key of ['org', 'tab', 'view', 'from', 'to', 'workspaceId', 'upstreamId', 'publicModelName', 'errorType', 'errorTypeMissing', 'reasonCategory', 'group', 'page', 'bucketSeconds']) {
    const item = url.searchParams.get(key)
    if (item) next.set(key, item)
  }
  return `${url.pathname}?${next}`
}
