import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'

type Schemas = components['schemas']
type VmDetail = Schemas['VmDetail']
type VmEvent = Schemas['VmEvent']

function initialVms(): VmDetail[] {
  return [
    {
      id: 55,
      name: 'capstone-team3-api',
      hostname: 'capstone-team3-api',
      status: 'CREATING',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      groupId: 12,
      groupName: '캡스톤 3조',
      requestId: 102,
      statusDetail: null,
      orgId: 1,
      templateId: 1,
      ipAddress: null,
      sshUsername: 'student',
      startDate: '2026-07-15',
      endDate: '2026-12-20',
      initialPasswordAvailable: false,
      provisioning: {
        kind: 'PROVISION',
        status: 'RUNNING',
        currentStep: 3,
        totalSteps: 10,
        stepLabel: '템플릿 복제 중',
        attempts: 1,
        lastError: null,
        updatedAt: '2026-07-08T14:03:40+09:00',
      },
      deletion: null,
      createdAt: '2026-07-08T14:03:05+09:00',
      updatedAt: '2026-07-08T14:03:05+09:00',
    },
    {
      id: 56,
      name: 'algo-judge',
      hostname: 'algo-judge',
      status: 'RUNNING',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      groupId: 15,
      groupName: '알고리즘 스터디',
      requestId: 90,
      statusDetail: null,
      orgId: 1,
      templateId: 1,
      ipAddress: '10.10.0.56',
      sshUsername: 'student',
      startDate: '2026-06-20',
      endDate: '2026-12-20',
      initialPasswordAvailable: true,
      provisioning: null,
      deletion: null,
      createdAt: '2026-06-20T10:00:00+09:00',
      updatedAt: '2026-06-20T10:05:00+09:00',
    },
    {
      id: 57,
      name: 'web-lab',
      hostname: 'web-lab',
      status: 'STOPPED',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      groupId: 15,
      groupName: '알고리즘 스터디',
      requestId: 91,
      statusDetail: null,
      orgId: 1,
      templateId: 1,
      ipAddress: '10.10.0.57',
      sshUsername: 'student',
      startDate: '2026-06-20',
      endDate: '2026-12-20',
      initialPasswordAvailable: false,
      provisioning: null,
      deletion: null,
      createdAt: '2026-06-21T10:00:00+09:00',
      updatedAt: '2026-07-01T09:00:00+09:00',
    },
    {
      id: 58,
      name: 'stuck-vm',
      hostname: 'stuck-vm',
      status: 'NEEDS_ADMIN',
      vcpu: 2,
      memoryMb: 2048,
      diskGb: 20,
      groupId: 12,
      groupName: '캡스톤 3조',
      requestId: 103,
      statusDetail: '프로비저닝 재시도가 소진되어 관리자 확인이 필요합니다.',
      orgId: 1,
      templateId: 1,
      ipAddress: null,
      sshUsername: 'student',
      startDate: null,
      endDate: null,
      initialPasswordAvailable: false,
      provisioning: {
        kind: 'PROVISION',
        status: 'NEEDS_ADMIN',
        currentStep: 5,
        totalSteps: 10,
        stepLabel: 'cloud-init 설정 중',
        attempts: 3,
        lastError: 'Proxmox API 응답 시간 초과 (qm set 5058)',
        updatedAt: '2026-07-08T13:00:00+09:00',
      },
      deletion: null,
      createdAt: '2026-07-08T12:00:00+09:00',
      updatedAt: '2026-07-08T13:00:00+09:00',
    },
    {
      id: 59,
      name: 'broken-vm',
      hostname: 'broken-vm',
      status: 'ERROR',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      groupId: 12,
      groupName: '캡스톤 3조',
      requestId: 104,
      statusDetail: '생성이 실패해 부분 자원이 정리되었습니다.',
      orgId: 1,
      templateId: 1,
      ipAddress: null,
      sshUsername: 'student',
      startDate: null,
      endDate: null,
      initialPasswordAvailable: false,
      provisioning: null,
      deletion: null,
      createdAt: '2026-07-07T12:00:00+09:00',
      updatedAt: '2026-07-07T13:00:00+09:00',
    },
    {
      id: 60,
      name: 'retiring-vm',
      hostname: 'retiring-vm',
      status: 'DELETING',
      vcpu: 1,
      memoryMb: 1024,
      diskGb: 10,
      groupId: 15,
      groupName: '알고리즘 스터디',
      requestId: 92,
      statusDetail: null,
      orgId: 1,
      templateId: 1,
      ipAddress: '10.10.0.60',
      sshUsername: 'student',
      startDate: '2026-05-01',
      endDate: '2026-07-01',
      initialPasswordAvailable: false,
      provisioning: null,
      deletion: {
        kind: 'SELF',
        scheduledFor: '2026-07-15T14:10:00+09:00',
        requestedAt: '2026-07-08T14:10:00+09:00',
        requestedById: 42,
        reason: null,
        cancelable: true,
      },
      createdAt: '2026-05-01T10:00:00+09:00',
      updatedAt: '2026-07-08T14:10:00+09:00',
    },
    {
      id: 61,
      name: 'ai-train',
      hostname: 'ai-train',
      status: 'RUNNING',
      vcpu: 4,
      memoryMb: 4096,
      diskGb: 40,
      groupId: 21,
      groupName: 'AI 동아리',
      requestId: 105,
      statusDetail: null,
      orgId: 2,
      templateId: 2,
      ipAddress: '10.10.0.61',
      sshUsername: 'student',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      initialPasswordAvailable: false,
      provisioning: null,
      deletion: null,
      createdAt: '2026-07-01T10:00:00+09:00',
      updatedAt: '2026-07-01T10:05:00+09:00',
    },
  ]
}

