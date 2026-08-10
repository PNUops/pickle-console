import { http, HttpResponse } from 'msw'
import type { components } from '../../../api/schema'
import { toResourceSummary, vmStore } from './vms'
import { isMyWorkspace } from './workspaces'

type Schemas = components['schemas']

/**
 * The type-agnostic inventory, derived from the VM store.
 *
 * Built from the same rows the VM list serves, through the same mapping, so
 * the two surfaces cannot disagree in a test the way they must not disagree on
 * the server: what is restricted here is restricted there.
 */
export const resourceHandlers = [
  http.get('*/api/v1/resources', ({ request }) => {
    const url = new URL(request.url)
    const workspaceId = url.searchParams.get('workspaceId')
    const type = url.searchParams.get('type')
    const size = Number(url.searchParams.get('size') ?? '20')
    const page = Number(url.searchParams.get('page') ?? '0')

    const rows: Schemas['ResourceSummaryResponse'][] = vmStore
      // 서버와 같은 조회 범위: 내가 구성원인 워크스페이스의 리소스만 보인다.
      .filter((vm) => isMyWorkspace(vm.workspaceId))
      .filter((vm) => (workspaceId == null ? true : vm.workspaceId === Number(workspaceId)))
      .filter(() => type == null || type === 'VM')
      .map(toResourceSummary)

    const start = page * size
    return HttpResponse.json(
      {
        content: rows.slice(start, start + size),
        page,
        size,
        totalElements: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / size)),
      } satisfies Schemas['PageResponseResourceSummaryResponse'],
      { status: 200 },
    )
  }),
]
