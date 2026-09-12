import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { uuid } from '../ids'
import { workspaceMembersOf } from './workspaces'

type Schemas = components['schemas']
type DnsDomain = Schemas['DnsDomainView']
type RecordSet = Schemas['DnsRecordSetView']

/**
 * One name together with its records.
 *
 * Keeping the records outside the domain row would give two places their own
 * count, and a screen showing one number in the list and another in the detail
 * would go unnoticed. `recordSetCount` is always derived from here.
 */
type Row = { domain: Omit<DnsDomain, 'recordSetCount'>; records: RecordSet[] }

function initialRows(): Row[] {
  return [
    {
      domain: {
        id: uuid(9101),
        fqdn: 'myblog.pusan.dev',
        rootDomain: 'pusan.dev',
        status: 'ACTIVE',
        renewDueAt: '2027-03-11T00:00:00+09:00',
        releasedAt: null,
        reservedUntil: null,
        createdAt: '2026-09-12T10:00:00+09:00',
        workspaceId: uuid(12),
        workspaceName: '캡스톤 3조',
        accessLimited: false,
        accessManageAllowed: true,
        myResourceRole: 'OWNER',
        ownerNames: [],
      },
      records: [
        {
          name: '',
          type: 'A',
          values: ['93.184.216.34'],
          ttl: 300,
          status: 'APPLIED',
          lastError: null,
          appliedAt: '2026-09-12T10:05:00+09:00',
        },
        {
          name: 'www',
          type: 'CNAME',
          values: ['myblog.github.io.'],
          ttl: 300,
          status: 'PENDING',
          lastError: null,
          appliedAt: null,
        },
      ],
    },
    {
      // A row no grant opens: name and owner only, with the record count at 0.
      domain: {
        id: uuid(9102),
        fqdn: 'someone-else.pusan.dev',
        rootDomain: 'pusan.dev',
        status: 'ACTIVE',
        renewDueAt: '2027-01-01T00:00:00+09:00',
        releasedAt: null,
        reservedUntil: null,
        createdAt: '2026-09-01T10:00:00+09:00',
        workspaceId: uuid(12),
        workspaceName: '캡스톤 3조',
        accessLimited: true,
        accessManageAllowed: true,
        // No grant reaches this reader, so no rung — the standing right that
        // lets them hand one out arrives as accessManageAllowed instead.
        myResourceRole: null,
        ownerNames: ['김철수'],
      },
      records: [],
    },
  ]
}

export const dnsDomainStore = {
  rows: initialRows(),
  reset() {
    this.rows = initialRows()
    this.lastReplaceBody = null
    resetDnsDomainAccess()
  },
  /** The body the last save actually sent, so a test can assert it sent everything. */
  lastReplaceBody: null as unknown,
}

function view(row: Row): DnsDomain {
  return { ...row.domain, recordSetCount: row.domain.accessLimited ? 0 : row.records.length }
}

/** ACCESS_TOKENS maps a token string to a profile: the key is the token. */
function authed(request: Request): boolean {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token] != null
}

