import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'
import { vmStore } from './vms'
import { uuid } from '../ids'

type Schemas = components['schemas']
type PortForwardingView = Schemas['PortForwardingView']
type AdminPortMappingView = Schemas['AdminPortMappingResponse']
type AdminRelayView = Schemas['AdminRelayView']

/** 릴레이 공개 호스트 — 테스트 픽스처 (RFC 5737 문서용 대역). */
export const RELAY_PUBLIC_HOST = '203.0.113.10'
/** 반영 대기(PENDING) 매핑이 활성(ACTIVE)으로 전이하기까지의 목록 GET 횟수 (폴링 테스트). */
export const FORWARDING_ACTIVE_AFTER_FETCHES = 2
/** 발급 응답에 단 한 번 나타나는 목 토큰 (64자 hex 형식). */
export const RELAY_TOKEN_PLAINTEXT =
  '3f6c1b2ae94d4d0cbb1f8a5e7c2d9e10aa55bb66cc77dd88ee99ff00a1b2c3d4'

interface ForwardingRecord {
  id: string
  vmId: string
  relayId: string
  proto: Schemas['PortMappingProto']
  publicPort: number
  targetPort: number
  status: Schemas['PortMappingStatus']
  suspendedReason: string | null
  suspendedBy: string | null
  /** true면 릴레이가 적용 실패를 보고한 매핑 (applyState FAILED). */
  applyFailed: boolean
  /** PENDING 전이 카운터 — 목록 GET마다 증가, 임계에 닿으면 ACTIVE. */
  fetchesSincePending: number | null
  guards: {
    ctMax: number | null
    newConnRate: number | null
    newConnBurst: number | null
    perSourceRate: number | null
    perSourceBurst: number | null
  }
  createdBy: string
  createdAt: string
}

const defaultGuards = () => ({
  ctMax: null,
  newConnRate: null,
  newConnBurst: null,
  perSourceRate: null,
  perSourceBurst: null,
})

function initialForwardings(): ForwardingRecord[] {
  return [
    {
      // algo-judge(56, 워크스페이스 15 — 로그인 사용자는 MEMBER): 읽기 전용 목록 확인용.
      id: uuid(101),
      vmId: uuid(56),
      relayId: uuid(1),
      proto: 'TCP',
      publicPort: 12345,
      targetPort: 8080,
      status: 'ACTIVE',
      suspendedReason: null,
      suspendedBy: null,
      applyFailed: false,
      fetchesSincePending: null,
      guards: defaultGuards(),
      createdBy: uuid(57),
      createdAt: '2026-07-11T10:00:00+09:00',
    },
    {
      // 정지된 매핑 — 관리자 정지 해제·사용자 정지 표시 확인용.
      id: uuid(102),
      vmId: uuid(56),
      relayId: uuid(1),
      proto: 'UDP',
      publicPort: 13001,
      targetPort: 51820,
      status: 'SUSPENDED',
      suspendedReason: '과도한 트래픽 발생',
      suspendedBy: uuid(5),
      applyFailed: false,
      fetchesSincePending: null,
      guards: defaultGuards(),
      createdBy: uuid(57),
      createdAt: '2026-07-11T11:00:00+09:00',
    },
    {
      // build-server(45, 워크스페이스 12 — 로그인 사용자는 OWNER): 삭제 흐름 확인용.
      id: uuid(103),
      vmId: uuid(45),
      relayId: uuid(1),
      proto: 'TCP',
      publicPort: 14000,
      targetPort: 3000,
      status: 'ACTIVE',
      suspendedReason: null,
      suspendedBy: null,
      applyFailed: false,
      fetchesSincePending: null,
      guards: defaultGuards(),
      createdBy: uuid(42),
      createdAt: '2026-07-11T12:00:00+09:00',
    },
  ]
}

type RelayRecord = AdminRelayView

function initialRelays(): RelayRecord[] {
  return [
    {
      id: uuid(1),
      name: 'relay-1',
      publicHost: RELAY_PUBLIC_HOST,
      bandStart: 10000,
      bandEnd: 19999,
      enabled: true,
      tokenIssued: true,
      mappingGeneration: 42,
      appliedGeneration: 42,
      lastContactAt: '2026-07-12T08:59:50+09:00',
      contactLost: false,
      agentVersion: '0.1.0',
      lastError: null,
      mappingCount: 2,
      bandUsagePercent: 3,
    },
    {
      // 이상 상태 릴레이 — 접촉 두절 + 적용 지연 + 적용 실패 + 대역 사용률 경고.
      id: uuid(2),
      name: 'relay-2',
      publicHost: null,
      bandStart: 20000,
      bandEnd: 29999,
      enabled: true,
      tokenIssued: false,
      mappingGeneration: 8,
      appliedGeneration: 5,
      lastContactAt: '2026-07-12T06:00:00+09:00',
      contactLost: true,
      agentVersion: '0.0.9',
      lastError: '매핑 8: nft 적용 실패 (대상 주소 검증 오류)',
      mappingCount: 8700,
      bandUsagePercent: 87,
    },
  ]
}

