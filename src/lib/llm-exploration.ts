import type { AdminLlmKeysQuery, AdminLlmAccountUsageQuery } from '../api/queries'
import { listPage, updateListParams } from './list-url'
import { safeInternalPath } from './redirect'
import { isUuid } from './validation'

export const KEY_COHORTS: NonNullable<AdminLlmKeysQuery['cohort']>[] = ['ALL', 'COMMITTED', 'AWAITING_PROVISION', 'USAGE_UNREPORTED']
export const KEY_SORTS: NonNullable<AdminLlmKeysQuery['sort']>[] = ['NEWEST', 'NAME_ASC', 'TOKEN_USAGE_DESC', 'CREDIT_LIMIT_DESC', 'CREDIT_REMAINING_ASC']
export const CONSUMER_SORTS: NonNullable<AdminLlmAccountUsageQuery['sort']>[] = ['REQUESTS_DESC', 'TOKENS_DESC', 'REPORTED_COST_DESC']
export const CONSUMER_SORT_LABELS = { REQUESTS_DESC: '요청 많은 순', TOKENS_DESC: '토큰 많은 순', REPORTED_COST_DESC: '보고 금액 많은 순' }
const KEY_STATUSES: NonNullable<AdminLlmKeysQuery['status']>[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED']

export function usageDays(value: string | null): number {
  const days = Number(value)
  return Number.isSafeInteger(days) && days >= 1 && days <= 90 ? days : 30
}

export function explorationPageSize(value: string | null): number | null {
  if (value == null) return 20
  const size = Number(value)
  return /^\d+$/.test(value) && Number.isSafeInteger(size) && size >= 1 && size <= 100 ? size : null
}

/** The existing usage API accepts a day count; derive it only from the displayed response dates. */
export function responseUsageDays(from: string, to: string): number | null {
  const start = Date.parse(from), end = Date.parse(to)
  if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0, 10) !== from || new Date(end).toISOString().slice(0, 10) !== to) return null
  const days = (end - start) / 86_400_000 + 1
  return Number.isSafeInteger(days) && days >= 1 && days <= 90 ? days : null
}

export function keyListState(params: URLSearchParams) {
  let error: string | null = null
  const ids: Pick<AdminLlmKeysQuery, 'workspaceId' | 'requestId' | 'openrouterAccountId'> = {}
  for (const key of ['workspaceId', 'requestId', 'openrouterAccountId'] as const) {
    const value = params.get(key)
    if (value && !isUuid(value)) error = '조회 대상 식별자가 올바르지 않습니다.'
    else if (value) ids[key] = value.toLowerCase()
  }
  const cohort = KEY_COHORTS.find((value) => value === params.get('cohort')) ?? 'ALL'
  const sort = KEY_SORTS.find((value) => value === params.get('sort')) ?? 'NEWEST'
  const status = KEY_STATUSES.find((value) => value === params.get('status'))
  const size = explorationPageSize(params.get('size'))
  if (size == null) error = '페이지 크기는 1~100이어야 합니다.'
  if (params.has('cohort') && !KEY_COHORTS.includes(params.get('cohort') as typeof cohort)
    || params.has('sort') && !KEY_SORTS.includes(params.get('sort') as typeof sort)
    || params.get('status') && !status) error = '조회 구분이나 정렬 조건이 올바르지 않습니다.'
  return { error, query: { ...ids, status, query: params.get('q') || undefined, cohort, sort,
    policyModel: params.get('policyModel') || undefined, policyFeature: params.get('policyFeature') || undefined,
    page: listPage(params.get('page')), size: size ?? 20 } satisfies AdminLlmKeysQuery }
}

/** Return navigation never grants access; the destination still applies its current authority. */
export function llmExplorationReturn(value: string | null, activeOrgId: string | undefined, allowGlobal: boolean): string | null {
  if (!safeInternalPath(value)) return null
  const url = new URL(value!, 'https://pickle.invalid')
  const account = /^\/admin\/llm\/accounts\/([^/]+)$/.exec(url.pathname)?.[1]
  if (url.hash || !['/admin/llm/keys', '/admin/llm/usage'].includes(url.pathname) && (!account || !isUuid(account))) return null
  const org = url.searchParams.get('org') ?? undefined
  if (org && !isUuid(org) || org !== activeOrgId && !(allowGlobal && org == null)) return null
  if (url.pathname === '/admin/llm/keys' && keyListState(url.searchParams).error) return null
  return `${url.pathname}${url.search}`
}

export function accountKeysPath(accountId: string, orgId: string, cohort: AdminLlmKeysQuery['cohort'] = 'ALL') {
  const params = updateListParams(new URLSearchParams({ org: orgId }), { openrouterAccountId: accountId, cohort })
  return `/admin/llm/keys?${params}`
}
