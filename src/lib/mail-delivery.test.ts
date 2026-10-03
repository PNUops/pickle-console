import { describe, expect, test } from 'vitest'
import { mailAttemptOutcomeLabel, mailDeliveryListParams, mailDeliveryListState, mailDeliveryResourcePath, mailFailureLabel } from './mail-delivery'
import { uuid } from '../test/msw/ids'

describe('Mail delivery list URLs', () => {
  test('describes safe account failure evidence and unfinished attempts without claiming handoff', () => {
    expect(mailFailureLabel('QUEUE_STOPPED')).toBe('메모리 큐 종료로 생략')
    expect(mailFailureLabel('EXPIRED_MESSAGE')).toBe('계정 메일 유효기간이 지나 생략')
    expect(mailFailureLabel('PROCESS_STOPPED')).toBe('서버 처리 중단으로 인계 결과 확인 불가')
    expect(mailFailureLabel('RESULT_PERSISTENCE_FAILED')).toBe('SMTP 처리 결과를 기록하지 못함')
    expect(mailFailureLabel('LEGACY_STATUS_IMPORT')).toBe('기존 누적 상태에서 보존한 기록')
    expect(mailAttemptOutcomeLabel('STARTED')).toBe('시도 시작 · 종료 기록 없음')
    expect(mailAttemptOutcomeLabel('SENT')).toBe('SMTP 인계')
  })
  test('keeps independent global filters and validates enum and page values', () => {
    const params = new URLSearchParams(`org=${uuid(1)}&sourceKind=ACCOUNT&status=UNKNOWN&queueState=ACCOUNT_WAIT&event=account.verify&email=old%40example.test&requestId=${uuid(201)}&announcementId=${uuid(601)}&orgId=${uuid(2)}&page=2&selected=${uuid(901)}&returnTo=ignored`)
    expect(mailDeliveryListState(params)).toMatchObject({ sourceKind: 'ACCOUNT', status: 'UNKNOWN', queueState: 'ACCOUNT_WAIT', event: 'account.verify', email: 'old@example.test', orgId: uuid(2), requestId: uuid(201), announcementId: uuid(601), selected: uuid(901), page: 2 })
    expect(mailDeliveryListParams(params).toString()).toBe(params.toString())
    expect(mailDeliveryListState(new URLSearchParams('status=done&sourceKind=other&queueState=someday&page=-3&selected=broken'))).toMatchObject({ status: undefined, sourceKind: undefined, queueState: undefined, page: 0, selected: undefined, invalidSelected: true })
  })

  test('never translates unsupported, external or unknown legacy links into invented details', () => {
    expect(mailDeliveryResourcePath(`https://example.test/console/vms/${uuid(60)}`)).toBeNull()
    expect(mailDeliveryResourcePath('http://[')).toBeNull()
    expect(mailDeliveryResourcePath(`/console/vms/bad`)).toBeNull()
    expect(mailDeliveryResourcePath(`/console/domains/${uuid(60)}`)).toBeNull()
    expect(mailDeliveryResourcePath(`/admin/settings`)).toBeNull()
    expect(mailDeliveryResourcePath(`/console/vms/${uuid(60)}`, uuid(2))).toBe(`/admin/vms/${uuid(60)}?org=${uuid(2)}`)
    expect(mailDeliveryResourcePath(`/console/llm-keys/${uuid(70)}`, uuid(1))).toBe(`/admin/llm/keys/${uuid(70)}?org=${uuid(1)}`)
    expect(mailDeliveryResourcePath(`/admin/requests/${uuid(201)}`, uuid(1))).toBe(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
    expect(mailDeliveryResourcePath(`/admin/requests/${uuid(201)}?org=${uuid(2)}`)).toBe(`/admin/requests/${uuid(201)}?org=${uuid(2)}`)
    expect(mailDeliveryResourcePath(`/admin/requests/${uuid(201)}?org=broken`)).toBe(`/admin/requests/${uuid(201)}`)
  })
})
