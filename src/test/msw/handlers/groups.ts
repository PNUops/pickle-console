import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse, regularUser } from './auth'

type Schemas = components['schemas']

/* ─── fixture users addable by email ─── */

export const knownUsers: Schemas['GroupMemberResponse'][] = [
  { userId: 57, name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'MEMBER' },
  { userId: 58, name: '이영희', email: 'younghee.lee@pusan.ac.kr', role: 'MEMBER' },
  { userId: 59, name: '박민수', email: 'minsu.park@pusan.ac.kr', role: 'MEMBER' },
  { userId: 60, name: '최수진', email: 'sujin.choi@pusan.ac.kr', role: 'MEMBER' },
]

interface GroupRecord {
  detail: Omit<Schemas['GroupDetailResponse'], 'members'>
  members: Schemas['GroupMemberResponse'][]
}

const me = (): Schemas['GroupMemberResponse'] => ({
  userId: regularUser.id,
  name: regularUser.name,
  email: regularUser.email,
  role: 'OWNER',
})

function initialGroups(): GroupRecord[] {
  return [
    {
      detail: {
        id: 7,
        kind: 'PERSONAL',
        name: '홍길동',
        slug: 'gildong-hong',
        description: null,
        myRole: 'OWNER',
        createdAt: '2026-06-01T09:00:00+09:00',
      },
      members: [me()],
    },
    {
      detail: {
        id: 12,
        kind: 'PROJECT',
        name: '캡스톤 3조',
        slug: 'capstone-team3',
        description: '2026-1 캡스톤디자인 3조',
        myRole: 'OWNER',
        createdAt: '2026-07-01T10:12:00+09:00',
      },
      members: [
        me(),
        { userId: 57, name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'MEMBER' },
        { userId: 58, name: '이영희', email: 'younghee.lee@pusan.ac.kr', role: 'MEMBER' },
        { userId: 59, name: '박민수', email: 'minsu.park@pusan.ac.kr', role: 'MEMBER' },
      ],
    },
    {
      // 로그인 사용자(42)가 구성원(소유자가 아님)인 두 번째 그룹.
      detail: {
        id: 14,
        kind: 'PROJECT',
        name: '데이터베이스 실습',
        slug: 'db-lab',
        description: '2026-1 데이터베이스 실습 조교팀',
        myRole: 'MEMBER',
        createdAt: '2026-06-20T14:00:00+09:00',
      },
      members: [
        { userId: 57, name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'OWNER' },
        { ...me(), role: 'MEMBER' },
      ],
    },
    {
      detail: {
        id: 15,
        kind: 'TEAM',
        name: '알고리즘 스터디',
        slug: 'algo-study',
        description: '주 1회 문제 풀이 모임',
        myRole: 'MEMBER',
        createdAt: '2026-06-15T20:00:00+09:00',
      },
      members: [
        { userId: 57, name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'OWNER' },
        { ...me(), role: 'MEMBER' },
      ],
    },
  ]
}

export let groupStore: GroupRecord[] = initialGroups()
let nextGroupId = 100

export function resetGroupFixtures() {
  groupStore = initialGroups()
  nextGroupId = 100
}

function toSummary(record: GroupRecord): Schemas['GroupSummaryResponse'] {
  const { id, kind, name, slug, description } = record.detail
  const myRole =
    record.members.find((m) => m.userId === regularUser.id)?.role ?? 'MEMBER'
  return { id, kind, name, slug, description, myRole, memberCount: record.members.length }
}

function toDetail(record: GroupRecord): Schemas['GroupDetailResponse'] {
  // myRole은 서버처럼 현재 구성원 상태에서 계산한다 (역할 변경/OWNER 이전 반영).
  const myRole =
    record.members.find((m) => m.userId === regularUser.id)?.role ??
    record.detail.myRole
  return { ...record.detail, myRole, members: record.members }
}

/** 이 그룹의 구성원 — VM 접근 목록 mock이 부여 대상 자격을 확인할 때 쓴다. */
export function groupMembersOf(groupId: number): Schemas['GroupMemberResponse'][] {
  return groupStore.find((g) => g.detail.id === groupId)?.members ?? []
}

function findGroup(groupId: string | readonly string[]): GroupRecord | undefined {
  return groupStore.find((g) => g.detail.id === Number(groupId))
}

const notFound = () =>
  problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '요청한 리소스가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })

/* ─── handlers ─── */

