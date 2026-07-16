import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'

type Schemas = components['schemas']
type SettingView = Schemas['SettingView']

function initialSettings(): SettingView[] {
  return [
    {
      key: 'ssh_gateway_enabled',
      value: true,
      valueType: 'BOOLEAN',
      description: 'SSH 게이트웨이 전체 활성화 (킬 스위치)',
      editable: true,
      updatedAt: '2026-07-01T09:00:00+09:00',
    },
    {
      key: 'vm_delete_grace_hours',
      value: 168,
      valueType: 'INTEGER',
      description: '본인 삭제 접수 후 파기까지의 유예 시간(시간)',
      editable: true,
      updatedAt: '2026-07-01T09:00:00+09:00',
    },
    {
      key: 'vcpu_overcommit_warn_ratio',
      value: 1.5,
      valueType: 'NUMBER',
      description: 'vCPU 오버커밋 경고 임계 비율',
      editable: true,
      updatedAt: '2026-06-20T09:00:00+09:00',
    },
    {
      key: 'expiry_notice_days',
      value: [7, 3, 1, 0],
      valueType: 'JSON',
      description: '만료 안내 알림 발송 시점(만료 D-일 목록)',
      editable: true,
      updatedAt: '2026-06-20T09:00:00+09:00',
    },
    {
      key: 'platform_root_domain',
      value: 'pickle.pnuops.com',
      valueType: 'STRING',
      description: '플랫폼 루트 도메인 (배포 구성값 — 조회 전용)',
      editable: false,
      updatedAt: '2026-05-01T09:00:00+09:00',
    },
  ]
}

export let settingStore: SettingView[] = initialSettings()

export function resetSettingFixtures() {
  settingStore = initialSettings()
}

function typeMatches(valueType: SettingView['valueType'], value: unknown): boolean {
  switch (valueType) {
    case 'BOOLEAN':
      return typeof value === 'boolean'
    case 'INTEGER':
      return typeof value === 'number' && Number.isInteger(value)
    case 'NUMBER':
      return typeof value === 'number' && Number.isFinite(value)
    case 'STRING':
      return typeof value === 'string'
    case 'JSON':
      return value !== undefined
  }
}

export const settingHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/settings', () =>
    HttpResponse.json(settingStore, { status: 200 }),
  ),

  http.put('*/api/v1/admin/settings/:key', async ({ params, request }) => {
    const setting = settingStore.find((s) => s.key === params.key)
    // 계약: 알 수 없는 키 또는 수정 불가 키는 404
    if (!setting || !setting.editable) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '해당 설정 키가 존재하지 않거나 수정할 수 없습니다.',
        instance: `/api/v1/admin/settings/${String(params.key)}`,
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    const body = (await request.json()) as { value: unknown }
    if (!typeMatches(setting.valueType, body.value)) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        instance: `/api/v1/admin/settings/${setting.key}`,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'value', message: `${setting.valueType} 타입 값이어야 합니다.` }],
      })
    }
    if (setting.key === 'vm_delete_grace_hours' && (body.value as number) < 24) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        instance: `/api/v1/admin/settings/${setting.key}`,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'value', message: '유예 시간은 최소 24시간이어야 합니다.' }],
      })
    }
    setting.value = body.value
    setting.updatedAt = new Date().toISOString()
    return HttpResponse.json(setting, { status: 200 })
  }),
]
