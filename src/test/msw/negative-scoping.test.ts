import { beforeEach, describe, expect, test } from 'vitest'
import {
  createAnnouncement,
  fetchAdminWorkspaces,
  fetchAdminSummary,
  fetchAdminUser,
  fetchAuditLogs,
} from '../../api/queries'
import { setAccessToken } from '../../api/token'
import { uuid } from './ids'

/**
 * 계약 스코핑 (v0.46.0) — 기관 계층의 조회는 전 기관에 닿고 orgId는 보통 필터가
 * 되었다. 감사 로그만 예외로 관리 기관 안에 머물고, 쓰기는 여전히 관리 기관
 * 밖에서 거부된다 (mock이 실제 API 정책을 재현).
 */
describe('MSW 스코핑 (ORG_ADMIN, 타 기관 orgId)', () => {
  beforeEach(() => {
    setAccessToken('access-org-admin')
  })

  test('감사 로그: 다른 기관 orgId 필터는 404로 마스킹된다', async () => {
    await expect(fetchAuditLogs({ orgId: uuid(2) })).rejects.toMatchObject({
      problem: { status: 404, code: 'RESOURCE_NOT_FOUND' },
    })
  })

  test('대시보드 요약: 다른 기관 orgId 드릴인도 조회된다 (보통 필터)', async () => {
    await expect(fetchAdminSummary({ orgId: uuid(2) })).resolves.toBeTruthy()
  })

  test('워크스페이스 선택지: 다른 기관 orgId 필터도 조회된다 (보통 필터)', async () => {
    await expect(fetchAdminWorkspaces({ orgId: uuid(2) })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'AI 동아리' })]),
    )
  })

  test('사용자 상세: 타 기관 파생 소속 사용자도 조회된다', async () => {
    // id 99(정외부)는 org2 파생 소속. 전역 조회로 org1 관리자에게도 보인다.
    await expect(fetchAdminUser(uuid(99))).resolves.toMatchObject({ id: uuid(99) })
  })

  test('공지 발송: 관리하지 않는 기관 orgId를 지정하면 422', async () => {
    await expect(
      createAnnouncement({ title: '테스트', body: '본문', scope: 'ORG', orgId: uuid(2) }),
    ).rejects.toMatchObject({
      problem: {
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'orgId', message: '자기 기관에만 기관 공지를 발송할 수 있습니다.' }],
      },
    })
  })
})

/**
 * 운영자 계층 — ORG_MANAGER의 조회도 전 기관에 닿는다. 감사 로그만 관리 기관
 * 밖 지정 시 404로 마스킹된다.
 */
describe('MSW 스코핑 (ORG_MANAGER, 타 기관 orgId)', () => {
  beforeEach(() => {
    setAccessToken('access-org-manager')
  })

  test('감사 로그: 다른 기관 orgId 필터는 404로 마스킹된다', async () => {
    await expect(fetchAuditLogs({ orgId: uuid(2) })).rejects.toMatchObject({
      problem: { status: 404, code: 'RESOURCE_NOT_FOUND' },
    })
  })

  test('대시보드 요약: 다른 기관 orgId 드릴인도 조회된다 (보통 필터)', async () => {
    await expect(fetchAdminSummary({ orgId: uuid(2) })).resolves.toBeTruthy()
  })

  test('워크스페이스 선택지: 다른 기관 orgId 필터도 조회된다 (보통 필터)', async () => {
    await expect(fetchAdminWorkspaces({ orgId: uuid(2) })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'AI 동아리' })]),
    )
  })

  test('사용자 상세: 타 기관 파생 소속 사용자도 조회된다', async () => {
    await expect(fetchAdminUser(uuid(99))).resolves.toMatchObject({ id: uuid(99) })
  })
})
