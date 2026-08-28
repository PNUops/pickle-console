import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { isOrgTier, isSysTier } from '../../../auth/permissions'
import { ACCESS_TOKENS, problemResponse, unauthorizedProblem } from './auth'
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
 * 공지 하나를 만든다. 기본값은 "지금 게시 중, 고정도 팝업도 아님" — 즉 로그인한
 * 사람만 게시판에서 읽는 공지다.
 *
 * 기본 픽스처에 **뜨는 것이 아무것도 없는 것은 의도다** — 팝업 호스트가 인증 셸과
 * 랜딩·로그인·회원가입 화면에 달리므로, 기본값에 활성 팝업을 하나라도 두면 이
 * 기능과 무관한 화면 테스트 전부가 모달을 마주하게 된다. 팝업을 보고 싶은
 * 테스트가 `seedNotices`로 직접 세운다.
 */
export function makeNotice(notice: Partial<StoredNotice> & { id: string }): StoredNotice {
  return {
    title: '공지',
    body: '본문',
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
    }),
    makeNotice({
      id: uuid(203),
      title: '서비스 점검 팝업',
      body: '팝업으로 띄우는 공지는 로그인하지 않은 방문자에게도 보입니다.',
      popup: true,
      // 아직 시작하지 않은 팝업 — 게시 창이 가시성의 절반이라는 것을 세우는
      // 픽스처다. 이미지가 붙어 있는 것은 관리 미리보기가 게시 전에도 열려야
      // 하기 때문이고, 그 이미지는 익명에게는 아직 없는 것과 같아야 한다.
      startsAt: FUTURE,
      images: [noticeImage(uuid(203), 213, 'scheduled.png')],
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

/**
 * 공개 표면(게시판·상세)에서 이 공지가 이 읽는이에게 보이는가 — 서버
 * `NoticeQueryService.visibleTo`의 거울이다.
 *
 * **두 반쪽이 다 필요하다.** 게시 기간 밖이면 아무도 못 보고, 기간 안이면 로그인한
 * 사람은 팝업이든 아니든 보고 익명은 팝업만 본다. 기간을 빼고 `popup`만 보면
 * 예약된 팝업 공지가 게시 전부터 익명에게 열린다 — 이미지 캐시 지시자가 이 함수의
 * 답에서 유도되므로, 그 실수는 「주소를 아는 누구나」로 곧장 이어진다.
 */
function visibleOnBoard(notice: StoredNotice, profile: Profile | null): boolean {
  return isActive(notice) && (profile != null || notice.popup)
}

/**
 * 관리 표면에 닿는 사람인가 — 서버 `NoticeQueryService.manageableBy`의 거울이고,
 * 그쪽이 컨트롤러 클래스 게이트를 다시 적어 둔 이유와 같다: 이미지 바이트는 인증
 * 없이도 열리는 경로라 애노테이션이 먼저 역할을 좁혀 주지 않는다.
 *
 * 공지에 대해서는 아무것도 묻지 않는다. 물을 것이 없어서다 — 관리 목록에 닿는
 * 계정은 그 목록의 모든 행에 닿는다.
 */
function manageableBy(profile: Profile | null): boolean {
  return profile != null && (isSysTier(profile.role) || isOrgTier(profile.role))
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
    const profile = profileOf(request)
    // 공유 캐시에 남겨도 되는 것은 **지금 익명 요청이 성공할 이미지뿐**이다. 그
    // 판정을 다시 적지 않고 가시성 함수에 읽는이 없이 물어 유도한다 — 서버가
    // 같은 자리에서 `visibleTo(notice, null, now)`를 부르므로, 목이 이 형태를
    // 잃으면 두 레포가 서로 다른 세계를 각자 초록으로 고정한다.
    const publiclyReadable = visibleOnBoard(notice, null)
    // 관리자는 게시 창 밖의 이미지도 받는다 — 관리 목록 행이 이미지 주소를 싣고
    // 있어서, 없으면 예약 공지를 게시 직전에 확인할 방법이 없다.
    // 존재를 알리지 않는다 — 권한 없는 요청과 없는 이미지가 같은 답을 받는다.
    if (!visibleOnBoard(notice, profile) && !manageableBy(profile)) return notFound(instance)
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
   * 관리 목록에는 **범위가 없다** — 공지가 기관에 속하지 않으므로, 컨트롤러 게이트를
   * 통과한 역할은 모두 같은 목록을 읽는다. 역할을 가르는 것은 쓰기뿐이다.
   *
   * 기관을 하나도 부여받지 않은 기관 계층 계정도 포함된다. 종전에는 그것을
   * 거절했는데, 그 거절이 바로 「기관으로 기능을 제한하는 것」이었다.
   */
  http.get('*/api/v1/admin/notices', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const visible = [...noticeStore].sort(inFeedOrder)
    return HttpResponse.json(paged(visible.map(toAdminView), new URL(request.url)), {
      status: 200,
    })
  }),

  http.post('*/api/v1/admin/notices', async ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const body = (await request.json()) as Schemas['NoticeCreateRequest']
    // 정할 것이 남지 않았다 — 공지는 어느 기관에도 속하지 않고, 노출은 popup 하나가
    // 정한다. 게이트를 통과한 사람이 보낸 것을 그대로 세운다.
    const created = makeNotice({
      ...body,
      id: uuid(nextNoticeId++),
      // 계약: 게시 시작을 생략하면 즉시 게시한다.
      startsAt: body.startsAt ?? new Date().toISOString(),
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
