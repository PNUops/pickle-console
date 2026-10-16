import type { AdminWorkspaceOption } from '../api/queries'
import { WORKSPACE_KIND_LABELS, type WorkspaceKind } from './labels'
import { listPage } from './list-url'
import { isUuid } from './validation'

export const WORKSPACE_SORTS = [
  { value: 'name-asc', label: '이름 오름차순' },
  { value: 'name-desc', label: '이름 내림차순' },
  { value: 'created-desc', label: '최근 생성순' },
  { value: 'members-desc', label: '구성원 많은 순' },
] as const

export function workspaceListState(params: URLSearchParams) {
  const rawKind = params.get('kind')
  const rawId = params.get('workspaceId')
  const kind = rawKind && Object.hasOwn(WORKSPACE_KIND_LABELS, rawKind) ? rawKind as WorkspaceKind : undefined
  return {
    q: (params.get('q') ?? '').slice(0, 200),
    kind,
    sort: WORKSPACE_SORTS.find((option) => option.value === params.get('sort'))?.value ?? 'name-asc',
    page: listPage(params.get('page')),
    selectedId: rawId && isUuid(rawId) ? rawId.toLowerCase() : rawId,
    tab: ['members', 'invitations', 'resources'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'overview',
    inspect: params.get('inspect') === '1',
  }
}

export function workspaceListParams(
  state: ReturnType<typeof workspaceListState>,
  orgId: string | undefined,
): URLSearchParams {
  const params = new URLSearchParams()
  if (orgId) params.set('org', orgId)
  if (state.q) params.set('q', state.q)
  if (state.kind) params.set('kind', state.kind)
  if (state.sort !== 'name-asc') params.set('sort', state.sort)
  if (state.page > 0) params.set('page', String(state.page))
  if (state.selectedId != null) {
    params.set('workspaceId', state.selectedId)
    if (state.tab !== 'overview') params.set('tab', state.tab)
    if (state.inspect) params.set('inspect', '1')
  }
  return params
}

/** The API returns the complete scoped array, never one server page. */
export function filterWorkspaces(rows: AdminWorkspaceOption[], state: ReturnType<typeof workspaceListState>) {
  const text = state.q.trim().toLocaleLowerCase('ko-KR')
  return rows.filter((row) => (!state.kind || row.kind === state.kind)
    && row.name.toLocaleLowerCase('ko-KR').includes(text)).sort((left, right) => {
    const names = left.name.localeCompare(right.name, 'ko-KR', { numeric: true })
    const difference = state.sort === 'created-desc' ? right.createdAt.localeCompare(left.createdAt)
      : state.sort === 'members-desc' ? right.memberCount - left.memberCount
      : state.sort === 'name-desc' ? -names : names
    return difference || left.id.localeCompare(right.id)
  })
}
