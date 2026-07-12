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
    /* ─── 학생 홍길동(42) ─── */
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

export let notificationStore: StoredNotification[] = initialNotifications()

export function resetNotificationFixtures() {
  notificationStore = initialNotifications()
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
]