export const dnsDomainHandlers: RequestHandler[] = [
  http.get('*/api/v1/dns-domains', ({ request }) => {
    if (!authed(request)) return problemResponse({ status: 401, code: 'UNAUTHORIZED', title: '인증이 필요합니다', detail: '인증이 필요합니다' })
    const content = dnsDomainStore.rows.map(view)
    return HttpResponse.json({
      content,
      page: 0,
      size: 20,
      totalElements: content.length,
      totalPages: 1,
    })
  }),
  http.post('*/api/v1/dns-domains', async ({ request }) => {
    if (!authed(request)) return problemResponse({ status: 401, code: 'UNAUTHORIZED', title: '인증이 필요합니다', detail: '인증이 필요합니다' })
    const body = (await request.json()) as { label: string; workspaceId: string }
    const fqdn = `${body.label}.pusan.dev`
    const held = dnsDomainStore.rows.find((row) => row.domain.fqdn === fqdn)
    if (held) {
      // The server revives a name its own workspace is holding in reserve and
      // refuses everybody else with the same conflict an unheld collision gets.
      // Modelling only the refusal made the screens' recovery copy untestable.
      if (held.domain.releasedAt == null || held.domain.workspaceId !== body.workspaceId) {
        return problemResponse({ status: 409, code: 'DOMAIN_FQDN_TAKEN', title: '이미 사용 중인 이름입니다', detail: '이미 사용 중인 이름입니다' })
      }
      held.domain.releasedAt = null
      held.domain.reservedUntil = null
      held.domain.renewDueAt = '2027-09-12T00:00:00+09:00'
      return HttpResponse.json(view(held), { status: 201 })
    }
    const row: Row = {
      domain: {
        // The new row's id is derived stably, so a test can open the detail of
        // the name it just created.
        id: uuid(9200 + dnsDomainStore.rows.length),
        fqdn,
        rootDomain: 'pusan.dev',
        status: 'ACTIVE',
        renewDueAt: '2027-03-11T00:00:00+09:00',
        releasedAt: null,
        reservedUntil: null,
        createdAt: '2026-09-12T12:00:00+09:00',
        workspaceId: body.workspaceId,
        workspaceName: '캡스톤 3조',
        accessLimited: false,
        accessManageAllowed: true,
        myResourceRole: 'OWNER',
        ownerNames: [],
      },
      records: [],
    }
    dnsDomainStore.rows = [row, ...dnsDomainStore.rows]
    return HttpResponse.json(view(row), { status: 201 })
  }),
  http.get('*/api/v1/dns-domains/:domainId', ({ request, params }) => {
    if (!authed(request)) return problemResponse({ status: 401, code: 'UNAUTHORIZED', title: '인증이 필요합니다', detail: '인증이 필요합니다' })
    const row = dnsDomainStore.rows.find((r) => r.domain.id === params.domainId)
    if (!row) return problemResponse({ status: 404, code: 'RESOURCE_NOT_FOUND', title: '해당 도메인이 존재하지 않습니다', detail: '해당 도메인이 존재하지 않습니다' })
    // A row no grant opens is listed but not opened: the server answers an
    // honest 403 to a member of the owning workspace.
    if (row.domain.accessLimited) {
      return problemResponse({ status: 403, code: 'RESOURCE_ACCESS_DENIED', title: '접근 권한이 없습니다', detail: '자원 소유자에게 요청해 주세요.' })
    }
    return HttpResponse.json(view(row))
  }),
  http.delete('*/api/v1/dns-domains/:domainId', ({ request, params }) => {
    if (!authed(request)) return problemResponse({ status: 401, code: 'UNAUTHORIZED', title: '인증이 필요합니다', detail: '인증이 필요합니다' })
    const row = dnsDomainStore.rows.find((r) => r.domain.id === params.domainId)
    if (!row) return problemResponse({ status: 404, code: 'RESOURCE_NOT_FOUND', title: '해당 도메인이 존재하지 않습니다', detail: '해당 도메인이 존재하지 않습니다' })
    // requireStillHeld on the server: a released name takes nothing more.
    if (row.domain.releasedAt != null) {
      return problemResponse({ status: 409, code: 'DOMAIN_NOT_ACTIVE', title: '이미 해제한 도메인입니다', detail: '해제한 이름에는 더 이상 손댈 수 없습니다.' })
    }
    // Release is not deletion: the row stays and the records come down.
    row.domain.releasedAt = '2026-09-12T13:00:00+09:00'
    row.domain.reservedUntil = '2026-10-12T13:00:00+09:00'
    row.records = []
    return new HttpResponse(null, { status: 202 })
  }),
  http.post('*/api/v1/dns-domains/:domainId/renew', ({ request, params }) => {
    if (!authed(request)) return problemResponse({ status: 401, code: 'UNAUTHORIZED', title: '인증이 필요합니다', detail: '인증이 필요합니다' })
    const row = dnsDomainStore.rows.find((r) => r.domain.id === params.domainId)
    if (!row) return problemResponse({ status: 404, code: 'RESOURCE_NOT_FOUND', title: '해당 도메인이 존재하지 않습니다', detail: '해당 도메인이 존재하지 않습니다' })
    // requireStillHeld on the server: a released name takes nothing more.
    if (row.domain.releasedAt != null) {
      return problemResponse({ status: 409, code: 'DOMAIN_NOT_ACTIVE', title: '이미 해제한 도메인입니다', detail: '해제한 이름에는 더 이상 손댈 수 없습니다.' })
    }
    row.domain.renewDueAt = '2027-09-12T00:00:00+09:00'
    return HttpResponse.json(view(row))
  }),
  http.get('*/api/v1/dns-domains/:domainId/records', ({ request, params }) => {
    if (!authed(request)) return problemResponse({ status: 401, code: 'UNAUTHORIZED', title: '인증이 필요합니다', detail: '인증이 필요합니다' })
    const row = dnsDomainStore.rows.find((r) => r.domain.id === params.domainId)
    if (!row) return problemResponse({ status: 404, code: 'RESOURCE_NOT_FOUND', title: '해당 도메인이 존재하지 않습니다', detail: '해당 도메인이 존재하지 않습니다' })
    // A row no grant opens is listed but not opened: the server answers an
    // honest 403 to a member of the owning workspace.
    if (row.domain.accessLimited) {
      return problemResponse({ status: 403, code: 'RESOURCE_ACCESS_DENIED', title: '접근 권한이 없습니다', detail: '자원 소유자에게 요청해 주세요.' })
    }
    return HttpResponse.json(row.records)
  }),
  http.put('*/api/v1/dns-domains/:domainId/records', async ({ request, params }) => {
    if (!authed(request)) return problemResponse({ status: 401, code: 'UNAUTHORIZED', title: '인증이 필요합니다', detail: '인증이 필요합니다' })
    const row = dnsDomainStore.rows.find((r) => r.domain.id === params.domainId)
    if (!row) return problemResponse({ status: 404, code: 'RESOURCE_NOT_FOUND', title: '해당 도메인이 존재하지 않습니다', detail: '해당 도메인이 존재하지 않습니다' })
    const body = (await request.json()) as { records: Schemas['DesiredRecordSet'][] }
    dnsDomainStore.lastReplaceBody = body
    // The server's own range check. Without it a body it would refuse passes
    // here, and a client that stopped sending a usable ttl still goes green.
    const badTtl = body.records.some((set) => (set.ttl ?? 0) < 60 || (set.ttl ?? 0) > 86400)
    const emptyValues = body.records.some((set) => set.values.length === 0)
    if (badTtl || emptyValues) {
      return problemResponse({ status: 422, code: 'VALIDATION_FAILED', title: '레코드를 저장할 수 없습니다', detail: 'TTL은 60~86400초이고 값은 하나 이상이어야 합니다.' })
    }
    // The desired state entire: as on the server, a set missing here is gone.
    row.records = body.records.map((set) => ({
      name: set.name,
      type: set.type,
      values: set.values,
      ttl: set.ttl ?? 0,
      status: 'PENDING',
      lastError: null,
      appliedAt: null,
    }))
    return HttpResponse.json(row.records)
  }),
]

