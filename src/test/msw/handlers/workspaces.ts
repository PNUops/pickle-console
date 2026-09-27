import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse, regularUser } from './auth'
import { uuid } from '../ids'

type Schemas = components['schemas']

/* ─── fixture users addable by email ─── */

export const knownUsers: Schemas['WorkspaceMemberResponse'][] = [
  { userId: uuid(57), name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'MEMBER' },
  { userId: uuid(58), name: '이영희', email: 'younghee.lee@pusan.ac.kr', role: 'MEMBER' },
  { userId: uuid(59), name: '박민수', email: 'minsu.park@pusan.ac.kr', role: 'MEMBER' },
  { userId: uuid(60), name: '최수진', email: 'sujin.choi@pusan.ac.kr', role: 'MEMBER' },
]

/** Student numbers of the fixture users that have one, keyed by user id. */
export const knownStudentNumbers: Record<string, string> = {
  [uuid(58)]: '202312345',
}

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
        id: uuid(7),
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
        id: uuid(12),
        kind: 'PROJECT',
        name: '캡스톤 3조',
        description: '2026-1 캡스톤디자인 3조',
        myRole: 'OWNER',
        createdAt: '2026-07-01T10:12:00+09:00',
      },
      members: [
        me(),
        { userId: uuid(57), name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'MEMBER' },
        { userId: uuid(58), name: '이영희', email: 'younghee.lee@pusan.ac.kr', role: 'MEMBER' },
        { userId: uuid(59), name: '박민수', email: 'minsu.park@pusan.ac.kr', role: 'MEMBER' },
      ],
    },
    {
      // 로그인 사용자(42)가 구성원(소유자가 아님)인 두 번째 워크스페이스.
      detail: {
        id: uuid(14),
        kind: 'COURSE',
        name: '데이터베이스 실습',
        description: '2026-1 데이터베이스 실습 조교팀',
        myRole: 'MEMBER',
        createdAt: '2026-06-20T14:00:00+09:00',
      },
      members: [
        { userId: uuid(57), name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'OWNER' },
        { ...me(), role: 'MEMBER' },
      ],
    },
    {
      detail: {
        id: uuid(15),
        kind: 'STUDY',
        name: '알고리즘 스터디',
        description: '주 1회 문제 풀이 모임',
        myRole: 'MEMBER',
        createdAt: '2026-06-15T20:00:00+09:00',
      },
      members: [
        { userId: uuid(57), name: '김철수', email: 'cheolsu.kim@pusan.ac.kr', role: 'OWNER' },
        { ...me(), role: 'MEMBER' },
      ],
    },
  ]
}

export let workspaceStore: WorkspaceRecord[] = initialWorkspaces()
let nextWorkspaceId = 100

function initialInvitations(): Map<string, Schemas['WorkspaceInvitationResponse'][]> {
  return new Map([
    [
      uuid(12),
      [
        {
          id: uuid(3101),
          email: 'jiwoo.han@pusan.ac.kr',
          studentNo: null,
          role: 'MEMBER',
          invitedAt: '2026-09-20T14:30:00+09:00',
          invitedBy: { id: regularUser.id, name: regularUser.name },
        },
      ],
    ],
  ])
}

let invitationStore = initialInvitations()
let nextInvitationId = 3150

export function resetWorkspaceFixtures() {
  workspaceStore = initialWorkspaces()
  nextWorkspaceId = 100
  invitationStore = initialInvitations()
  nextInvitationId = 3150
}

/** Pending invitations of a workspace, created on first use so handlers can push into it. */
function invitationsOf(workspaceId: string): Schemas['WorkspaceInvitationResponse'][] {
  let list = invitationStore.get(workspaceId)
  if (!list) {
    list = []
    invitationStore.set(workspaceId, list)
  }
  return list
}

