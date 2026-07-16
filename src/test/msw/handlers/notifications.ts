import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse, unauthorizedProblem } from './auth'

type Schemas = components['schemas']
type NotificationView = Schemas['NotificationView']

/** 내부 저장용 알림 행 — 소유자(userId)를 함께 들고 응답 시 제거한다. */
interface StoredNotification extends NotificationView {
  userId: number
}

function initialNotifications(): StoredNotification[] {
  return [
    /* ─── 사용자 홍길동(42) ─── */
    {
      userId: 42,
      id: 301,
      event: 'vm.create.done',
      title: 'VM 생성 완료',
      body: 'capstone-team3-api VM 생성이 완료되었습니다.',
      linkPath: '/console/vms/55',
      importance: 'NORMAL',
      createdAt: '2026-07-13T10:00:00+09:00',
      readAt: null,
    },
    {
      userId: 42,
      id: 302,
      event: 'vm.expiry.d7',
      title: 'VM 만료 7일 전',
      body: 'algo-judge VM의 사용 기간이 7일 뒤 만료됩니다. 필요하면 관리자에게 연장을 요청해 주세요.',
      linkPath: null,
      importance: 'HIGH',
      createdAt: '2026-07-13T09:00:00+09:00',
      readAt: null,
    },
    {
      userId: 42,
      id: 303,
      event: 'announcement',
      title: '7월 정기 점검 안내',
      body: '7월 20일(월) 02:00~04:00 KST에 호스트 정기 점검이 진행됩니다.',
      linkPath: null,
      importance: 'NORMAL',
      createdAt: '2026-07-10T11:00:00+09:00',
      readAt: '2026-07-10T12:00:00+09:00',
    },
    /* ─── 기관 관리자 김관리(7) ─── */
    {
      userId: 7,
      id: 310,
      event: 'vmrequest.submitted',
      title: '새 VM 신청',
      body: '홍길동님이 VM 신청(추가 실습 서버)을 제출했습니다.',
      linkPath: '/admin/requests/201',
      importance: 'NORMAL',
      createdAt: '2026-07-13T08:30:00+09:00',
      readAt: null,
    },
  ]
}

/* ─── 발송 로그 (SYS_ADMIN, /admin/notifications) ─── */

type AdminNotificationView = Schemas['AdminNotificationView']

function initialDeliveryLog(): AdminNotificationView[] {
  return [
    {
      id: 404,
      userId: 42,
      userEmail: 'gildong.hong@pusan.ac.kr',
      event: 'vm.create.done',
      title: 'VM 생성 완료',
      body: 'capstone-team3-api VM 생성이 완료되었습니다.',
      linkPath: '/console/vms/55',
      importance: 'NORMAL',
      channel: 'EMAIL',
      status: 'SENT',
      attempts: 1,
      lastError: null,
      sentAt: '2026-07-13T10:00:20+09:00',
      createdAt: '2026-07-13T10:00:00+09:00',
      readAt: null,
    },
    {
      id: 403,
      userId: 58,
      userEmail: 'younghee.park@pusan.ac.kr',
      event: 'vm.expiry.d7',
      title: 'VM 만료 7일 전',
      body: 'semester-web VM의 사용 기간이 7일 뒤 만료됩니다.',
      linkPath: null,
      importance: 'HIGH',
      channel: 'EMAIL',
      status: 'FAILED',
      attempts: 3,
      lastError: 'SMTP 연결 실패 (연결 시간 초과)',
      sentAt: null,
      createdAt: '2026-07-13T09:00:00+09:00',
      readAt: null,
    },
    {
      id: 402,
      userId: 57,
      userEmail: 'cheolsu.kim@pusan.ac.kr',
      event: 'announcement',
      title: '7월 정기 점검 안내',
      body: '7월 20일(월) 02:00~04:00 KST에 호스트 정기 점검이 진행됩니다.',
      linkPath: null,
      importance: 'NORMAL',
      channel: 'EMAIL',
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      sentAt: null,
      createdAt: '2026-07-13T08:00:00+09:00',
      readAt: null,
    },
    {
      id: 401,
      userId: 42,
      userEmail: 'gildong.hong@pusan.ac.kr',
      event: 'vm.password.viewed',
      title: '초기 비밀번호 열람',
      body: '초기 비밀번호가 열람되었습니다.',
      linkPath: null,
      importance: 'NORMAL',
      channel: 'EMAIL',
      status: 'SKIPPED',
      attempts: 0,
      lastError: null,
      sentAt: null,
      createdAt: '2026-07-12T15:00:00+09:00',
      readAt: null,
    },
  ]
}

