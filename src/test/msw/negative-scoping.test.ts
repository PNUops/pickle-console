import { beforeEach, describe, expect, test } from 'vitest'
import {
  createAnnouncement,
  fetchAdminGroups,
  fetchAdminSummary,
  fetchAuditLogs,
} from '../../api/queries'
import { setAccessToken } from '../../api/token'

/**
 * 계약 네거티브 스코핑 — ORG_ADMIN이 다른 기관(orgId=2)을 지정하면
 * 404(존재 비공개) 또는 422로 거부되어야 한다 (mock이 실제 API 정책을 재현).
 */
describe('MSW 네거티브 스코핑 (ORG_ADMIN, 타 기관 orgId)', () => {
  beforeEach(() => {
    setAccessToken('access-org-admin')
  })

  test('감사 로그: 다른 기관 orgId 필터는 404로 마스킹된다', async () => {
    await expect(fetchAuditLogs({ orgId: 2 })).rejects.toMatchObject({
      problem: { status: 404, code: 'RESOURCE_NOT_FOUND' },
    })
  })

  test('대시보드 요약: 다른 기관 orgId 드릴인은 404로 마스킹된다', async () => {
    await expect(fetchAdminSummary({ orgId: 2 })).rejects.toMatchObject({
      problem: { status: 404, code: 'RESOURCE_NOT_FOUND' },
    })
  })

  test('그룹 선택지: 다른 기관 orgId 필터는 404로 마스킹된다', async () => {
    await expect(fetchAdminGroups({ orgId: 2 })).rejects.toMatchObject({
      problem: { status: 404, code: 'RESOURCE_NOT_FOUND' },
    })
  })

  test('공지 발송: ORG 범위에서 다른 기관 orgId를 지정하면 422', async () => {
    await expect(
      createAnnouncement({ title: '테스트', body: '본문', scope: 'ORG', orgId: 2 }),
    ).rejects.toMatchObject({
      problem: {
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'orgId', message: '자기 기관으로만 발송할 수 있습니다.' }],
      },
    })
  })
})
