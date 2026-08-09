import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'
import { vmStore } from './vms'

type Schemas = components['schemas']
type CampusIpRequestView = Schemas['CampusIpRequestView']
type AdminCampusIpRequestView = Schemas['AdminCampusIpRequestView']
type CampusIpRequestStatus = Schemas['CampusIpRequestStatus']

/** 연결된 교내 IP 픽스처 — 캠퍼스 대역(10.0.0.0/8) 안의 주소여야 한다. */
export const GRANTED_CAMPUS_IP = '10.20.30.40'

interface CampusIpRecord {
  id: number
  vmId: number
  purpose: string
  ports: number[]
  status: CampusIpRequestStatus
  grantedAddress: string | null
  adminNote: string | null
  requestedBy: number
  requesterEmail: string
  processedAt: string | null
  processedBy: number | null
  createdAt: string
}

function initialRequests(): CampusIpRecord[] {
  return [
    {
      // shop-app(63, 워크스페이스 12) — 승인 대기 신청 (관리자 전환·사용자 상태 카드용).
      id: 7,
      vmId: 63,
      purpose: '학과 실습 서버 외부 연동 (교내망 고정 주소 필요)',
      ports: [80, 443],
      status: 'REQUESTED',
      grantedAddress: null,
      adminNote: null,
      requestedBy: 7,
      requesterEmail: 'admin.kim@pusan.ac.kr',
      processedAt: null,
      processedBy: null,
      createdAt: '2026-07-11T09:00:00+09:00',
    },
    {
      // data-pipeline(61, 기관 2) — 부여 완료 신청 (회수 전이·주소 표시용).
      id: 6,
      vmId: 61,
      purpose: '연구실 수집 장비 연동용 교내 고정 주소',
      ports: [8443],
      status: 'GRANTED',
      grantedAddress: GRANTED_CAMPUS_IP,
      adminNote: '캠퍼스 네트워크 연결 완료',
      requestedBy: 7,
      requesterEmail: 'admin.kim@pusan.ac.kr',
      processedAt: '2026-07-10T15:00:00+09:00',
      processedBy: 5,
      createdAt: '2026-07-01T09:00:00+09:00',
    },
  ]
}

export let campusIpStore: CampusIpRecord[] = initialRequests()
let nextRequestId = 100

export function resetCampusIpFixtures() {
  campusIpStore = initialRequests()
  nextRequestId = 100
}

/* 아래 오류 봉투는 서버(CampusIpRequestService)의 제목·본문과 1:1로 맞춘다 —
   모의가 실서버와 어긋나면 테스트가 진짜 버그를 가린다. */

const vmNotFound = () =>
  problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '해당 VM이 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })

const requestNotFound = () =>
  problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '해당 교내 IP 신청이 존재하지 않습니다.',
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

const ACTIVE_STATUSES: CampusIpRequestStatus[] = ['REQUESTED', 'APPROVED', 'GRANTED']

/** 허용 전이 (서버와 동일): REQUESTED→APPROVED|REJECTED, APPROVED→GRANTED|REJECTED, GRANTED→REVOKED. */
function isLegalTransition(from: CampusIpRequestStatus, to: CampusIpRequestStatus): boolean {
  switch (from) {
    case 'REQUESTED':
      return to === 'APPROVED' || to === 'REJECTED'
    case 'APPROVED':
      return to === 'GRANTED' || to === 'REJECTED'
    case 'GRANTED':
      return to === 'REVOKED'
    default:
      return false
  }
}

function toUserView(record: CampusIpRecord): CampusIpRequestView {
  return {
    id: record.id,
    vmId: record.vmId,
    purpose: record.purpose,
    ports: record.ports,
    status: record.status,
    grantedAddress: record.grantedAddress,
    adminNote: record.adminNote,
    requestedBy: record.requestedBy,
    processedAt: record.processedAt,
    createdAt: record.createdAt,
  }
}

