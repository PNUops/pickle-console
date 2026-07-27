import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'

type Schemas = components['schemas']
type SshKeyView = Schemas['SshKeyView']

function initialKeys(): SshKeyView[] {
  return [
    {
      id: 3,
      name: '연구실 노트북',
      algorithm: 'ED25519',
      publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB0Qf0000000000000000000000000000000000000',
      fingerprint: 'SHA256:mVqyNQZoT0PC4z1uQXLzS9YFvZ1qGmO1sN8cQXAUXeQ',
      privateKeyStored: false,
      createdAt: '2026-07-18T10:00:00+09:00',
      lastUsedAt: '2026-07-18T21:14:00+09:00',
    },
    {
      id: 4,
      name: 'Pickle에서 만든 키',
      algorithm: 'ED25519',
      publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFo2111111111111111111111111111111111111111',
      fingerprint: 'SHA256:8dq1kQwXbFhVYcQ1sJ2m0aH7pT5uNzR3eK6yLgAvBcD',
      privateKeyStored: true,
      createdAt: '2026-07-18T10:05:00+09:00',
      lastUsedAt: null,
    },
  ]
}

export let sshKeyStore: SshKeyView[] = initialKeys()
let nextKeyId = 10

export function resetSshKeyFixtures() {
  sshKeyStore = initialKeys()
  nextKeyId = 10
}

const SSH_KEY_LIMIT = 10

/** 붙여넣기 등록에서 지문 중복으로 409를 유발하는 트리거 공개키. */
export const DUPLICATE_PUBLIC_KEY =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDUPLICATE00000000000000000000000000000000000 dup'

export const sshKeyHandlers: RequestHandler[] = [
  http.get('*/api/v1/me/ssh-keys', () => HttpResponse.json(sshKeyStore, { status: 200 })),

  http.post('*/api/v1/me/ssh-keys', async ({ request }) => {
    const body = (await request.json()) as Schemas['SshKeyCreateRequest']
    const name = body.name?.trim() ?? ''
    if (name.length < 1 || name.length > 100) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 필드를 확인해 주세요.',
        instance: '/api/v1/me/ssh-keys',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'name', message: '이름은 1~100자여야 합니다.' }],
      })
    }
    // ed25519/rsa 외(예: ecdsa)·파싱 불가는 422.
    if (!/^ssh-(ed25519|rsa) /.test(body.publicKey ?? '')) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 필드를 확인해 주세요.',
        instance: '/api/v1/me/ssh-keys',
        code: 'VALIDATION_FAILED',
        errors: [
          {
            field: 'publicKey',
            message: '지원하지 않는 키 형식입니다. ed25519 키를 권장합니다 (ssh-keygen -t ed25519).',
          },
        ],
      })
    }
    if (body.publicKey === DUPLICATE_PUBLIC_KEY) {
      return problemResponse({
        type: 'about:blank',
        title: '이미 등록된 키입니다',
        status: 409,
        detail: '이미 등록된 키입니다. 다른 키를 사용해 주세요.',
        instance: '/api/v1/me/ssh-keys',
        code: 'SSH_KEY_DUPLICATE',
      })
    }
    if (sshKeyStore.length >= SSH_KEY_LIMIT) {
      return problemResponse({
        type: 'about:blank',
        title: '키를 더 등록할 수 없습니다',
        status: 409,
        detail: 'SSH 키는 사용자당 최대 10개까지 등록할 수 있습니다. 사용하지 않는 키를 삭제해 주세요.',
        instance: '/api/v1/me/ssh-keys',
        code: 'SSH_KEY_LIMIT_EXCEEDED',
      })
    }
    const algorithm: SshKeyView['algorithm'] = body.publicKey.startsWith('ssh-rsa')
      ? 'RSA'
      : 'ED25519'
    const key: SshKeyView = {
      id: nextKeyId++,
      name,
      algorithm,
      // comment 제거 정규화를 흉내낸다 (앞 두 토큰만 유지).
      publicKey: body.publicKey.split(' ').slice(0, 2).join(' '),
      fingerprint: `SHA256:reg${nextKeyId}AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abc`,
      privateKeyStored: false,
      createdAt: '2026-07-19T09:00:00+09:00',
      lastUsedAt: null,
    }
    sshKeyStore = [...sshKeyStore, key]
    return HttpResponse.json(key, { status: 201 })
  }),

  http.post('*/api/v1/me/ssh-keys/generate', async ({ request }) => {
    const body = (await request.json()) as Schemas['SshKeyGenerateRequest']
    const name = body.name?.trim() ?? ''
    if (name.length < 1 || name.length > 100) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 필드를 확인해 주세요.',
        instance: '/api/v1/me/ssh-keys/generate',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'name', message: '이름은 1~100자여야 합니다.' }],
      })
    }
    if (sshKeyStore.length >= SSH_KEY_LIMIT) {
      return problemResponse({
        type: 'about:blank',
        title: '키를 더 등록할 수 없습니다',
        status: 409,
        detail: 'SSH 키는 사용자당 최대 10개까지 등록할 수 있습니다. 사용하지 않는 키를 삭제해 주세요.',
        instance: '/api/v1/me/ssh-keys/generate',
        code: 'SSH_KEY_LIMIT_EXCEEDED',
      })
    }
    const id = nextKeyId++
    const key: SshKeyView = {
      id,
      name,
      algorithm: 'ED25519',
      publicKey: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGEN${id}00000000000000000000000000000000000`,
      fingerprint: `SHA256:gen${id}ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210zZ`,
      privateKeyStored: true,
      createdAt: '2026-07-19T09:10:00+09:00',
      lastUsedAt: null,
    }
    sshKeyStore = [...sshKeyStore, key]
    return HttpResponse.json(key, { status: 201 })
  }),

  http.get('*/api/v1/me/ssh-keys/:keyId/private-key', ({ params }) => {
    const key = sshKeyStore.find((k) => k.id === Number(params.keyId))
    // 존재하지 않거나 붙여넣기 등록(개인키 미보관)이면 404.
    if (!key || !key.privateKeyStored) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '다운로드할 개인키가 없습니다. 직접 등록한 키의 개인키는 서버에 보관되지 않습니다.',
        instance: `/api/v1/me/ssh-keys/${params.keyId}/private-key`,
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    const body: Schemas['SshKeyPrivateKeyResponse'] = {
      // 실제 PEM 대신 목 자리표시자 (테스트는 다운로드 트리거·파일명만 검증).
      privateKey: 'MOCK-OPENSSH-PRIVATE-KEY-mVqyNQ-do-not-use\n',
      fileName: 'id_ed25519_pickle',
    }
    return HttpResponse.json(body, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }),

  http.delete('*/api/v1/me/ssh-keys/:keyId', ({ params }) => {
    const key = sshKeyStore.find((k) => k.id === Number(params.keyId))
    if (!key) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '요청한 리소스가 존재하지 않습니다.',
        instance: `/api/v1/me/ssh-keys/${params.keyId}`,
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    sshKeyStore = sshKeyStore.filter((k) => k.id !== key.id)
    return new HttpResponse(null, { status: 204 })
  }),
]
