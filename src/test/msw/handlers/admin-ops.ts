import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'

type Schemas = components['schemas']
type AdminTaskView = Schemas['AdminTaskView']

/* ─── fixtures: 작업(태스크) 큐 (SYS_ADMIN 운영 화면) ─── */

function initialTasks(): AdminTaskView[] {
  return [
    {
      taskId: 77,
      vmId: 58,
      vmName: 'stuck-vm',
      hostname: 'stuck-vm',
      orgId: 1,
      orgName: '정보컴퓨터공학부 실습지원센터',
      jobrunrJobId: '7f9b1a2c-3d4e-5f60-8123-456789abcdef',
      kind: 'PROVISION',
      status: 'NEEDS_ADMIN',
      currentStep: 5,
      totalSteps: 10,
      stepLabel: 'cloud-init 설정 중',
      attempts: 4,
      lastError: 'Proxmox API 응답 시간 초과 (qm set 5058)',
      createdAt: '2026-07-08T12:00:00+09:00',
      updatedAt: '2026-07-08T13:00:00+09:00',
    },
    {
      taskId: 76,
      vmId: 59,
      vmName: 'broken-vm',
      hostname: 'broken-vm',
      orgId: 1,
      orgName: '정보컴퓨터공학부 실습지원센터',
      jobrunrJobId: '11112222-3333-4444-5555-666677778888',
      kind: 'PROVISION',
      status: 'FAILED',
      currentStep: 2,
      totalSteps: 10,
      stepLabel: 'IP 할당 중',
      attempts: 1,
      lastError: 'IP 풀 여유가 없어 생성에 실패했습니다.',
      createdAt: '2026-07-07T12:00:00+09:00',
      updatedAt: '2026-07-07T13:00:00+09:00',
    },
    {
      taskId: 75,
      vmId: 55,
      vmName: 'capstone-team3-api',
      hostname: 'capstone-team3-api',
      orgId: 1,
      orgName: '정보컴퓨터공학부 실습지원센터',
      jobrunrJobId: 'aaaa1111-bbbb-2222-cccc-3333dddd4444',
      kind: 'PROVISION',
      status: 'RUNNING',
      currentStep: 3,
      totalSteps: 10,
      stepLabel: '템플릿 복제 중',
      attempts: 1,
      lastError: null,
      createdAt: '2026-07-08T14:03:05+09:00',
      updatedAt: '2026-07-08T14:03:40+09:00',
    },
    {
      taskId: 74,
      vmId: 61,
      vmName: 'ai-train',
      hostname: 'ai-train',
      orgId: 2,
      orgName: 'SW교육센터',
      jobrunrJobId: '9999aaaa-8888-bbbb-7777-cccc6666dddd',
      kind: 'REINSTALL',
      status: 'DONE',
      currentStep: 10,
      totalSteps: 10,
      stepLabel: '완료',
      attempts: 1,
      lastError: null,
      createdAt: '2026-07-05T09:00:00+09:00',
      updatedAt: '2026-07-05T09:20:00+09:00',
    },
  ]
}

export let adminTaskStore: AdminTaskView[] = initialTasks()

export function resetAdminOpsFixtures() {
  adminTaskStore = initialTasks()
}

const notFound = () =>
  problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '요청한 리소스가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })

export const adminOpsHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/tasks', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const kind = url.searchParams.get('kind')
    const vmId = url.searchParams.get('vmId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = adminTaskStore
      .filter((t) => !status || t.status === status)
      .filter((t) => !kind || t.kind === kind)
      .filter((t) => !vmId || t.vmId === Number(vmId))
      .sort((a, b) => b.taskId - a.taskId)
    const body: Schemas['AdminTaskPage'] = {
      content: filtered.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.post('*/api/v1/admin/tasks/:taskId/retry', ({ params }) => {
    const task = adminTaskStore.find((t) => t.taskId === Number(params.taskId))
    if (!task) return notFound()
    if (task.status !== 'NEEDS_ADMIN') {
      return problemResponse({
        type: 'about:blank',
        title: '재시도할 수 없는 작업입니다',
        status: 409,
        detail: '관리자 개입 대기(NEEDS_ADMIN) 상태의 작업만 재시도할 수 있습니다.',
        instance: `/api/v1/admin/tasks/${task.taskId}/retry`,
        code: 'TASK_NOT_RETRYABLE',
      })
    }
    // 접수 즉시 202 — 비동기 재시도를 흉내내 RETRYING으로 전이해 둔다.
    task.status = 'RETRYING'
    task.updatedAt = new Date().toISOString()
    return HttpResponse.json(
      { message: '작업 재시도를 접수했습니다. 잠시 후 작업 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),
]