function toAdminView(record: CampusIpRecord): AdminCampusIpRequestView {
  const vm = vmStore.find((v) => v.id === record.vmId)
  return {
    ...toUserView(record),
    vmName: vm?.name ?? null,
    orgId: vm?.orgId ?? null,
    requesterEmail: record.requesterEmail,
    processedBy: record.processedBy,
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

export const campusIpHandlers: RequestHandler[] = [
  /* ─── 사용자 (이중 게이트는 서버 강제 — mock은 리소스 존재만 검사) ─── */
  http.get('*/api/v1/vms/:vmId/campus-ip-requests', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return vmNotFound()
    const items = campusIpStore
      .filter((r) => r.vmId === vm.id)
      .sort((a, b) => b.id - a.id)
      .map(toUserView)
    return HttpResponse.json(items, { status: 200 })
  }),

  http.post('*/api/v1/vms/:vmId/campus-ip-requests', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return vmNotFound()
    const instance = `/api/v1/vms/${vm.id}/campus-ip-requests`
    if (campusIpStore.some((r) => r.vmId === vm.id && ACTIVE_STATUSES.includes(r.status))) {
      return problemResponse({
        type: 'about:blank',
        title: '이미 진행 중인 신청이 있습니다',
        status: 409,
        detail:
          '이 VM에는 진행 중인 교내 IP 신청이 이미 있습니다. 기존 신청이 끝난 뒤 다시 신청해 주세요.',
        instance,
        code: 'CAMPUS_IP_REQUEST_EXISTS',
      })
    }
    const body = (await request.json().catch(() => ({}))) as Schemas['CreateCampusIpRequest']
    if (!body.purpose || body.purpose.trim() === '') {
      return validationFailed(instance, 'purpose', '신청 목적을 입력해 주세요.')
    }
    if (!Array.isArray(body.ports) || body.ports.some((p) => p < 1 || p > 65535)) {
      return validationFailed(instance, 'ports[0]', '포트는 1~65535 범위여야 합니다.')
    }
    if (new Set(body.ports).size > 32) {
      return validationFailed(instance, 'ports', '포트는 최대 32개까지 신청할 수 있습니다.')
    }
    const record: CampusIpRecord = {
      id: nextRequestId++,
      vmId: vm.id,
      purpose: body.purpose.trim(),
      // 서버 정규화와 동일: 중복 제거 + 오름차순.
      ports: [...new Set(body.ports)].sort((a, b) => a - b),
      status: 'REQUESTED',
      grantedAddress: null,
      adminNote: null,
      requestedBy: 42,
      requesterEmail: 'example@pusan.ac.kr',
      processedAt: null,
      processedBy: null,
      createdAt: '2026-07-12T09:00:00+09:00',
    }
    campusIpStore.push(record)
    return HttpResponse.json(toUserView(record), { status: 201 })
  }),

  http.delete('*/api/v1/vms/:vmId/campus-ip-requests/:requestId', ({ params }) => {
    const index = campusIpStore.findIndex(
      (r) => r.id === Number(params.requestId) && r.vmId === Number(params.vmId),
    )
    if (index < 0) return requestNotFound()
    const record = campusIpStore[index]
    if (record.status !== 'REQUESTED') {
      return problemResponse({
        type: 'about:blank',
        title: '전환할 수 없는 상태입니다',
        status: 409,
        detail: '검토가 시작되기 전(REQUESTED)의 신청만 취소할 수 있습니다.',
        instance: `/api/v1/vms/${record.vmId}/campus-ip-requests/${record.id}`,
        code: 'CAMPUS_IP_INVALID_TRANSITION',
      })
    }
    campusIpStore.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  /* ─── 관리자 ─── */
  http.get('*/api/v1/admin/campus-ip-requests', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const vmId = url.searchParams.get('vmId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const items = campusIpStore
      .map(toAdminView)
      .filter((r) => !status || r.status === status)
      .filter((r) => !vmId || r.vmId === Number(vmId))
      .sort((a, b) => b.id - a.id)
    return HttpResponse.json(paginate(items, page, size), { status: 200 })
  }),

  http.post(
    '*/api/v1/admin/campus-ip-requests/:requestId/status',
    async ({ params, request }) => {
      const record = campusIpStore.find((r) => r.id === Number(params.requestId))
      if (!record) return requestNotFound()
      const instance = `/api/v1/admin/campus-ip-requests/${record.id}/status`
      const body = (await request.json().catch(() => ({}))) as
        Schemas['UpdateCampusIpRequestStatusRequest']
      if (!isLegalTransition(record.status, body.status)) {
        return problemResponse({
          type: 'about:blank',
          title: '전환할 수 없는 상태입니다',
          status: 409,
          detail: `'${record.status}'에서 '${body.status}'(으)로 전환할 수 없습니다.`,
          instance,
          code: 'CAMPUS_IP_INVALID_TRANSITION',
        })
      }
      if (body.status === 'GRANTED') {
        const address = body.grantedAddress?.trim() ?? ''
        if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(address)) {
          return validationFailed(
            instance,
            'grantedAddress',
            'GRANTED 전환에는 올바른 IPv4 주소가 필요합니다.',
          )
        }
        // 교내 IP는 캠퍼스 대역 안이어야 한다 (서버와 같은 규칙).
        if (!address.startsWith('10.')) {
          return validationFailed(
            instance,
            'grantedAddress',
            '교내 IP는 10.0.0.0/8 대역의 주소여야 합니다.',
          )
        }
        record.grantedAddress = address
      }
      record.status = body.status
      record.adminNote = body.adminNote?.trim() || record.adminNote
      record.processedAt = '2026-07-12T09:30:00+09:00'
      record.processedBy = 5
      return HttpResponse.json(toAdminView(record), { status: 200 })
    },
  ),
]
