import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'

type Schemas = components['schemas']
type VmDetail = Schemas['VmDetail']

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
      requestId: 102,
      statusDetail: null,
      orgId: 1,
      templateId: 1,
      ipAddress: null,
      sshUsername: 'student',
      startDate: '2026-07-15',
      endDate: '2026-12-20',
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
      requestId: 90,
      statusDetail: null,
      orgId: 1,
      templateId: 1,
      ipAddress: '10.10.0.56',
      sshUsername: 'student',
      startDate: '2026-06-20',
      endDate: '2026-12-20',
      createdAt: '2026-06-20T10:00:00+09:00',
      updatedAt: '2026-06-20T10:05:00+09:00',
    },
  ]
}

export let vmStore: VmDetail[] = initialVms()

/**
 * Mock provisioning: after this many GET /vms/{id} calls for a CREATING VM,
 * subsequent responses report it RUNNING (drives the polling test).
 */
export const VM_RUNNING_AFTER_FETCHES = 2
let detailFetchCounts: Record<number, number> = {}

export function resetVmFixtures() {
  vmStore = initialVms()
  detailFetchCounts = {}
}

function toSummary(vm: VmDetail): Schemas['VmSummary'] {
  const {
    id, name, hostname, status, vcpu, memoryMb, diskGb, groupId, requestId,
    statusDetail, createdAt,
  } = vm
  return {
    id, name, hostname, status, vcpu, memoryMb, diskGb, groupId, requestId,
    statusDetail, createdAt,
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
      content: filtered.slice(page * size, (page + 1) * size).map(toSummary),
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
        vm.updatedAt = '2026-07-08T14:10:00+09:00'
      }
    }
    return HttpResponse.json(vm, { status: 200 })
  }),
]