/** Member management is for an OWNER of a non-personal workspace, as on the server. */
function requireOwner(record: WorkspaceRecord): Response | null {
  const myRole = record.members.find((m) => m.userId === regularUser.id)?.role
  if (myRole === 'OWNER' && record.detail.kind !== 'PERSONAL') return null
  return problemResponse({
    type: 'about:blank',
    title: '구성원을 관리할 수 없습니다',
    status: 403,
    detail: '워크스페이스 소유자만 구성원을 관리할 수 있습니다.',
    code: 'WORKSPACE_MEMBER_MANAGE_FORBIDDEN',
  })
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
export function isMyWorkspace(workspaceId: string | null | undefined): boolean {
  return workspaceMembersOf(workspaceId).some((m) => m.userId === regularUser.id)
}

/** 이 워크스페이스의 구성원 — VM 접근 목록 mock이 부여 대상 자격을 확인할 때 쓴다. */
export function workspaceMembersOf(workspaceId: string | null | undefined): Schemas['WorkspaceMemberResponse'][] {
  return workspaceStore.find((g) => g.detail.id === workspaceId)?.members ?? []
}

function findWorkspace(workspaceId: string | readonly string[]): WorkspaceRecord | undefined {
  return workspaceStore.find((g) => g.detail.id === workspaceId)
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
        id: uuid(nextWorkspaceId++),
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
    const body = (await request.json()) as {
      name?: string
      description?: string | null
      kind?: Schemas['CreatableWorkspaceKind']
    }
    // A mock that breaks a server invariant makes the suite lie in green, so
    // reclassifying a personal workspace is refused here too.
    if (body.kind !== undefined && record.detail.kind === 'PERSONAL') {
      return problemResponse({
        type: 'about:blank',
        title: '입력값을 확인해 주세요',
        status: 422,
        detail: '개인 워크스페이스는 유형을 바꿀 수 없습니다.',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'kind', message: '개인 워크스페이스는 유형을 바꿀 수 없습니다.' }],
      })
    }
    if (body.name !== undefined) record.detail.name = body.name
    if (body.description !== undefined) record.detail.description = body.description
    if (body.kind !== undefined) record.detail.kind = body.kind
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

  http.post('*/api/v1/workspaces/:workspaceId/invitations', async ({ params, request }) => {
    const record = findWorkspace(params.workspaceId!)
    if (!record) return notFound()
    const forbidden = requireOwner(record)
    if (forbidden) return forbidden
    const body = (await request.json()) as Schemas['InviteWorkspaceMembersRequest']
    const pending = invitationsOf(record.detail.id)
    const seen = new Set<string>()
    const results = body.entries.map((entry): Schemas['WorkspaceInvitationResult'] => {
      const email = entry.email?.trim().toLowerCase() || null
      const studentNo = entry.studentNo?.trim() || null
      const echo = email ? { email } : { studentNo }
      const key = email ? `e:${email}` : `s:${studentNo?.toUpperCase()}`
      if (seen.has(key)) return { ...echo, outcome: 'DUPLICATE_IN_REQUEST' }
      seen.add(key)
      // Like the server: only an active account resolves; anything else is reserved.
      const user = email
        ? knownUsers.find((u) => u.email === email)
        : knownUsers.find((u) => knownStudentNumbers[u.userId]?.toUpperCase() === studentNo?.toUpperCase())
      if (user) {
        if (record.members.some((m) => m.userId === user.userId)) {
          return { ...echo, outcome: 'ALREADY_MEMBER' }
        }
        record.members.push({ ...user, role: 'MEMBER' })
        return { ...echo, outcome: 'ADDED', userId: user.userId }
      }
      const existing = pending.find((i) =>
        email ? i.email === email : i.studentNo?.toUpperCase() === studentNo?.toUpperCase(),
      )
      if (existing) return { ...echo, outcome: 'ALREADY_INVITED', invitationId: existing.id }
      const invitation: Schemas['WorkspaceInvitationResponse'] = {
        id: uuid(nextInvitationId++),
        email,
        studentNo,
        role: 'MEMBER',
        invitedAt: '2026-09-27T10:00:00+09:00',
        invitedBy: { id: regularUser.id, name: regularUser.name },
      }
      pending.push(invitation)
      return { ...echo, outcome: 'INVITED', invitationId: invitation.id }
    })
    return HttpResponse.json({ results }, { status: 200 })
  }),

  http.get('*/api/v1/workspaces/:workspaceId/invitations', ({ params }) => {
    const record = findWorkspace(params.workspaceId!)
    if (!record) return notFound()
    const forbidden = requireOwner(record)
    if (forbidden) return forbidden
    return HttpResponse.json(invitationsOf(record.detail.id), { status: 200 })
  }),

  http.delete('*/api/v1/workspaces/:workspaceId/invitations/:invitationId', ({ params }) => {
    const record = findWorkspace(params.workspaceId!)
    if (!record) return notFound()
    const forbidden = requireOwner(record)
    if (forbidden) return forbidden
    const pending = invitationsOf(record.detail.id)
    const index = pending.findIndex((i) => i.id === String(params.invitationId))
    if (index < 0) {
      return problemResponse({
        type: 'about:blank',
        title: '초대를 찾을 수 없습니다',
        status: 404,
        detail: '대기 중인 초대가 아닙니다.',
        code: 'WORKSPACE_INVITATION_NOT_FOUND',
      })
    }
    pending.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.patch('*/api/v1/workspaces/:workspaceId/members/:userId', async ({ params, request }) => {
    const record = findWorkspace(params.workspaceId!)
    const member = record?.members.find((m) => m.userId === String(params.userId))
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
    const member = record?.members.find((m) => m.userId === String(params.userId))
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
