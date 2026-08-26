import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { isSysTier } from '../../../auth/permissions'
import { ACCESS_TOKENS, problemResponse, unauthorizedProblem } from './auth'
import { orgs } from './reference'
import { uuid } from '../ids'

type Schemas = components['schemas']
type NoticeView = Schemas['NoticeView']
type AdminNoticeView = Schemas['AdminNoticeView']
type NoticeImageView = Schemas['NoticeImageView']

/** 저장 형태 — 게시 여부(active)는 응답 시점에 게시 기간으로부터 계산한다. */
type StoredNotice = Omit<AdminNoticeView, 'active'>

/** 1x1 투명 PNG — 이미지 바이트 엔드포인트가 돌려주는 최소 본문. */
const PIXEL_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (character) => character.charCodeAt(0),
)

/** 계약이 나눠 둔 이미지 첨부 거절 — 형식(422)·크기(413)·장수(409). */
const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

const PAST = '2026-07-01T09:00:00+09:00'
const EXPIRED = '2026-07-20T09:00:00+09:00'
const FUTURE = '2099-01-01T00:00:00+09:00'

/** 서버가 싣는 것과 같은 모양의 이미지 — `url`은 서버가 만들어 준 경로다. */
export function noticeImage(noticeId: string, n: number, fileName: string): NoticeImageView {
  return {
    id: uuid(n),
    fileName,
    contentType: 'image/png',
    byteSize: 1024,
    url: `/api/v1/notices/${noticeId}/images/${uuid(n)}`,
  }
}

/**
 * 공지 하나를 만든다. 기본값은 "지금 게시 중인 전역 공개 공지, 고정도 팝업도 아님".
 *
 * 기본 픽스처에 **뜨는 것이 아무것도 없는 것은 의도다** — 팝업과 랜딩 한 줄은
 * 인증 셸과 랜딩에 그대로 달리므로, 기본값에 하나라도 활성 팝업/고정 공개 공지를
 * 두면 이 기능과 무관한 화면 테스트 전부가 모달과 배너를 마주하게 된다.
 * 그 둘을 보고 싶은 테스트가 `seedNotices`로 직접 세운다.
 */
export function makeNotice(notice: Partial<StoredNotice> & { id: string }): StoredNotice {
  return {
    title: '공지',
    body: '본문',
    scope: 'PLATFORM',
    orgId: null,
    orgName: null,
    audience: 'PUBLIC',
    pinned: false,
    popup: false,
    startsAt: PAST,
    endsAt: null,
    images: [],
    createdByName: '이시스템',
    createdAt: PAST,
    updatedAt: PAST,
    ...notice,
  }
}

function initialNotices(): StoredNotice[] {
  return [
    makeNotice({
      id: uuid(201),
      title: '데이터센터 정기 점검 안내',
      body: '8월 20일 02:00~04:00 사이 일부 서비스가 중단됩니다.\n작업 중에는 콘솔 접속이 제한됩니다.',
      images: [noticeImage(uuid(201), 211, 'maintenance.png')],
    }),
    makeNotice({
      id: uuid(202),
      title: '콘솔 기능 업데이트',
      body: '워크스페이스 화면이 개편되었습니다.',
      audience: 'USERS',
    }),
    makeNotice({
      id: uuid(203),
      title: '기관 전용 안내',
      body: '기관 소속 사용자에게만 보이는 공지입니다.',
      scope: 'ORG',
      orgId: uuid(1),
      orgName: '정보컴퓨터공학부',
      audience: 'USERS',
    }),
    makeNotice({
      id: uuid(204),
      title: '지난 점검 공지',
      body: '이미 끝난 점검입니다.',
      startsAt: PAST,
      endsAt: EXPIRED,
      images: [noticeImage(uuid(204), 214, 'past.png')],
    }),
  ]
}

export let noticeStore: StoredNotice[] = initialNotices()
let nextNoticeId = 220

export function resetNoticeFixtures() {
  noticeStore = initialNotices()
  nextNoticeId = 220
}

/** 이 테스트가 보고 싶은 공지로 저장소를 통째로 바꾼다 (afterEach가 되돌린다). */
export function seedNotices(notices: StoredNotice[]) {
  noticeStore = notices
}

function profileOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token] ?? null
}

type Profile = Schemas['UserProfileResponse']

function orgIdsWhere(profile: Profile, roles: readonly string[]): string[] {
  return profile.managedOrgs.filter((org) => roles.includes(org.role)).map((org) => org.orgId)
}

/**
 * 게시판이 말하는 '이 기관 사람' — 운영 권한(ORG_ADMIN·ORG_MANAGER)이 있는 기관.
 * 열람 역할은 **들어가지 않는다**: 기관 공지는 그 기관 사람에게 보내는 글이고,
 * 열람자는 들여다보도록 허락받은 바깥 사람이라 관리 목록으로 같은 공지를 읽는다.
 * 공지를 감추는 것이 아니라 '이 기관 사람'의 정의를 하나로 두는 것이다.
 *
 * 서버는 여기에 파생 소속(사용자의 실제 소속 기관)을 합집합으로 얹지만, 프로필
 * 응답에는 그 값이 없다 — 목이 재현할 수 있는 것은 권한으로 정해지는 절반뿐이다.
 */
function boardOrgIds(profile: Profile): string[] {
  return orgIdsWhere(profile, ['ORG_ADMIN', 'ORG_MANAGER'])
}

/** 관리 목록의 범위 — 역할을 보유한 기관 전부. 열람 역할이 닿는 곳이 여기다. */
function readableOrgIds(profile: Profile): string[] {
  return orgIdsWhere(profile, ['ORG_ADMIN', 'ORG_MANAGER', 'ORG_VIEWER'])
}

/** 쓰기가 닿는 범위 — 관리자인 기관만. 운영·열람 역할은 쓰지 못한다. */
function administeredOrgIds(profile: Profile): string[] {
  return orgIdsWhere(profile, ['ORG_ADMIN'])
}

/** 공개 표면(게시판·상세)에서 이 공지가 이 읽는이에게 보이는가. */
function visibleOnBoard(notice: StoredNotice, profile: Profile | null): boolean {
  if (!isActive(notice)) return false
  if (profile == null) return notice.scope === 'PLATFORM' && notice.audience === 'PUBLIC'
  if (notice.scope === 'PLATFORM') return true
  return notice.orgId != null && boardOrgIds(profile).includes(notice.orgId)
}

/**
 * 이 공지를 고칠 수 있는가. 못 고치는 이유마다 답이 다르다:
 *
 * - 전역 공지를 기관 관리자가 → 403. 목록에 보이는 공지이므로 감출 것이 없다.
 * - 남의 기관 공지 → 404. 경로의 id로 지목한 것이라, 존재 자체를 감추는 쪽이 맞다.
 *
 * 관리자인 기관만 통과한다 — 운영·열람 역할로 보이는 기관도 쓰기는 닿지 않는다.
 */
function writeRefusal(
  profile: Profile,
  notice: StoredNotice,
  instance: string,
): Response | null {
  if (isSysTier(profile.role)) return null
  if (notice.scope === 'PLATFORM') {
    return forbidden(instance, '전역 공지는 시스템 관리자만 수정할 수 있습니다.')
  }
  if (notice.orgId == null || !administeredOrgIds(profile).includes(notice.orgId)) {
    return notFound(instance)
  }
  return null
}

function forbidden(instance: string, detail: string) {
  return problemResponse({
    type: 'about:blank',
    title: '접근 권한이 없습니다',
    status: 403,
    detail,
    instance,
    code: 'ACCESS_DENIED',
  })
}

function orgFieldError(instance: string, message: string) {
  return problemResponse({
    type: 'about:blank',
    title: '입력값이 올바르지 않습니다',
    status: 422,
    detail: '요청 값을 확인해 주세요.',
    instance,
    code: 'VALIDATION_FAILED',
    errors: [{ field: 'orgId', message }],
  })
}

function isActive(notice: StoredNotice, now = Date.now()): boolean {
  if (Date.parse(notice.startsAt) > now) return false
  return notice.endsAt == null || Date.parse(notice.endsAt) > now
}

/** 계약 순서 — 고정 먼저, 그 안에서 게시 시작 최신순. */
function inFeedOrder(a: StoredNotice, b: StoredNotice): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return Date.parse(b.startsAt) - Date.parse(a.startsAt)
}

