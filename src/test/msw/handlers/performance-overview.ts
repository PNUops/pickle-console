import { http, HttpResponse, type RequestHandler } from 'msw'
import type { AdminPerformanceOverview } from '../../../api/queries'
import { mockAuthorityActor } from '../institution-authority'
import { ACCESS_TOKENS, problemResponse } from './auth'

export function performanceOverviewFixture(): AdminPerformanceOverview {
  return {
    hardware: {
      physicalHosts: 2, cpuCores: 24, cpuThreads: 48, memoryMiB: 98_304,
      gpuDevices: 2, dedicatedGpuMemoryMiB: 16_384,
      assets: [
        { displayModel: 'Example Compute Server', cpuModel: 'Example CPU 16-core', cpuCores: 16, cpuThreads: 32, memoryMiB: 65_536,
          gpus: [{ model: 'Example Dedicated GPU', count: 1, dedicatedMemoryMiB: 16_384, unifiedMemoryMiB: null, sharedMemory: false }] },
        { displayModel: 'Example Inference Server', cpuModel: 'Example CPU 8-core', cpuCores: 8, cpuThreads: 16, memoryMiB: 32_768,
          gpus: [{ model: 'Example Unified Accelerator', count: 1, dedicatedMemoryMiB: null, unifiedMemoryMiB: 32_768, sharedMemory: true }] },
      ],
    },
    business: {
      registeredAccounts: 80, currentWorkspaces: 21,
      workspacesByKind: { PERSONAL: 12, PROJECT: 6, COURSE: 2, PROGRAM: 1 },
      approvedRequests: 31, approvedRequestsByKind: { VM: 18, LLM_API_KEY: 10, DOMAIN: 3 },
      vmRegistrations: 29, registeredDomains: 3,
    },
  }
}

export const performanceOverviewHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/performance/overview', ({ request }) => {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const profile = ACCESS_TOKENS[token]
    const actor = profile ? mockAuthorityActor(profile) : null
    if (!actor || !['SYS_ADMIN', 'SYS_MANAGER'].includes(actor.role)) return problemResponse({ status: 403, title: '조회 권한이 없어요.', code: 'ACCESS_DENIED' })
    const result = performanceOverviewFixture()
    if (actor.role !== 'SYS_ADMIN') result.business = null
    return HttpResponse.json(result)
  }),
]