export let forwardingStore: ForwardingRecord[] = initialForwardings()
export let relayStore: RelayRecord[] = initialRelays()
let nextForwardingId = 200
let nextPublicPort = 15000

export function resetNetworkFixtures() {
  forwardingStore = initialForwardings()
  relayStore = initialRelays()
  nextForwardingId = 200
  nextPublicPort = 15000
}

const notFound = () =>
  problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '요청한 리소스가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })

const validationFailed = (instance: string, field: string, message: string) =>
  problemResponse({
    type: 'about:blank',
    title: '입력값이 올바르지 않습니다',
    status: 422,
    detail: '요청 값을 확인해 주세요.',
    instance,
    code: 'VALIDATION_FAILED',
    errors: [{ field, message }],
  })

function applyState(record: ForwardingRecord): Schemas['PortForwardApplyState'] {
  if (record.applyFailed) return 'FAILED'
  return record.fetchesSincePending != null ? 'PENDING' : 'ACTIVE'
}

function toUserView(record: ForwardingRecord): PortForwardingView {
  const relay = relayStore.find((r) => r.id === record.relayId)
  return {
    id: record.id,
    proto: record.proto,
    publicHost: relay?.publicHost ?? null,
    publicPort: record.publicPort,
    targetPort: record.targetPort,
    status: record.status,
    applyState: applyState(record),
    createdAt: record.createdAt,
  }
}

function toAdminView(record: ForwardingRecord): AdminPortMappingView {
  const vm = vmStore.find((v) => v.id === record.vmId)
  const relay = relayStore.find((r) => r.id === record.relayId)
  return {
    id: record.id,
    vmId: record.vmId,
    vmName: vm?.name ?? null,
    relayId: record.relayId,
    relayName: relay?.name ?? `relay-${record.relayId}`,
    proto: record.proto,
    publicPort: record.publicPort,
    targetPort: record.targetPort,
    status: record.status,
    applyState: applyState(record),
    suspendedReason: record.suspendedReason,
    suspendedBy: record.suspendedBy,
    ...record.guards,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  }
}

/** PENDING 매핑의 폴링 전이 — 목록 GET마다 카운터를 올려 임계에서 ACTIVE로. */
function advancePending(records: ForwardingRecord[]) {
  for (const record of records) {
    if (record.fetchesSincePending == null) continue
    record.fetchesSincePending += 1
    if (record.fetchesSincePending >= FORWARDING_ACTIVE_AFTER_FETCHES) {
      record.fetchesSincePending = null
    }
  }
}

function paginate<T>(items: T[], page: number, size: number) {
  return {
    content: items.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / size)),
  }
}

