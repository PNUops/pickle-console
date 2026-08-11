import { http, HttpResponse } from 'msw'
import type { components } from '../../../api/schema'
import { llmKeyStore, toLlmKeyResourceSummary } from './llm-keys'
import { toResourceSummary, vmStore } from './vms'
import { isMyWorkspace } from './workspaces'

type Schemas = components['schemas']

/**
 * The type-agnostic inventory, derived from each type's own store.
 *
 * Built from the same rows the per-type lists serve, through the same mappings,
 * so the surfaces cannot disagree in a test the way they must not disagree on
 * the server: what is restricted here is restricted there. A type is added by
 * appending its store and mapping to `contributors`.
 *
 * The merge mirrors ResourceIndexService: newest first, ties broken by type
 * name, never by id — the ordering of a UUID differs between the server's
 * language and the database's, so an id tiebreak would only look right.
 */
const contributors = (): Schemas['ResourceSummaryResponse'][] => [
  ...vmStore.map(toResourceSummary),
  ...llmKeyStore.map(toLlmKeyResourceSummary),
]

export const resourceHandlers = [
  http.get('*/api/v1/resources', ({ request }) => {
    const url = new URL(request.url)
    const workspaceId = url.searchParams.get('workspaceId')
    const type = url.searchParams.get('type')
    const size = Number(url.searchParams.get('size') ?? '20')
    const page = Number(url.searchParams.get('page') ?? '0')

    const rows = contributors()
      // 서버와 같은 조회 범위: 내가 구성원인 워크스페이스의 리소스만 보인다.
      .filter((row) => isMyWorkspace(row.workspaceId))
      .filter((row) => (workspaceId == null ? true : row.workspaceId === workspaceId))
      .filter((row) => type == null || type === row.type)
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.type.localeCompare(b.type),
      )

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