export const groupHandlers: RequestHandler[] = [
  http.get('*/api/v1/groups', () =>
    HttpResponse.json(groupStore.map(toSummary), { status: 200 }),
  ),

  http.post('*/api/v1/groups', async ({ request }) => {
    const body = (await request.json()) as Schemas['CreateGroupRequest']
    if (groupStore.some((g) => g.detail.slug === body.slug)) {
      return problemResponse({
        type: 'about:blank',
        title: '이미 사용 중인 slug입니다',
        status: 409,
        detail: `'${body.slug}'은(는) 이미 다른 그룹이 사용 중입니다.`,
        code: 'GROUP_SLUG_DUPLICATE',
      })
    }
    const record: GroupRecord = {
      detail: {
        id: nextGroupId++,
        kind: body.kind,
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        myRole: 'OWNER',
        createdAt: '2026-07-08T12:00:00+09:00',
      },
      members: [me()],
    }
    groupStore.push(record)
    return HttpResponse.json(toDetail(record), { status: 201 })
  }),

  http.get('*/api/v1/groups/:groupId', ({ params }) => {
    const record = findGroup(params.groupId!)
    if (!record) return notFound()
    return HttpResponse.json(toDetail(record), { status: 200 })
  }),

  http.patch('*/api/v1/groups/:groupId', async ({ params, request }) => {
    const record = findGroup(params.groupId!)
    if (!record) return notFound()
    const body = (await request.json()) as { name?: string; description?: string | null }
    if (body.name !== undefined) record.detail.name = body.name
    if (body.description !== undefined) record.detail.description = body.description
    return HttpResponse.json(toDetail(record), { status: 200 })
  }),

  http.delete('*/api/v1/groups/:groupId', ({ params }) => {
    const record = findGroup(params.groupId!)
    if (!record) return notFound()
    if (record.detail.kind === 'PERSONAL') {
      return problemResponse({
        type: 'about:blank',
        title: '그룹을 삭제할 수 없습니다',
        status: 409,
        detail: '개인 그룹은 삭제할 수 없습니다. 계정 탈퇴 시에만 함께 정리됩니다.',
        code: 'GROUP_PERSONAL_UNDELETABLE',
      })
    }
    const index = groupStore.findIndex((g) => g.detail.id === record.detail.id)
    if (index >= 0) groupStore.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('*/api/v1/groups/:groupId/members', async ({ params, request }) => {
    const record = findGroup(params.groupId!)
    if (!record) return notFound()
    const body = (await request.json()) as { email: string; role: Schemas['GroupMemberRole'] }
    const user = knownUsers.find((u) => u.email === body.email)
    if (!user) {
      return problemResponse({
        type: 'about:blank',
        title: '사용자를 찾을 수 없습니다',
        status: 404,
        detail: '해당 이메일로 가입된 사용자가 없습니다. 가입 후 다시 시도해 주세요.',
        code: 'GROUP_MEMBER_USER_NOT_FOUND',
      })
    }
    if (record.members.some((m) => m.userId === user.userId)) {
      return problemResponse({
        type: 'about:blank',
        title: '이미 그룹 구성원입니다',
        status: 409,
        detail: '해당 사용자는 이미 이 그룹의 구성원입니다.',
        code: 'GROUP_MEMBER_ALREADY_EXISTS',
      })
    }
    const member: Schemas['GroupMemberResponse'] = { ...user, role: body.role }
    record.members.push(member)
    return HttpResponse.json(member, { status: 201 })
  }),

  http.patch('*/api/v1/groups/:groupId/members/:userId', async ({ params, request }) => {
    const record = findGroup(params.groupId!)
    const member = record?.members.find((m) => m.userId === Number(params.userId))
    if (!record || !member) return notFound()
    const body = (await request.json()) as { role: Schemas['GroupMemberRole'] }
    // 소유자는 여러 명일 수 있다 — 지정해도 지정한 사람은 그대로 소유자로 남는다.
    // 막는 것은 마지막 한 명의 해제뿐이다 (그러면 그룹을 다룰 사람이 없어진다).
    const owners = record.members.filter((m) => m.role === 'OWNER').length
    if (member.role === 'OWNER' && body.role !== 'OWNER' && owners <= 1) {
      return problemResponse({
        type: 'about:blank',
        title: '유일한 소유자의 역할은 변경할 수 없습니다',
        status: 409,
        detail: '소유권을 다른 구성원에게 이전한 뒤 다시 시도해 주세요.',
        code: 'GROUP_SOLE_OWNER_REMOVAL',
      })
    }
    member.role = body.role
    return HttpResponse.json(member, { status: 200 })
  }),

  http.delete('*/api/v1/groups/:groupId/members/:userId', ({ params }) => {
    const record = findGroup(params.groupId!)
    const member = record?.members.find((m) => m.userId === Number(params.userId))
    if (!record || !member) return notFound()
    const ownerCount = record.members.filter((m) => m.role === 'OWNER').length
    if (member.role === 'OWNER' && ownerCount <= 1) {
      return problemResponse({
        type: 'about:blank',
        title: '유일한 소유자는 나갈 수 없습니다',
        status: 409,
        detail: '소유권을 다른 구성원에게 이전한 뒤 다시 시도해 주세요.',
        code: 'GROUP_SOLE_OWNER_REMOVAL',
      })
    }
    record.members = record.members.filter((m) => m.userId !== member.userId)
    return new HttpResponse(null, { status: 204 })
  }),
]
