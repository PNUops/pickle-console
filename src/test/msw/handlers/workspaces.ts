import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse, regularUser } from './auth'

type Schemas = components['schemas']

/* ─── fixture users addable by email ─── */

export const knownUsers: Schemas['WorkspaceMemberResponse'][] = [
  { userId: 57, name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'MEMBER' },
  { userId: 58, name: '이영희', email: 'younghee.lee@pusan.ac.kr', role: 'MEMBER' },
  { userId: 59, name: '박민수', email: 'minsu.park@pusan.ac.kr', role: 'MEMBER' },
  { userId: 60, name: '최수진', email: 'sujin.choi@pusan.ac.kr', role: 'MEMBER' },
]

interface WorkspaceRecord {
  detail: Omit<Schemas['WorkspaceDetailResponse'], 'members'>
  members: Schemas['WorkspaceMemberResponse'][]
}

const me = (): Schemas['WorkspaceMemberResponse'] => ({
  userId: regularUser.id,
  name: regularUser.name,
  email: regularUser.email,
  role: 'OWNER',
})

function initialWorkspaces(): WorkspaceRecord[] {
  return [
    {
      detail: {
        id: 7,
        kind: 'PERSONAL',
        name: '홍길동',
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
      // 로그인 사용자(42)가 구성원(소유자가 아님)인 두 번째 워크스페이스.
      detail: {
        id: 14,
        kind: 'PROJECT',
        name: '데이터베이스 실습',
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

export let workspaceStore: WorkspaceRecord[] = initialWorkspaces()
let nextWorkspaceId = 100

export function resetWorkspaceFixtures() {
  workspaceStore = initialWorkspaces()
  nextWorkspaceId = 100
}

function toSummary(record: WorkspaceRecord): Schemas['WorkspaceSummaryResponse'] {
  const { id, kind, name, description } = record.detail
  const myRole =
    record.members.find((m) => m.userId === regularUser.id)?.role ?? 'MEMBER'
  return { id, kind, name, description, myRole, memberCount: record.members.length }
}

function toDetail(record: WorkspaceRecord): Schemas['WorkspaceDetailResponse'] {
  // myRole은 서버처럼 현재 구성원 상태에서 계산한다 (역할 변경/OWNER 이전 반영).
  const myRole =
    record.members.find((m) => m.userId === regularUser.id)?.role ??
    record.detail.myRole
  return { ...record.detail, myRole, members: record.members }
}

/** 로그인 사용자가 이 워크스페이스의 구성원인지 — 목록 mock의 조회 범위 판단. */
export function isMyWorkspace(workspaceId: number): boolean {
  return workspaceMembersOf(workspaceId).some((m) => m.userId === regularUser.id)
}

/** 이 워크스페이스의 구성원 — VM 접근 목록 mock이 부여 대상 자격을 확인할 때 쓴다. */
export function workspaceMembersOf(workspaceId: number): Schemas['WorkspaceMemberResponse'][] {
  return workspaceStore.find((g) => g.detail.id === workspaceId)?.members ?? []
}

function findWorkspace(workspaceId: string | readonly string[]): WorkspaceRecord | undefined {
  return workspaceStore.find((g) => g.detail.id === Number(workspaceId))
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

export const workspaceHandlers: RequestHandler[] = [
  // 서버와 같은 범위: 내가 속한 워크스페이스만. 나간 워크스페이스가 목록과
  // 워크스페이스 선택기에서 함께 사라지는 것이 이 필터에 달려 있다.
  http.get('*/api/v1/workspaces', () =>
    HttpResponse.json(
      workspaceStore
        .filter((record) => record.members.some((m) => m.userId === regularUser.id))
        .map(toSummary),
      { status: 200 },
    ),
  ),

  http.post('*/api/v1/workspaces', async ({ request }) => {
    const body = (await request.json()) as Schemas['CreateWorkspaceRequest']
    const record: WorkspaceRecord = {
      detail: {
        id: nextWorkspaceId++,
        kind: body.kind,
        name: body.name,
        description: body.description ?? null,
        myRole: 'OWNER',
        createdAt: '2026-07-08T12:00:00+09:00',
      },
      members: [me()],
    }
    workspaceStore.push(record)
    return HttpResponse.json(toDetail(record), { status: 201 })
  }),

  http.get('*/api/v1/workspaces/:workspaceId', ({ params }) => {
    const record = findWorkspace(params.workspaceId!)
    if (!record) return notFound()
    return HttpResponse.json(toDetail(record), { status: 200 })
  }),

  http.patch('*/api/v1/workspaces/:workspaceId', async ({ params, request }) => {
    const record = findWorkspace(params.workspaceId!)
    if (!record) return notFound()
    const body = (await request.json()) as { name?: string; description?: string | null }
    if (body.name !== undefined) record.detail.name = body.name
    if (body.description !== undefined) record.detail.description = body.description
    return HttpResponse.json(toDetail(record), { status: 200 })
  }),

  http.delete('*/api/v1/workspaces/:workspaceId', ({ params }) => {
    const record = findWorkspace(params.workspaceId!)
    if (!record) return notFound()
    if (record.detail.kind === 'PERSONAL') {
      return problemResponse({
        type: 'about:blank',
        title: '워크스페이스를 삭제할 수 없습니다',
        status: 409,
        detail: '개인 워크스페이스는 삭제할 수 없습니다. 계정 탈퇴 시에만 함께 정리됩니다.',
        code: 'WORKSPACE_PERSONAL_UNDELETABLE',
      })
    }
    const index = workspaceStore.findIndex((g) => g.detail.id === record.detail.id)
    if (index >= 0) workspaceStore.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('*/api/v1/workspaces/:workspaceId/members', async ({ params, request }) => {
    const record = findWorkspace(params.workspaceId!)
    if (!record) return notFound()
    const body = (await request.json()) as { email: string; role: Schemas['WorkspaceMemberRole'] }
    const user = knownUsers.find((u) => u.email === body.email)
    if (!user) {
      return problemResponse({
        type: 'about:blank',
        title: '사용자를 찾을 수 없습니다',
        status: 404,
        detail: '해당 이메일로 가입된 사용자가 없습니다. 가입 후 다시 시도해 주세요.',
        code: 'WORKSPACE_MEMBER_USER_NOT_FOUND',
      })
    }
    if (record.members.some((m) => m.userId === user.userId)) {
      return problemResponse({
        type: 'about:blank',
        title: '이미 워크스페이스 구성원입니다',
        status: 409,
        detail: '해당 사용자는 이미 이 워크스페이스의 구성원입니다.',
        code: 'WORKSPACE_MEMBER_ALREADY_EXISTS',
      })
    }
    const member: Schemas['WorkspaceMemberResponse'] = { ...user, role: body.role }
    record.members.push(member)
    return HttpResponse.json(member, { status: 201 })
  }),

  http.patch('*/api/v1/workspaces/:workspaceId/members/:userId', async ({ params, request }) => {
    const record = findWorkspace(params.workspaceId!)
    const member = record?.members.find((m) => m.userId === Number(params.userId))
    if (!record || !member) return notFound()
    const body = (await request.json()) as { role: Schemas['WorkspaceMemberRole'] }
    // 소유자는 여러 명일 수 있다 — 지정해도 지정한 사람은 그대로 소유자로 남는다.
    // 막는 것은 마지막 한 명의 해제뿐이다 (그러면 워크스페이스를 다룰 사람이 없어진다).
    const owners = record.members.filter((m) => m.role === 'OWNER').length
    if (member.role === 'OWNER' && body.role !== 'OWNER' && owners <= 1) {
      return problemResponse({
        type: 'about:blank',
        title: '유일한 소유자의 역할은 변경할 수 없습니다',
        status: 409,
        detail: '소유권을 다른 구성원에게 이전한 뒤 다시 시도해 주세요.',
        code: 'WORKSPACE_SOLE_OWNER_REMOVAL',
      })
    }
    member.role = body.role
    return HttpResponse.json(member, { status: 200 })
  }),

  http.delete('*/api/v1/workspaces/:workspaceId/members/:userId', ({ params }) => {
    const record = findWorkspace(params.workspaceId!)
    const member = record?.members.find((m) => m.userId === Number(params.userId))
    if (!record || !member) return notFound()
    const ownerCount = record.members.filter((m) => m.role === 'OWNER').length
    if (member.role === 'OWNER' && ownerCount <= 1) {
      return problemResponse({
        type: 'about:blank',
        title: '유일한 소유자는 나갈 수 없습니다',
        status: 409,
        detail: '소유권을 다른 구성원에게 이전한 뒤 다시 시도해 주세요.',
        code: 'WORKSPACE_SOLE_OWNER_REMOVAL',
      })
    }
    record.members = record.members.filter((m) => m.userId !== member.userId)
    return new HttpResponse(null, { status: 204 })
  }),
]
