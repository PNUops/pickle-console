import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'
import { uuid } from '../ids'

type Schemas = components['schemas']
type VmSshKeyView = Schemas['VmSshKeyView']

/** 개인키 자리표시자 — 시크릿 스캐너가 진짜 키로 읽지 않도록 형태만 흉내낸다. */
const PRIVATE_KEY_PLACEHOLDER = '<OpenSSH PEM 자리표시자 — 테스트 픽스처>'

const FINGERPRINTS = [
  'SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU',
  'SHA256:hZ9Kk3nQ2wErTyUiOpAsDfGhJkLzXcVbNmQwErTyUiO',
]

/** vmId → 발급된 키 (없으면 미발급). */
let store = new Map<string, VmSshKeyView>()
let rotation = 0

function fileNameFor(vmId: string): string {
  // 호스트명 픽스처와 맞춘다 — 목록/상세 픽스처의 대표 VM이 algo-judge다.
  return vmId === uuid(56) ? 'pickle-algo-judge.pem' : `pickle-vm-${vmId.slice(0, 8)}.pem`
}

function issue(vmId: string): VmSshKeyView {
  const view: VmSshKeyView = {
    id: uuid(900 + rotation),
    fingerprint: FINGERPRINTS[rotation % FINGERPRINTS.length],
    fileName: fileNameFor(vmId),
    createdAt: '2026-08-18T01:00:00Z',
    lastUsedAt: null,
  }
  rotation += 1
  store.set(vmId, view)
  return view
}

export function resetVmSshKeyFixtures(): void {
  store = new Map()
  rotation = 0
}

/** 테스트가 "이미 발급된" 상태에서 시작하고 싶을 때. */
export function seedVmSshKey(vmId: string): VmSshKeyView {
  return issue(vmId)
}

function notIssued(vmId: string) {
  return problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '이 VM에 발급된 SSH 키가 없습니다. 먼저 키를 발급해 주세요.',
    instance: `/api/v1/vms/${vmId}/ssh-key`,
    code: 'RESOURCE_NOT_FOUND',
  })
}

function issued(view: VmSshKeyView) {
  return HttpResponse.json(
    { privateKey: PRIVATE_KEY_PLACEHOLDER, fileName: view.fileName, key: view },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}

export const vmSshKeyHandlers: RequestHandler[] = [
  http.get('*/api/v1/vms/:vmId/ssh-key', ({ params }) =>
    HttpResponse.json({ key: store.get(String(params.vmId)) ?? null }, { status: 200 }),
  ),

  http.post('*/api/v1/vms/:vmId/ssh-key', ({ params }) => {
    const vmId = String(params.vmId)
    if (store.has(vmId)) {
      return problemResponse({
        type: 'about:blank',
        title: '이미 발급된 키가 있습니다',
        status: 409,
        detail: '이 VM의 SSH 키는 이미 발급되어 있습니다. 개인키를 다시 내려받거나, 키를 재발급해 주세요.',
        instance: `/api/v1/vms/${vmId}/ssh-key`,
        code: 'SSH_KEY_ALREADY_ISSUED',
      })
    }
    const view = issue(vmId)
    return HttpResponse.json(
      { privateKey: PRIVATE_KEY_PLACEHOLDER, fileName: view.fileName, key: view },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  }),

  http.post('*/api/v1/vms/:vmId/ssh-key/reissue', ({ params }) => {
    const vmId = String(params.vmId)
    if (!store.has(vmId)) return notIssued(vmId)
    return issued(issue(vmId))
  }),

  http.get('*/api/v1/vms/:vmId/ssh-key/private-key', ({ params }) => {
    const vmId = String(params.vmId)
    const view = store.get(vmId)
    return view ? issued(view) : notIssued(vmId)
  }),

  http.delete('*/api/v1/vms/:vmId/ssh-key', ({ params }) => {
    const vmId = String(params.vmId)
    if (!store.has(vmId)) return notIssued(vmId)
    store.delete(vmId)
    return new HttpResponse(null, { status: 204 })
  }),
]