export let notificationStore: StoredNotification[] = initialNotifications()
export let deliveryLogStore: AdminNotificationView[] = initialDeliveryLog()

export function resetNotificationFixtures() {
  notificationStore = initialNotifications()
  deliveryLogStore = initialDeliveryLog()
}

function userIdOf(request: Request): number | null {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token]?.id ?? null
}

function toView({ userId: _userId, ...view }: StoredNotification): NotificationView {
  return view
}

const notFound = () =>
  problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '요청한 리소스가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })

export const notificationHandlers: RequestHandler[] = [
  http.get('*/api/v1/notifications', ({ request }) => {
    const userId = userIdOf(request)
    if (userId == null) return problemResponse(unauthorizedProblem)
    const url = new URL(request.url)
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true'
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = notificationStore
      .filter((n) => n.userId === userId)
      .filter((n) => !unreadOnly || n.readAt == null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const body: Schemas['NotificationPage'] = {
      content: filtered.slice(page * size, (page + 1) * size).map(toView),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.get('*/api/v1/notifications/unread-count', ({ request }) => {
    const userId = userIdOf(request)
    if (userId == null) return problemResponse(unauthorizedProblem)
    const unreadCount = notificationStore.filter(
      (n) => n.userId === userId && n.readAt == null,
    ).length
    const body: Schemas['UnreadCountResponse'] = { unreadCount }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.post('*/api/v1/notifications/:notificationId/read', ({ request, params }) => {
    const userId = userIdOf(request)
    if (userId == null) return problemResponse(unauthorizedProblem)
    const found = notificationStore.find(
      (n) => n.id === Number(params.notificationId) && n.userId === userId,
    )
    if (!found) return notFound() // 타인 알림은 존재 마스킹(404)
    // 멱등: 이미 읽었으면 최초 읽음 시각 유지.
    found.readAt ??= '2026-07-13T12:00:00+09:00'
    return HttpResponse.json(toView(found), { status: 200 })
  }),

  http.post('*/api/v1/notifications/read-all', ({ request }) => {
    const userId = userIdOf(request)
    if (userId == null) return problemResponse(unauthorizedProblem)
    let updatedCount = 0
    for (const n of notificationStore) {
      if (n.userId === userId && n.readAt == null) {
        n.readAt = '2026-07-13T12:00:00+09:00'
        updatedCount += 1
      }
    }
    return HttpResponse.json({ updatedCount }, { status: 200 })
  }),

  /* ─── 발송 로그 (SYS_ADMIN) ─── */

  http.get('*/api/v1/admin/notifications', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const event = url.searchParams.get('event')
    const email = url.searchParams.get('email')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = deliveryLogStore
      .filter((n) => !status || n.status === status)
      .filter((n) => !event || n.event === event)
      .filter((n) => !email || n.userEmail.includes(email))
      .sort((a, b) => b.id - a.id)
    const body: Schemas['AdminNotificationPage'] = {
      content: filtered.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.post('*/api/v1/admin/notifications/:notificationId/resend', ({ params }) => {
    const found = deliveryLogStore.find((n) => n.id === Number(params.notificationId))
    if (!found) return notFound()
    // 계약: FAILED만 재발송 가능
    if (found.status !== 'FAILED') {
      return problemResponse({
        type: 'about:blank',
        title: '재발송할 수 없는 알림입니다',
        status: 409,
        detail: '발송에 실패한(FAILED) 알림만 재발송할 수 있습니다.',
        instance: `/api/v1/admin/notifications/${found.id}/resend`,
        code: 'NOTIFICATION_NOT_RESENDABLE',
      })
    }
    found.status = 'PENDING'
    found.attempts += 1
    found.lastError = null
    return HttpResponse.json(
      { message: '알림 재발송을 접수했습니다. 잠시 후 발송 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),
]