/** 공개 뷰는 관리 뷰에서 운영자만 볼 것(게시 여부·작성자)을 뺀 것이다. */
function toPublicView({ createdByName: _createdByName, ...view }: StoredNotice): NoticeView {
  return view
}

function toAdminView(notice: StoredNotice): AdminNoticeView {
  return { ...notice, active: isActive(notice) }
}

function notFound(instance: string) {
  return problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '해당 공지가 존재하지 않습니다.',
    instance,
    code: 'RESOURCE_NOT_FOUND',
  })
}

function paged<T>(rows: T[], url: URL) {
  const page = Number(url.searchParams.get('page') ?? '0')
  const size = Number(url.searchParams.get('size') ?? '20')
  return {
    content: rows.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: rows.length,
    totalPages: Math.max(1, Math.ceil(rows.length / size)),
  }
}

export const noticeHandlers: RequestHandler[] = [
  /* ─── 공개 ─── */

  /**
   * 이미지 바이트. **인증 헤더를 실제로 따진다** — 그래야 하는 이유가 있다.
   *
   * 이 API는 순수 Bearer이고 `<img src>`가 거는 요청에는 헤더가 실리지 않는다.
   * 그래서 화면이 주소만 넘기면 서버는 그것을 익명 호출로 읽고, 로그인해야 보이는
   * 공지의 이미지는 자격이 있는 사람에게도 404가 된다. 목이 무엇이든 내주면 두
   * 레포가 서로 어긋난 채 양쪽 다 초록이 되므로, 여기서 같은 규칙을 세운다:
   * 자격 없는 요청에는 게시 중인 전역 공개 공지의 이미지만 내준다.
   */
  http.get('*/api/v1/notices/:noticeId/images/:imageId', ({ params, request }) => {
    const instance = `/api/v1/notices/${String(params.noticeId)}/images`
    const notice = noticeStore.find((row) => row.id === String(params.noticeId))
    const image = notice?.images.find((row) => row.id === String(params.imageId))
    if (!notice || !image) return notFound(instance)
    const anonymous = profileOf(request) == null
    const publiclyReadable =
      notice.scope === 'PLATFORM' && notice.audience === 'PUBLIC' && isActive(notice)
    // 존재를 알리지 않는다 — 권한 없는 요청과 없는 이미지가 같은 답을 받는다.
    if (anonymous && !publiclyReadable) return notFound(instance)
    return HttpResponse.arrayBuffer(PIXEL_PNG.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': image.contentType,
        'Cache-Control': publiclyReadable ? 'public, immutable' : 'private, immutable',
      },
    })
  }),

  // 상세도 목록과 같은 범위를 쓴다 — 목록에 없는 공지가 주소로는 열리면 두 표면이
  // 서로 다른 답을 하게 된다. 자격이 없으면 없는 공지와 같은 404다.
  http.get('*/api/v1/notices/:noticeId', ({ params, request }) => {
    const notice = noticeStore.find((row) => row.id === String(params.noticeId))
    if (!notice || !visibleOnBoard(notice, profileOf(request))) {
      return notFound(`/api/v1/notices/${String(params.noticeId)}`)
    }
    return HttpResponse.json(toPublicView(notice), { status: 200 })
  }),

  http.get('*/api/v1/notices', ({ request }) => {
    // 대상 판정은 서버의 몫 — 익명은 전역 공개만, 로그인 사용자는 자기 기관 공지까지.
    const profile = profileOf(request)
    const visible = noticeStore
      .filter((notice) => visibleOnBoard(notice, profile))
      .sort(inFeedOrder)
    return HttpResponse.json(paged(visible.map(toPublicView), new URL(request.url)), {
      status: 200,
    })
  }),

  /* ─── 관리 ─── */

  /**
   * 관리 목록의 범위는 **역할을 보유한 기관 전부**다 — 열람 역할이 포함되는 유일한
   * 공지 표면이고, 들여다보라고 준 역할이 닿는 곳이 여기라서다. 기관 계층은 전역
   * 공지도 함께 본다(읽되 고치지는 못한다).
   */
  http.get('*/api/v1/admin/notices', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const readable = readableOrgIds(profile)
    if (!isSysTier(profile.role) && readable.length === 0) {
      return forbidden('/api/v1/admin/notices', '관리 기관이 지정되지 않은 계정입니다.')
    }
    const visible = noticeStore
      .filter(
        (notice) =>
          isSysTier(profile.role) ||
          notice.scope === 'PLATFORM' ||
          (notice.orgId != null && readable.includes(notice.orgId)),
      )
      .sort(inFeedOrder)
    return HttpResponse.json(paged(visible.map(toAdminView), new URL(request.url)), {
      status: 200,
    })
  }),

  http.post('*/api/v1/admin/notices', async ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const body = (await request.json()) as Schemas['NoticeCreateRequest']
    const instance = '/api/v1/admin/notices'
    const sysTier = isSysTier(profile.role)

    /**
     * 새 공지가 속할 기관, 또는 그 자리에서 끝나는 거절.
     *
     * 거절의 모양이 갈리는 자리다: 본문이 고른 `orgId`는 **필드 오류(422)**이고
     * 경로로 지목한 공지는 404다. 본문 값은 클라이언트가 보낸 것이라 틀렸다고
     * 답해도 아무 존재를 알리지 않지만, 경로의 id는 그 자체가 남의 것의 존재를
     * 묻는 질문이기 때문이다. 겸직 계정은 '자기 기관'이 하나가 아니므로 관리
     * 기관이 둘 이상이면 지정이 필수가 되고, 하나뿐이면 서버가 채운다.
     */
    let targetOrgId: string | null = null
    if (body.scope === 'PLATFORM') {
      if (!sysTier) {
        return forbidden(instance, '전역 공지는 시스템 관리자만 등록할 수 있습니다.')
      }
      if (body.orgId != null) {
        return orgFieldError(instance, '전역 공지에는 기관을 지정할 수 없습니다.')
      }
    } else if (sysTier) {
      if (body.orgId == null) {
        return orgFieldError(instance, '기관 공지에는 대상 기관이 필요합니다.')
      }
      // 시스템 계층에는 기관의 존재를 감출 이유가 없다 — 없는 기관은 404다.
      if (!orgs.some((org) => org.id === body.orgId)) {
        return problemResponse({
          type: 'about:blank',
          title: '리소스를 찾을 수 없습니다',
          status: 404,
          detail: '해당 기관이 존재하지 않습니다.',
          instance,
          code: 'RESOURCE_NOT_FOUND',
        })
      }
      targetOrgId = body.orgId
    } else {
      const administered = administeredOrgIds(profile)
      if (administered.length === 0) {
        return forbidden(instance, '관리 기관이 지정되지 않은 계정입니다.')
      }
      if (body.orgId != null) {
        // 없는 기관도 같은 답이다 — 어떤 기관이 존재하는지는 기관 계층에게 비밀이다.
        if (!administered.includes(body.orgId)) {
          return orgFieldError(instance, '자기 기관의 공지만 등록할 수 있습니다.')
        }
        targetOrgId = body.orgId
      } else if (administered.length === 1) {
        targetOrgId = administered[0]
      } else {
        return orgFieldError(instance, '기관 공지에는 대상 기관이 필요합니다.')
      }
    }
    if (body.scope === 'ORG' && body.audience === 'PUBLIC') {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        instance: '/api/v1/admin/notices',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'audience', message: '기관 공지는 익명에게 공개할 수 없습니다.' }],
      })
    }
    const created = makeNotice({
      ...body,
      id: uuid(nextNoticeId++),
      // 계약: 게시 시작을 생략하면 즉시 게시한다.
      startsAt: body.startsAt ?? new Date().toISOString(),
      orgId: targetOrgId,
      orgName: orgs.find((org) => org.id === targetOrgId)?.name ?? null,
      images: [],
    })
    noticeStore = [created, ...noticeStore]
    return HttpResponse.json(toAdminView(created), { status: 201 })
  }),

  http.patch('*/api/v1/admin/notices/:noticeId', async ({ params, request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const noticeId = String(params.noticeId)
    const existing = noticeStore.find((row) => row.id === noticeId)
    if (!existing) return notFound(`/api/v1/admin/notices/${noticeId}`)
    const refused = writeRefusal(profile, existing, `/api/v1/admin/notices/${noticeId}`)
    if (refused) return refused
    // 계약의 수정 요청은 scope도 orgId도 받지 않는다 — 범위는 등록 때 정해진다.
    const body = (await request.json()) as Schemas['NoticeUpdateRequest']
    const updated: StoredNotice = {
      ...existing,
      ...body,
      updatedAt: new Date().toISOString(),
    }
    noticeStore = noticeStore.map((row) => (row.id === noticeId ? updated : row))
    return HttpResponse.json(toAdminView(updated), { status: 200 })
  }),

  http.delete('*/api/v1/admin/notices/:noticeId', ({ params, request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const noticeId = String(params.noticeId)
    const existing = noticeStore.find((row) => row.id === noticeId)
    if (!existing) return notFound(`/api/v1/admin/notices/${noticeId}`)
    const refused = writeRefusal(profile, existing, `/api/v1/admin/notices/${noticeId}`)
    if (refused) return refused
    noticeStore = noticeStore.filter((row) => row.id !== noticeId)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('*/api/v1/admin/notices/:noticeId/images', async ({ params, request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const noticeId = String(params.noticeId)
    const existing = noticeStore.find((row) => row.id === noticeId)
    if (!existing) return notFound(`/api/v1/admin/notices/${noticeId}/images`)
    const instance = `/api/v1/admin/notices/${noticeId}/images`
    const refused = writeRefusal(profile, existing, instance)
    if (refused) return refused
    const form = await request.formData()
    const file = form.get('file')
    // 계약이 multipart 본문을 required로 적지 않는 것은 의도다 — 파일이 없는
    // 요청도 프레임워크의 500이 아니라 이 422로 답한다.
    if (!(file instanceof File)) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        instance,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'file', message: '이미지 파일을 첨부해 주세요.' }],
      })
    }
    if (existing.images.length >= MAX_IMAGES) {
      return problemResponse({
        type: 'about:blank',
        title: '요청을 처리할 수 없습니다',
        status: 409,
        detail: `이미지는 공지 하나에 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`,
        instance,
        code: 'NOTICE_IMAGE_LIMIT_EXCEEDED',
      })
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return problemResponse({
        type: 'about:blank',
        title: '요청 본문이 너무 큽니다',
        status: 413,
        detail: '이미지 한 장은 2 MiB까지 첨부할 수 있습니다.',
        instance,
        code: 'NOTICE_IMAGE_TOO_LARGE',
      })
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '지원하지 않는 이미지 형식입니다.',
        instance,
        code: 'NOTICE_IMAGE_TYPE_UNSUPPORTED',
      })
    }
    const imageId = uuid(nextNoticeId++)
    const image: NoticeImageView = {
      id: imageId,
      fileName: file.name,
      contentType: file.type,
      byteSize: file.size,
      url: `/api/v1/notices/${noticeId}/images/${imageId}`,
    }
    noticeStore = noticeStore.map((row) =>
      row.id === noticeId ? { ...row, images: [...row.images, image] } : row,
    )
    return HttpResponse.json(image, { status: 201 })
  }),

  http.delete('*/api/v1/admin/notices/:noticeId/images/:imageId', ({ params, request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const noticeId = String(params.noticeId)
    const imageId = String(params.imageId)
    const existing = noticeStore.find((row) => row.id === noticeId)
    if (!existing?.images.some((image) => image.id === imageId)) {
      return notFound(`/api/v1/admin/notices/${noticeId}/images/${imageId}`)
    }
    const refused = writeRefusal(
      profile,
      existing,
      `/api/v1/admin/notices/${noticeId}/images/${imageId}`,
    )
    if (refused) return refused
    noticeStore = noticeStore.map((row) =>
      row.id === noticeId
        ? { ...row, images: row.images.filter((image) => image.id !== imageId) }
        : row,
    )
    return new HttpResponse(null, { status: 204 })
  }),
]

/** 게시 중인 미래 종료 시각 — 테스트가 직접 공지를 세울 때 쓴다. */
export const NOTICE_FUTURE_END = FUTURE
