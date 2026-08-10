import { http, HttpResponse } from 'msw'
import type { components } from '../../../api/schema'
import { vmStore } from './vms'

type Schemas = components['schemas']

/**
 * The type-agnostic inventory, derived from the VM store.
 *
 * Built from the same rows the VM list serves so the two surfaces cannot
 * disagree in a test the way they must not disagree on the server.
 */
export const resourceHandlers = [
  http.get('*/api/v1/resources', ({ request }) => {
    const url = new URL(request.url)
    const workspaceId = url.searchParams.get('workspaceId')
    const type = url.searchParams.get('type')
    const size = Number(url.searchParams.get('size') ?? '20')
    const page = Number(url.searchParams.get('page') ?? '0')

    const rows: Schemas['ResourceSummaryResponse'][] = vmStore
      .filter((vm) => (workspaceId == null ? true : vm.workspaceId === Number(workspaceId)))
      .filter(() => type == null || type === 'VM')
      .map((vm) => ({
        id: vm.id,
        type: 'VM',
        name: vm.name,
        displayName: vm.displayName ?? null,
        status: vm.status,
        workspaceId: vm.workspaceId,
        workspaceName: vm.workspaceName,
        accessLimited: false,
        ownerNames: [],
        accessManageAllowed: false,
        createdAt: vm.createdAt,
      }))

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
