import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse, studentUser } from './auth'

type Schemas = components['schemas']
type VmRequestDetail = Schemas['VmRequestDetailResponse']

function baseRequest(): Omit<
  VmRequestDetail,
  'id' | 'purpose' | 'status' | 'review' | 'createdAt' | 'updatedAt'
> {
  return {
    groupId: 12,
    groupName: '캡스톤 3조',
    orgId: 1,
    orgName: '정보컴퓨터공학부 실습지원센터',
    requesterId: studentUser.id,
    requesterName: studentUser.name,
    templateId: 1,
    courseOrProject: '2026-1 캡스톤디자인 3조',
    specReason: null,
    extraNote: null,
    reqVcpu: 2,
    reqMemoryMb: 2048,
    reqDiskGb: 20,
    reqStartDate: '2026-07-15',
    reqEndDate: '2026-12-20',
    needSsh: true,
    needHttp: true,
    needPublic: false,
    desiredSlug: null,
    desiredSubdomain: 'capstone-team3',
    rootDomain: 'pickle.pnuops.com',
    customDomain: null,
  }
}

function initialRequests(): VmRequestDetail[] {
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
        grantedVcpu: 2,
        grantedMemoryMb: 2048,
        grantedDiskGb: 20,
        grantedTemplateId: 1,
        grantedStartDate: '2026-07-15',
        grantedEndDate: '2026-12-20',
        grantSsh: true,
        grantHttp: true,
        grantPublic: false,
        nodeId: null,
        decidedAt: '2026-07-08T14:03:00+09:00',
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
        grantedVcpu: null,
        grantedMemoryMb: null,
        grantedDiskGb: null,
        grantedTemplateId: null,
        grantedStartDate: null,
        grantedEndDate: null,
        grantSsh: null,
        grantHttp: null,
        grantPublic: null,
        nodeId: null,
        decidedAt: '2026-07-06T16:20:00+09:00',
      },
      createdAt: '2026-07-05T13:00:00+09:00',
      updatedAt: '2026-07-06T16:20:00+09:00',
    },
  ]
}

export let vmRequestStore: VmRequestDetail[] = initialRequests()
let nextRequestId = 200

/** Bodies received by POST /vm-requests, for payload-correctness assertions. */
export let createdVmRequestBodies: Schemas['CreateVmRequestRequest'][] = []

export function resetVmRequestFixtures() {
  vmRequestStore = initialRequests()
  createdVmRequestBodies = []
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

export const vmRequestHandlers: RequestHandler[] = [
  http.get('*/api/v1/vm-requests', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = vmRequestStore
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.id - a.id)
    const body: Schemas['PageResponseVmRequestDetailResponse'] = {
      content: filtered.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.post('*/api/v1/vm-requests', async ({ request }) => {
    const body = (await request.json()) as Schemas['CreateVmRequestRequest']
    createdVmRequestBodies.push(body)
    const created: VmRequestDetail = {
      ...baseRequest(),
      ...body,
      id: nextRequestId++,
      groupName: '캡스톤 3조',
      orgName: '정보컴퓨터공학부 실습지원센터',
      requesterId: studentUser.id,
      requesterName: studentUser.name,
      courseOrProject: body.courseOrProject ?? null,
      specReason: body.specReason ?? null,
      extraNote: body.extraNote ?? null,
      reqStartDate: body.reqStartDate ?? null,
      reqEndDate: body.reqEndDate ?? null,
      desiredSlug: body.desiredSlug ?? null,
      desiredSubdomain: body.desiredSubdomain ?? null,
      rootDomain: body.rootDomain ?? null,
      customDomain: body.customDomain ?? null,
      status: 'SUBMITTED',
      review: null,
      createdAt: '2026-07-08T15:00:00+09:00',
      updatedAt: '2026-07-08T15:00:00+09:00',
    }
    vmRequestStore.push(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.get('*/api/v1/vm-requests/:requestId', ({ params }) => {
    const found = vmRequestStore.find((r) => r.id === Number(params.requestId))
    if (!found) return notFound()
    return HttpResponse.json(found, { status: 200 })
  }),

  http.post('*/api/v1/vm-requests/:requestId/cancel', ({ params }) => {
    const found = vmRequestStore.find((r) => r.id === Number(params.requestId))
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
