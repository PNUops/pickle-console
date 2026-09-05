import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse, regularUser } from './auth'
import { flavorStore, osImages } from './reference'
import { uuid } from '../ids'

type Schemas = components['schemas']
type RequestDetail = Schemas['RequestDetailResponse']

/** 카탈로그 행의 표시 이름 — 서버가 응답에 이름을 실어 주는 경로를 그대로 흉내낸다. */
function nameOf(catalogue: { id: string; displayName: string }[], id: string | null | undefined) {
  if (id == null) return null
  return catalogue.find((row) => row.id === id)?.displayName ?? null
}

function baseRequest(): Omit<
  RequestDetail,
  'id' | 'purpose' | 'status' | 'review' | 'createdAt' | 'updatedAt'
> {
  return {
    workspaceId: uuid(12),
    workspaceName: '캡스톤 3조',
    orgId: uuid(1),
    orgName: '정보컴퓨터공학부 실습지원센터',
    requesterId: regularUser.id,
    requesterName: regularUser.name,
    type: 'VM',
    extraNote: null,
    reqEndDate: '2026-12-20',
    displayName: '캡스톤 백엔드 서버',
    vm: {
      imageId: uuid(1),
      imageName: 'Ubuntu 24.04 LTS',
      flavorId: uuid(2),
      flavorName: '기본형',
      reqVcpu: 2,
      reqMemoryMb: 2048,
      reqDiskGb: 20,
      specReason: null,
      desiredSlug: null,
    },
  }
}

/**
 * LLM API 키 신청 — 신청자 화면이 VM 아닌 종류를 설명할 수 있는지 태우는 자리.
 * 희망 한도를 하나만 적은 신청이다(비우는 것이 정상 경로라서).
 */
function llmKeyRequest(): Omit<
  RequestDetail,
  'id' | 'purpose' | 'status' | 'review' | 'createdAt' | 'updatedAt'
> {
  return {
    ...baseRequest(),
    type: 'LLM_API_KEY',
    displayName: '캡스톤 챗봇 키',
    vm: null,
    llmKey: {
      reqRpm: 600,
      reqTpm: null,
      reqDailyTokens: null,
      grantedRpm: null,
      grantedTpm: null,
      grantedConcurrency: null,
      grantedDailyTokens: null,
      useCampusModels: true,
      useCommercialModels: false,
      grantedCreditAllowedModels: [],
      grantedCreditDeniedModels: [],
    },
  }
}

function initialRequests(): RequestDetail[] {
  return [
    {
      ...baseRequest(),
      id: uuid(101),
      purpose: '캡스톤 프로젝트 백엔드 서버 운영',
      status: 'SUBMITTED',
      review: null,
      createdAt: '2026-07-08T11:30:00+09:00',
      updatedAt: '2026-07-08T11:30:00+09:00',
    },
    {
      ...baseRequest(),
      id: uuid(102),
      purpose: '알고리즘 스터디 채점 서버',
      status: 'APPROVED',
      review: {
        reviewerId: uuid(3),
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
          grantedImageId: uuid(1),
          grantedImageName: 'Ubuntu 24.04 LTS',
          nodeId: null,
          nodeName: null,
        },
      },
      createdAt: '2026-07-07T09:00:00+09:00',
      updatedAt: '2026-07-08T14:03:00+09:00',
    },
    {
      ...baseRequest(),
      id: uuid(103),
      purpose: '개인 실험용 서버',
      status: 'REJECTED',
      review: {
        reviewerId: uuid(3),
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
    {
      ...llmKeyRequest(),
      id: uuid(104),
      purpose: '캡스톤 챗봇 문서 요약',
      status: 'SUBMITTED',
      review: null,
      createdAt: '2026-07-09T10:00:00+09:00',
      updatedAt: '2026-07-09T10:00:00+09:00',
    },
    {
      ...llmKeyRequest(),
      id: uuid(105),
      purpose: '알고리즘 힌트 생성기',
      displayName: '알고리즘 힌트 키',
      status: 'APPROVED',
      review: {
        reviewerId: uuid(3),
        reviewerName: '관리자김',
        decision: 'APPROVE',
        comment: '분당 요청 수만 조정해 승인합니다.',
        grantedStartDate: '2026-07-15',
        grantedEndDate: '2026-12-20',
        decidedAt: '2026-07-09T14:00:00+09:00',
      },
      // 승인자가 정한 것만 값이 있다 — 나머지는 서비스 기본값이다.
      llmKey: {
        ...llmKeyRequest().llmKey!,
        grantedRpm: 300,
        grantedConcurrency: 4,
      },
      createdAt: '2026-07-09T09:00:00+09:00',
      updatedAt: '2026-07-09T14:00:00+09:00',
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
    const workspaceId = url.searchParams.get('workspaceId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = requestStore
      .filter((r) => !status || r.status === status)
      .filter((r) => workspaceId == null || r.workspaceId === workspaceId)
      .sort((a, b) => b.id.localeCompare(a.id))
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
      id: uuid(nextRequestId++),
      workspaceName: '캡스톤 3조',
      orgName: '정보컴퓨터공학부 실습지원센터',
      requesterId: regularUser.id,
      requesterName: regularUser.name,
      extraNote: body.extraNote ?? null,
      reqEndDate: body.reqEndDate ?? null,
      displayName: body.displayName,
      // 서버는 신청한 종류의 항목만 채워 돌려준다 — 종류가 다른 멤버는 null이다.
      llmKey:
        body.type === 'LLM_API_KEY'
          ? {
              reqRpm: body.llmKey?.reqRpm ?? null,
              reqTpm: body.llmKey?.reqTpm ?? null,
              reqDailyTokens: body.llmKey?.reqDailyTokens ?? null,
              grantedRpm: null,
              grantedTpm: null,
              grantedConcurrency: null,
              grantedDailyTokens: null,
              // 승인 전이므로 부여된 것이 없다. 빈 배열은 "제한 없음"이
              // 아니라 "아직 부여되지 않음"이고, 화면은 승인 여부를
              // status로 읽는다.
              useCampusModels: true,
              useCommercialModels: false,
              grantedCreditAllowedModels: [],
              grantedCreditDeniedModels: [],
            }
          : null,
      vm: body.type !== 'VM' ? null : {
        imageId: body.vm?.imageId ?? uuid(1),
        // 서버는 카탈로그 행에서 이름을 읽어 응답에 실어 준다 — 은퇴한 행도 이름은 남는다.
        imageName: nameOf(osImages, body.vm?.imageId) ?? 'Ubuntu 24.04 LTS',
        flavorId: body.vm?.flavorId ?? null,
        flavorName: nameOf(flavorStore, body.vm?.flavorId),
        reqVcpu: body.vm?.reqVcpu ?? 1,
        reqMemoryMb: body.vm?.reqMemoryMb ?? 1024,
        reqDiskGb: body.vm?.reqDiskGb ?? 10,
        specReason: body.vm?.specReason ?? null,
        desiredSlug: body.vm?.desiredSlug ?? null,
        // 신청서에서 도메인 축이 빠졌다 — 새 신청의 이력 필드는 항상 비어 있다.
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
    const found = requestStore.find((r) => r.id === String(params.requestId))
    if (!found) return notFound()
    return HttpResponse.json(found, { status: 200 })
  }),

  http.post('*/api/v1/requests/:requestId/cancel', ({ params }) => {
    const found = requestStore.find((r) => r.id === String(params.requestId))
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