export const networkHandlers: RequestHandler[] = [
  /* ─── 포트포워딩 (사용자) ─── */
  http.get('*/api/v1/vms/:vmId/port-forwardings', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    const records = forwardingStore
      .filter((f) => f.vmId === vm.id)
      .sort((a, b) => b.id.localeCompare(a.id))
    const views = records.map(toUserView)
    advancePending(records)
    return HttpResponse.json(views, { status: 200 })
  }),

  http.post('*/api/v1/vms/:vmId/port-forwardings', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    const instance = `/api/v1/vms/${vm.id}/port-forwardings`
    if (vm.status !== 'RUNNING' || vm.ipAddress == null) {
      return problemResponse({
        type: 'about:blank',
        title: '현재 상태에서는 포트포워딩을 만들 수 없습니다',
        status: 409,
        detail: '실행 중이고 내부 IP가 할당된 VM만 포트포워딩을 만들 수 있습니다.',
        instance,
        code: 'VM_INVALID_STATE',
      })
    }
    const body = (await request.json().catch(() => ({}))) as Schemas['CreatePortForwardingRequest']
    if (
      typeof body.targetPort !== 'number' ||
      body.targetPort < 1 ||
      body.targetPort > 65535
    ) {
      return validationFailed(instance, 'targetPort', '포트는 1–65535 범위여야 합니다.')
    }
    const record: ForwardingRecord = {
      id: uuid(nextForwardingId++),
      vmId: vm.id,
      relayId: uuid(1),
      proto: body.proto,
      publicPort: nextPublicPort++,
      targetPort: body.targetPort,
      status: 'ACTIVE',
      suspendedReason: null,
      suspendedBy: null,
      applyFailed: false,
      fetchesSincePending: 0,
      guards: defaultGuards(),
      createdBy: uuid(42),
      createdAt: '2026-07-12T09:00:00+09:00',
    }
    forwardingStore.push(record)
    return HttpResponse.json(toUserView(record), { status: 201 })
  }),

  http.delete('*/api/v1/vms/:vmId/port-forwardings/:portForwardingId', ({ params }) => {
    const index = forwardingStore.findIndex(
      (f) =>
        f.id === String(params.portForwardingId) && f.vmId === String(params.vmId),
    )
    if (index < 0) return notFound()
    forwardingStore.splice(index, 1)
    return HttpResponse.json(
      { message: '포트포워딩 삭제를 접수했습니다. 잠시 후 외부 접근이 차단됩니다.' },
      { status: 202 },
    )
  }),

  /* ─── 릴레이 (관리자) ─── */
  http.get('*/api/v1/admin/relays', () =>
    HttpResponse.json(relayStore satisfies AdminRelayView[], { status: 200 }),
  ),

  http.post('*/api/v1/admin/relays/:relayId/token', ({ params }) => {
    const relay = relayStore.find((r) => r.id === String(params.relayId))
    if (!relay) return notFound()
    relay.tokenIssued = true
    const response: Schemas['RelayTokenResponse'] = {
      relayId: relay.id,
      token: RELAY_TOKEN_PLAINTEXT,
    }
    return HttpResponse.json(response, { status: 200 })
  }),

  /* ─── 포트 매핑 (관리자) ─── */
  http.get('*/api/v1/admin/port-mappings', ({ request }) => {
    const url = new URL(request.url)
    const relayId = url.searchParams.get('relayId')
    const vmId = url.searchParams.get('vmId')
    const status = url.searchParams.get('status')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const records = forwardingStore
      .filter((f) => !relayId || f.relayId === relayId)
      .filter((f) => !vmId || f.vmId === vmId)
      .filter((f) => !status || f.status === status)
      .sort((a, b) => b.id.localeCompare(a.id))
    const views = records.map(toAdminView)
    advancePending(records)
    return HttpResponse.json(paginate(views, page, size), { status: 200 })
  }),

  http.post('*/api/v1/admin/port-mappings/:mappingId/suspend', async ({ params, request }) => {
    const record = forwardingStore.find((f) => f.id === String(params.mappingId))
    if (!record) return notFound()
    const instance = `/api/v1/admin/port-mappings/${record.id}/suspend`
    const body = (await request.json().catch(() => ({}))) as { reason?: string }
    if (!body.reason || body.reason.trim() === '') {
      return validationFailed(instance, 'reason', '정지 사유를 입력해 주세요.')
    }
    if (record.status === 'SUSPENDED') {
      return problemResponse({
        type: 'about:blank',
        title: '이미 정지된 매핑입니다',
        status: 409,
        detail: '이 포트 매핑은 이미 정지되어 있습니다.',
        instance,
        code: 'VM_INVALID_STATE',
      })
    }
    record.status = 'SUSPENDED'
    record.suspendedReason = body.reason.trim()
    record.suspendedBy = uuid(5)
    // 계약: 갱신된 매핑을 200으로 돌려준다 (릴레이 반영은 비동기).
    return HttpResponse.json(toAdminView(record), { status: 200 })
  }),

  http.post('*/api/v1/admin/port-mappings/:mappingId/unsuspend', ({ params }) => {
    const record = forwardingStore.find((f) => f.id === String(params.mappingId))
    if (!record) return notFound()
    if (record.status !== 'SUSPENDED') {
      return problemResponse({
        type: 'about:blank',
        title: '정지 상태가 아닌 매핑입니다',
        status: 409,
        detail: '이 포트 매핑은 정지되어 있지 않습니다.',
        instance: `/api/v1/admin/port-mappings/${record.id}/unsuspend`,
        code: 'VM_INVALID_STATE',
      })
    }
    record.status = 'ACTIVE'
    record.suspendedReason = null
    record.suspendedBy = null
    return HttpResponse.json(toAdminView(record), { status: 200 })
  }),

  http.delete('*/api/v1/admin/port-mappings/:mappingId', ({ params }) => {
    const index = forwardingStore.findIndex((f) => f.id === String(params.mappingId))
    if (index < 0) return notFound()
    forwardingStore.splice(index, 1)
    return HttpResponse.json({ message: '포트 매핑 삭제를 접수했습니다.' }, { status: 202 })
  }),

  http.patch('*/api/v1/admin/port-mappings/:mappingId/guards', async ({ params, request }) => {
    const record = forwardingStore.find((f) => f.id === String(params.mappingId))
    if (!record) return notFound()
    const body = (await request.json().catch(() => ({}))) as Partial<
      ForwardingRecord['guards']
    >
    const keys = [
      'ctMax',
      'newConnRate',
      'newConnBurst',
      'perSourceRate',
      'perSourceBurst',
    ] as const
    if (!keys.some((key) => key in body)) {
      return validationFailed(
        `/api/v1/admin/port-mappings/${record.id}/guards`,
        'ctMax',
        '조정할 가드 필드를 최소 한 개 지정해 주세요.',
      )
    }
    for (const key of keys) {
      if (key in body) record.guards[key] = body[key] ?? null
    }
    return HttpResponse.json(toAdminView(record), { status: 200 })
  }),
]