function initialVmEvents(): Record<number, VmEvent[]> {
  return {
    56: [
      {
        id: 902,
        type: 'START',
        actorId: 42,
        detail: null,
        createdAt: '2026-07-01T09:12:00+09:00',
      },
      {
        id: 901,
        type: 'CREATE',
        actorId: null,
        detail: '승인 신청 90에 따라 자동 생성',
        createdAt: '2026-06-20T10:00:00+09:00',
      },
    ],
  }
}

export let vmStore: VmDetail[] = initialVms()
export let vmEventStore: Record<number, VmEvent[]> = initialVmEvents()
let nextEventId = 950

/**
 * Mock provisioning: after this many GET /vms/{id} calls for a CREATING VM,
 * subsequent responses report it RUNNING (drives the polling test).
 */
export const VM_RUNNING_AFTER_FETCHES = 2
let detailFetchCounts: Record<number, number> = {}

export function resetVmFixtures() {
  vmStore = initialVms()
  vmEventStore = initialVmEvents()
  nextEventId = 950
  detailFetchCounts = {}
}

/** Prepend a lifecycle event for assertions on event history refreshes. */
export function recordVmEvent(vmId: number, event: Omit<VmEvent, 'id'>) {
  const list = (vmEventStore[vmId] ??= [])
  list.unshift({ id: nextEventId++, ...event })
}

export const invalidVmStateProblem = (instance: string, detail: string) =>
  problemResponse({
    type: 'about:blank',
    title: '현재 상태에서는 수행할 수 없는 작업입니다',
    status: 409,
    detail,
    instance,
    code: 'VM_INVALID_STATE',
  })

export function toVmSummary(vm: VmDetail): Schemas['VmSummary'] {
  const {
    id, name, hostname, status, vcpu, memoryMb, diskGb, groupId, groupName,
    requestId, statusDetail, createdAt,
  } = vm
  return {
    id, name, hostname, status, vcpu, memoryMb, diskGb, groupId, groupName,
    requestId, statusDetail, createdAt,
  }
}

