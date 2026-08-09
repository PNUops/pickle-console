import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse, regularUser } from './auth'

type Schemas = components['schemas']
type RequestDetail = Schemas['RequestDetailResponse']

function baseRequest(): Omit<
  RequestDetail,
  'id' | 'purpose' | 'status' | 'review' | 'createdAt' | 'updatedAt'
> {
  return {
    workspaceId: 12,
    workspaceName: '캡스톤 3조',
    orgId: 1,
    orgName: '정보컴퓨터공학부 실습지원센터',
    requesterId: regularUser.id,
    requesterName: regularUser.name,
    type: 'VM',
    courseOrProject: '2026-1 캡스톤디자인 3조',
    extraNote: null,
    reqStartDate: '2026-07-15',
    reqEndDate: '2026-12-20',
    displayName: '캡스톤 백엔드 서버',
    vm: {
      imageId: 1,
      flavorId: 2,
      reqVcpu: 2,
      reqMemoryMb: 2048,
      reqDiskGb: 20,
      specReason: null,
      desiredSlug: null,
      desiredSubdomain: 'capstone-team3',
      rootDomain: 'pusan.dev',
    },
  }
}

function initialRequests(): RequestDetail[] {
  return [
    {
      ...baseRequest(),
      id: 101,
      purpose: '캡스톤 프로젝트 백엔드 서버 운영',
      status: 'SUBMITTED',
      review: null,
      createdAt: '2026-07-08T11:30:00+09:00',
      updatedAt: '2026-07-08T11:30:00+09:00',
    },
    {
      ...baseRequest(),
      id: 102,
      purpose: '알고리즘 스터디 채점 서버',
      status: 'APPROVED',
      review: {
        reviewerId: 3,
        reviewerName: '관리자김',
        decision: 'APPROVE',
        comment: '요청 사양 그대로 승인합니다.',
        grantedStartDate: '2026-07-15',
        grantedEndDate: '2026-12-20',
        decidedAt: '2026-07-08T14:03:00+09:00',
      },
      vm: {
        ...baseRequest().vm!,
        granted: {
          grantedVcpu: 2,
          grantedMemoryMb: 2048,
          grantedDiskGb: 20,
          grantedImageId: 1,
          nodeId: null,
        },
      },
      createdAt: '2026-07-07T09:00:00+09:00',
      updatedAt: '2026-07-08T14:03:00+09:00',
    },
    {
      ...baseRequest(),
      id: 103,
      purpose: '개인 실험용 서버',
      status: 'REJECTED',
      review: {
        reviewerId: 3,
        reviewerName: '관리자김',
        decision: 'REJECT',
        comment: '용도가 불분명합니다. 구체적인 사용 계획을 적어 다시 신청해 주세요.',
        grantedStartDate: null,
        grantedEndDate: null,
        decidedAt: '2026-07-06T16:20:00+09:00',
      },
      createdAt: '2026-07-05T13:00:00+09:00',
      updatedAt: '2026-07-06T16:20:00+09:00',
    },
  ]
}

export let requestStore: RequestDetail[] = initialRequests()
let nextRequestId = 200

/** Bodies received by POST /requests, for payload-correctness assertions. */
export let createdRequestBodies: Schemas['CreateRequestRequest'][] = []

export function resetRequestFixtures() {
  requestStore = initialRequests()
  createdRequestBodies = []
  nextRequestId = 200
}

const notFound = () =>
  problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '요청한 리소스가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })

export const requestHandlers: RequestHandler[] = [
  http.get('*/api/v1/requests', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = requestStore
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.id - a.id)
    const body: Schemas['PageResponseRequestDetailResponse'] = {
      content: filtered.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.post('*/api/v1/requests', async ({ request }) => {
    const body = (await request.json()) as Schemas['CreateRequestRequest']
    createdRequestBodies.push(body)
    const created: RequestDetail = {
      ...baseRequest(),
      ...body,
      id: nextRequestId++,
      workspaceName: '캡스톤 3조',
      orgName: '정보컴퓨터공학부 실습지원센터',
      requesterId: regularUser.id,
      requesterName: regularUser.name,
      courseOrProject: body.courseOrProject ?? null,
      extraNote: body.extraNote ?? null,
      reqStartDate: body.reqStartDate ?? null,
      reqEndDate: body.reqEndDate ?? null,
      displayName: body.displayName ?? null,
      vm: {
        imageId: body.vm?.imageId ?? 1,
        flavorId: body.vm?.flavorId ?? null,
        reqVcpu: body.vm?.reqVcpu ?? 1,
        reqMemoryMb: body.vm?.reqMemoryMb ?? 1024,
        reqDiskGb: body.vm?.reqDiskGb ?? 10,
        specReason: body.vm?.specReason ?? null,
        desiredSlug: body.vm?.desiredSlug ?? null,
        // 신청서에서 도메인 축이 빠졌다 — 새 신청의 이력 필드는 항상 비어 있다.
        desiredSubdomain: null,
        rootDomain: null,
        granted: null,
      },
      status: 'SUBMITTED',
      review: null,
      createdAt: '2026-07-08T15:00:00+09:00',
      updatedAt: '2026-07-08T15:00:00+09:00',
    }
    requestStore.push(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.get('*/api/v1/requests/:requestId', ({ params }) => {
    const found = requestStore.find((r) => r.id === Number(params.requestId))
    if (!found) return notFound()
    return HttpResponse.json(found, { status: 200 })
  }),

  http.post('*/api/v1/requests/:requestId/cancel', ({ params }) => {
    const found = requestStore.find((r) => r.id === Number(params.requestId))
    if (!found) return notFound()
    if (found.status !== 'SUBMITTED') {
      return problemResponse({
        type: 'about:blank',
        title: '이미 처리된 신청입니다',
        status: 409,
        detail: '이미 승인 또는 반려된 신청은 취소할 수 없습니다.',
        code: 'REQUEST_ALREADY_DECIDED',
      })
    }
    found.status = 'CANCELED'
    found.updatedAt = '2026-07-08T16:00:00+09:00'
    return HttpResponse.json(found, { status: 200 })
  }),
]
