import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse, studentUser } from './auth'

type Schemas = components['schemas']

/* ─── fixture users addable by email ─── */

export const knownUsers: Schemas['GroupMember'][] = [
  { userId: 57, name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'MEMBER' },
  { userId: 58, name: '이영희', email: 'younghee.lee@pusan.ac.kr', role: 'MEMBER' },
  { userId: 59, name: '박민수', email: 'minsu.park@pusan.ac.kr', role: 'MEMBER' },
  { userId: 60, name: '최수진', email: 'sujin.choi@pusan.ac.kr', role: 'MEMBER' },
]

interface GroupRecord {
  detail: Omit<Schemas['GroupDetail'], 'members'>
  members: Schemas['GroupMember'][]
}

const me = (): Schemas['GroupMember'] => ({
  userId: studentUser.id,
  name: studentUser.name,
  email: studentUser.email,
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
        { userId: 57, name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'EDITOR' },
        { userId: 58, name: '이영희', email: 'younghee.lee@pusan.ac.kr', role: 'MEMBER' },
        { userId: 59, name: '박민수', email: 'minsu.park@pusan.ac.kr', role: 'VIEWER' },
      ],
    },
    {
      // EDITOR 게이트 검증용 — 로그인 사용자(42)가 EDITOR인 그룹.
      detail: {
        id: 14,
        kind: 'PROJECT',
        name: '데이터베이스 실습',
        slug: 'db-lab',
        description: '2026-1 데이터베이스 실습 조교팀',
        myRole: 'EDITOR',
        createdAt: '2026-06-20T14:00:00+09:00',
      },
      members: [
        { userId: 57, name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'OWNER' },
        { ...me(), role: 'EDITOR' },
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

function toSummary(record: GroupRecord): Schemas['GroupSummary'] {
  const { id, kind, name, slug, description } = record.detail
  const myRole =
    record.members.find((m) => m.userId === studentUser.id)?.role ?? 'VIEWER'
  return { id, kind, name, slug, description, myRole, memberCount: record.members.length }
}

function toDetail(record: GroupRecord): Schemas['GroupDetail'] {
  // myRole은 서버처럼 현재 구성원 상태에서 계산한다 (역할 변경/OWNER 이전 반영).
  const myRole =
    record.members.find((m) => m.userId === studentUser.id)?.role ??
    record.detail.myRole
  return { ...record.detail, myRole, members: record.members }
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
    const member: Schemas['GroupMember'] = { ...user, role: body.role }
    record.members.push(member)
    return HttpResponse.json(member, { status: 201 })
  }),

  http.patch('*/api/v1/groups/:groupId/members/:userId', async ({ params, request }) => {
    const record = findGroup(params.groupId!)
    const member = record?.members.find((m) => m.userId === Number(params.userId))
    if (!record || !member) return notFound()
    const body = (await request.json()) as { role: Schemas['GroupMemberRole'] }
    if (body.role === 'OWNER') {
      // Ownership transfer: the previous OWNER is demoted to EDITOR.
      for (const m of record.members) {
        if (m.role === 'OWNER') m.role = 'EDITOR'
      }
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