export const vmHandlers: RequestHandler[] = [
  http.get('*/api/v1/vms', ({ request }) => {
    const url = new URL(request.url)
    const groupId = url.searchParams.get('groupId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = vmStore
      .filter((vm) => !groupId || vm.groupId === Number(groupId))
      .sort((a, b) => b.id - a.id)
    const body: Schemas['VmPage'] = {
      content: filtered.slice(page * size, (page + 1) * size).map(toVmSummary),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.get('*/api/v1/vms/:vmId', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '요청한 리소스가 존재하지 않습니다.',
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    if (vm.status === 'CREATING') {
      const count = (detailFetchCounts[vm.id] = (detailFetchCounts[vm.id] ?? 0) + 1)
      if (count >= VM_RUNNING_AFTER_FETCHES) {
        vm.status = 'RUNNING'
        vm.ipAddress = '10.10.0.55'
        vm.initialPasswordAvailable = true
        vm.provisioning = null
        vm.updatedAt = '2026-07-08T14:10:00+09:00'
      }
    }
    return HttpResponse.json(vm, { status: 200 })
  }),

  http.delete('*/api/v1/vms/:vmId', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (
      vm.deletion != null ||
      ['CREATING', 'NEEDS_ADMIN', 'DELETING', 'DELETED'].includes(vm.status)
    ) {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}`,
        '이미 삭제가 예약되었거나 진행 중이거나, 삭제할 수 없는 상태의 VM입니다.',
      )
    }
    // ERROR 상태는 파기할 실체가 없으므로 유예 없이 즉시 DELETED로 전이 (계약 예외).
    const immediate = vm.status === 'ERROR'
    const deletion: NonNullable<VmDetail['deletion']> = {
      kind: 'SELF',
      scheduledFor: immediate ? '2026-07-08T15:00:00+09:00' : '2026-07-15T15:00:00+09:00',
      requestedAt: '2026-07-08T15:00:00+09:00',
      requestedById: 42,
      reason: null,
      cancelable: !immediate,
    }
    vm.status = immediate ? 'DELETED' : 'DELETING'
    vm.deletion = deletion
    recordVmEvent(vm.id, {
      type: 'DELETE',
      actorId: 42,
      detail: immediate ? '생성 실패 VM 즉시 삭제' : null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(deletion, { status: 202 })
  }),

  /* ─── power ops (M3): 계약의 409 상태 조건을 그대로 강제한다 ─── */

  http.post('*/api/v1/vms/:vmId/start', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (vm.status !== 'STOPPED') {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/start`,
        `STOPPED 상태의 VM만 시작할 수 있습니다. (현재 상태 ${vm.status})`,
      )
    }
    vm.status = 'RUNNING'
    recordVmEvent(vm.id, {
      type: 'START',
      actorId: 42,
      detail: null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(
      { message: 'VM 시작 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/vms/:vmId/shutdown', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (vm.status !== 'RUNNING') {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/shutdown`,
        `RUNNING 상태의 VM만 종료할 수 있습니다. (현재 상태 ${vm.status})`,
      )
    }
    vm.status = 'STOPPED'
    recordVmEvent(vm.id, {
      type: 'STOP',
      actorId: 42,
      detail: null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(
      { message: 'VM 종료 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/vms/:vmId/reboot', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (vm.status !== 'RUNNING') {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/reboot`,
        `RUNNING 상태의 VM만 재부팅할 수 있습니다. (현재 상태 ${vm.status})`,
      )
    }
    vm.status = 'REBOOTING'
    recordVmEvent(vm.id, {
      type: 'REBOOT',
      actorId: 42,
      detail: null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(
      { message: 'VM 재부팅 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/vms/:vmId/force-stop', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (vm.status !== 'RUNNING' && vm.status !== 'REBOOTING') {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/force-stop`,
        `RUNNING 또는 REBOOTING 상태의 VM만 강제 종료할 수 있습니다. (현재 상태 ${vm.status})`,
      )
    }
    vm.status = 'STOPPED'
    recordVmEvent(vm.id, {
      type: 'FORCE_STOP',
      actorId: 42,
      detail: null,
      createdAt: '2026-07-08T15:00:00+09:00',
    })
    return HttpResponse.json(
      { message: 'VM 강제 종료 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/vms/:vmId/initial-password', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    if (!['RUNNING', 'STOPPED', 'REBOOTING'].includes(vm.status)) {
      return invalidVmStateProblem(
        `/api/v1/vms/${vm.id}/initial-password`,
        'VM 생성이 완료된 뒤에 초기 비밀번호를 열람할 수 있습니다.',
      )
    }
    if (!vm.initialPasswordAvailable) {
      return problemResponse({
        type: 'about:blank',
        title: '초기 비밀번호를 열람할 수 없습니다',
        status: 410,
        detail:
          '초기 비밀번호가 이미 열람되었거나 존재하지 않습니다. 비밀번호가 필요하면 비밀번호 재설정을 이용해 주세요.',
        instance: `/api/v1/vms/${vm.id}/initial-password`,
        code: 'VM_PASSWORD_ALREADY_VIEWED',
      })
    }
    vm.initialPasswordAvailable = false
    const body: Schemas['InitialPasswordResponse'] = {
      password: 'x7GmQ4vRk2LpWn9sCtYb8Zed',
      sshUsername: 'student',
      sshHost: 'ssh.pickle.pnuops.com',
      sshPort: 22,
    }
    return HttpResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  }),

  http.get('*/api/v1/vms/:vmId/events', ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFoundProblem()
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const events = vmEventStore[vm.id] ?? []
    const body: Schemas['VmEventPage'] = {
      content: events.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: events.length,
      totalPages: Math.max(1, Math.ceil(events.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),
]

function notFoundProblem() {
  return problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '요청한 리소스가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })
}
