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
 * 계약 스코핑 (v0.46.0) — 기관 계층의 조회는 역할을 보유한 기관 안이고, 보유하지
 * 않은 기관을 orgId로 지정하면 404(존재 비공개)다. 사용자 조회만 전 기관이다:
 * 파생 소속은 리소스에서 나오므로, 아무것도 신청하지 않은 계정은 범위를 좁히면
 * 누구에게도 보이지 않는다. 감사 로그는 더 좁아 행위 가능한 기관만 답한다
 * (mock이 실제 API 정책을 재현).
 */
describe('MSW 네거티브 스코핑 (ORG_ADMIN, 타 기관 orgId)', () => {
  beforeEach(() => {
    setAccessToken('access-org-admin')
  })

  test('감사 로그: 다른 기관 orgId 필터는 404로 마스킹된다', async () => {
    await expect(fetchAuditLogs({ orgId: uuid(2) })).rejects.toMatchObject({
      problem: { status: 404, code: 'RESOURCE_NOT_FOUND' },
    })
  })

  test('대시보드 요약: 다른 기관 orgId 드릴인은 404로 마스킹된다', async () => {
    await expect(fetchAdminSummary({ orgId: uuid(2) })).rejects.toMatchObject({
      problem: { status: 404, code: 'RESOURCE_NOT_FOUND' },
    })
  })

  test('워크스페이스 선택지: 다른 기관 orgId 필터는 404로 마스킹된다', async () => {
    await expect(fetchAdminWorkspaces({ orgId: uuid(2) })).rejects.toMatchObject({
      problem: { status: 404, code: 'RESOURCE_NOT_FOUND' },
    })
  })

  test('워크스페이스 선택지: 지정 없는 조회는 보유 기관 것만 담는다', async () => {
    const options = await fetchAdminWorkspaces({})
    expect(options).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '캡스톤 3조' })]),
    )
    expect(options).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'AI 동아리' })]),
    )
  })

  test('사용자 상세: 타 기관 파생 소속 사용자도 조회된다 (전역 예외)', async () => {
    // id 99(정외부)는 org2 파생 소속. 사용자 조회만 전 기관이라 org1 관리자에게도 보인다.
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
 * 운영자 계층 — ORG_MANAGER의 조회 범위도 같다: 보유 기관 안, 밖은 404,
 * 사용자 조회만 전역.
 */
describe('MSW 네거티브 스코핑 (ORG_MANAGER, 타 기관 orgId)', () => {
  beforeEach(() => {
    setAccessToken('access-org-manager')
  })

  test('감사 로그: 다른 기관 orgId 필터는 404로 마스킹된다', async () => {
    await expect(fetchAuditLogs({ orgId: uuid(2) })).rejects.toMatchObject({
      problem: { status: 404, code: 'RESOURCE_NOT_FOUND' },
    })
  })

  test('대시보드 요약: 다른 기관 orgId 드릴인은 404로 마스킹된다', async () => {
    await expect(fetchAdminSummary({ orgId: uuid(2) })).rejects.toMatchObject({
      problem: { status: 404, code: 'RESOURCE_NOT_FOUND' },
    })
  })

  test('워크스페이스 선택지: 다른 기관 orgId 필터는 404로 마스킹된다', async () => {
    await expect(fetchAdminWorkspaces({ orgId: uuid(2) })).rejects.toMatchObject({
      problem: { status: 404, code: 'RESOURCE_NOT_FOUND' },
    })
  })

  test('사용자 상세: 타 기관 파생 소속 사용자도 조회된다 (전역 예외)', async () => {
    await expect(fetchAdminUser(uuid(99))).resolves.toMatchObject({ id: uuid(99) })
  })
})
