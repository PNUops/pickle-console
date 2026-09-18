import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'

type Schemas = components['schemas']
type Policy = Schemas['VmNetworkPolicyView']
type Update = Schemas['UpdateVmNetworkPolicyRequest']

const SYSTEM_RULES: Policy['systemRules'] = [
  { key: 'SSH_GATEWAY', description: '플랫폼 SSH gateway에서 VM SSH 접속' },
  { key: 'WEB_TERMINAL', description: '웹 터미널 bridge에서 VM SSH 접속' },
]

let policies = new Map<string, Policy>()

function initial(): Policy {
  return {
    revision: 1,
    rules: [{
      direction: 'IN', action: 'ACCEPT', protocol: 'TCP',
      peer: '192.0.2.0/24', portStart: 443, portEnd: 443,
    }],
    systemRules: SYSTEM_RULES,
    applyState: 'APPLIED',
    desiredGeneration: 4,
    appliedGeneration: 4,
    lastError: null,
    updatedAt: '2026-09-18T12:00:00+09:00',
  }
}

function policy(vmId: string): Policy {
  const found = policies.get(vmId)
  if (found) return found
  const created = initial()
  policies.set(vmId, created)
  return created
}

async function update(vmId: string, request: Request): Promise<Response> {
  const body = await request.json() as Update
  const current = policy(vmId)
  if (body.expectedRevision !== current.revision) {
    return problemResponse({
      type: 'about:blank', title: '정책 revision 충돌', status: 409,
      detail: '최신 정책을 다시 불러오세요.', instance: `/api/v1/vms/${vmId}/network-policy`,
      code: 'VM_NETWORK_POLICY_REVISION_CONFLICT',
    })
  }
  const saved: Policy = {
    revision: current.revision + 1,
    rules: body.rules,
    systemRules: current.systemRules,
    applyState: 'PENDING',
    desiredGeneration: (current.desiredGeneration ?? 0) + 1,
    appliedGeneration: current.appliedGeneration,
    lastError: null,
    updatedAt: '2026-09-18T12:01:00+09:00',
  }
  policies.set(vmId, saved)
  return HttpResponse.json(saved, { status: 202 })
}

export const vmNetworkPolicyHandlers: RequestHandler[] = [
  http.get('*/api/v1/vms/:vmId/network-policy', ({ params }) =>
    HttpResponse.json(policy(String(params.vmId)))),
  http.put('*/api/v1/vms/:vmId/network-policy', ({ params, request }) =>
    update(String(params.vmId), request)),
  http.get('*/api/v1/admin/vms/:vmId/network-policy', ({ params }) =>
    HttpResponse.json(policy(String(params.vmId)))),
  http.put('*/api/v1/admin/vms/:vmId/network-policy', ({ params, request }) =>
    update(String(params.vmId), request)),
]

export function resetVmNetworkPolicyFixtures() {
  policies = new Map()
}