/* ─── Access list ─── */

const dnsDomainAccessStore: Record<string, Schemas['ResourceAccessGrantView'][]> = {}

export function resetDnsDomainAccess() {
  for (const key of Object.keys(dnsDomainAccessStore)) delete dnsDomainAccessStore[key]
  dnsDomainAccessStore[uuid(9101)] = [
    {
      id: uuid(9301),
      granteeType: 'USER',
      user: { userId: uuid(2), name: '김철수', email: 'chulsoo@pusan.ac.kr' },
      role: 'OWNER',
      createdAt: '2026-09-12T10:00:00+09:00',
    },
  ]
}
resetDnsDomainAccess()

function accessProblem(status: number, code: string, title: string, detail: string) {
  return problemResponse({ status, code, title, detail })
}

function domainFor(domainId: unknown) {
  return dnsDomainStore.rows.find((row) => row.domain.id === String(domainId))
}

let nextDnsGrantId = 9400

export const dnsDomainAccessHandlers: RequestHandler[] = [
  http.get('*/api/v1/dns-domains/:domainId/access', ({ params }) => {
    const row = domainFor(params.domainId)
    if (!row) return accessProblem(404, 'RESOURCE_NOT_FOUND', '해당 도메인이 존재하지 않습니다', '해당 도메인이 존재하지 않습니다')
    if (!row.domain.accessManageAllowed) {
      return accessProblem(403, 'RESOURCE_ACCESS_DENIED', '접근 권한이 없습니다', '접근 권한을 관리할 수 없습니다.')
    }
    return HttpResponse.json({
      resource: {
        id: row.domain.id,
        type: 'DOMAIN',
        name: row.domain.fqdn,
        displayName: null,
        status: row.domain.status,
        workspaceId: row.domain.workspaceId!,
        workspaceName: row.domain.workspaceName,
      },
      grants: dnsDomainAccessStore[row.domain.id] ?? [],
    } satisfies Schemas['ResourceAccessListResponse'])
  }),
  http.post('*/api/v1/dns-domains/:domainId/access', async ({ params, request }) => {
    const row = domainFor(params.domainId)
    if (!row) return accessProblem(404, 'RESOURCE_NOT_FOUND', '해당 도메인이 존재하지 않습니다', '해당 도메인이 존재하지 않습니다')
    if (!row.domain.accessManageAllowed) {
      return accessProblem(403, 'RESOURCE_ACCESS_DENIED', '접근 권한이 없습니다', '접근 권한을 관리할 수 없습니다.')
    }
    const body = (await request.json()) as Schemas['AddResourceAccessGrantRequest']
    const grants = (dnsDomainAccessStore[row.domain.id] ??= [])
    // The server caps a workspace-wide grant below editor, as it does for every
    // other resource kind.
    if (body.granteeType === 'WORKSPACE' && (body.role === 'OWNER' || body.role === 'EDITOR')) {
      return accessProblem(422, 'VALIDATION_FAILED', '입력값이 올바르지 않습니다', '워크스페이스 전체에는 참여자 또는 열람자까지만 부여할 수 있습니다.')
    }
    const member = workspaceMembersOf(row.domain.workspaceId).find((m) => m.userId === body.userId)
    if (body.granteeType === 'USER' && !member) {
      return accessProblem(422, 'VALIDATION_FAILED', '입력값이 올바르지 않습니다', '이 도메인을 소유한 워크스페이스의 구성원만 접근 권한을 받을 수 있습니다.')
    }
    const grant: Schemas['ResourceAccessGrantView'] = {
      id: uuid(nextDnsGrantId++),
      granteeType: body.granteeType,
      user: member ? { userId: member.userId, name: member.name, email: member.email } : null,
      role: body.role,
      createdAt: '2026-09-12T11:00:00+09:00',
    }
    grants.push(grant)
    return HttpResponse.json(grant, { status: 201 })
  }),
  http.patch('*/api/v1/dns-domains/:domainId/access/:grantId', async ({ params, request }) => {
    const row = domainFor(params.domainId)
    if (!row) return accessProblem(404, 'RESOURCE_NOT_FOUND', '해당 도메인이 존재하지 않습니다', '해당 도메인이 존재하지 않습니다')
    const grant = (dnsDomainAccessStore[row.domain.id] ?? []).find((g) => g.id === String(params.grantId))
    if (!grant) return accessProblem(404, 'RESOURCE_NOT_FOUND', '해당 부여가 존재하지 않습니다', '해당 부여가 존재하지 않습니다')
    const body = (await request.json()) as Schemas['UpdateResourceAccessGrantRequest']
    grant.role = body.role
    return HttpResponse.json(grant)
  }),
  http.delete('*/api/v1/dns-domains/:domainId/access/:grantId', ({ params }) => {
    const row = domainFor(params.domainId)
    if (!row) return accessProblem(404, 'RESOURCE_NOT_FOUND', '해당 도메인이 존재하지 않습니다', '해당 도메인이 존재하지 않습니다')
    const grants = dnsDomainAccessStore[row.domain.id] ?? []
    const index = grants.findIndex((g) => g.id === String(params.grantId))
    if (index < 0) return accessProblem(404, 'RESOURCE_NOT_FOUND', '해당 부여가 존재하지 않습니다', '해당 부여가 존재하지 않습니다')
    grants.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),
]
