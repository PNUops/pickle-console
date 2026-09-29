import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  orgManagerUser,
  problemResponse,
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
} from '../test/msw/handlers/auth'
import {
  bulkApplyBodies,
  bulkPreviewBodies,
  setBulkGrant,
} from '../test/msw/handlers/bulk-changes'
import { adminLlmKeyStore } from '../test/msw/handlers/llm-keys'
import { externalDomains } from '../test/msw/handlers/publishing'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

type User = ReturnType<typeof userEvent.setup>

async function openBulk(
  user: User,
  token: string,
  profile: typeof sysAdminUser,
  names: string[],
  list: keyof typeof LISTS = 'llm-keys',
) {
  server.use(refreshSuccessHandler(token, profile))
  renderApp(LISTS[list].path)
  for (const name of names) {
    await user.click(await screen.findByRole('checkbox', { name: `${name} 선택` }))
  }
  await user.click(screen.getByRole('button', { name: '일괄 변경' }))
  await screen.findByRole('heading', { name: LISTS[list].heading })
}

const LISTS = {
  'llm-keys': { path: '/admin/llm/keys', heading: 'LLM API 키 일괄 변경' },
  vms: { path: '/admin/vms', heading: 'VM 일괄 변경' },
  domains: { path: '/admin/domains', heading: '도메인 일괄 변경' },
} as const

const EXTERNAL_DOMAIN_ID = uuid(9101)

async function chooseKind(user: User, title: string) {
  await user.click(screen.getByRole('radio', { name: title }))
  await user.click(screen.getByRole('button', { name: '다음' }))
}

describe('AdminBulkChangePage', () => {
  test('shows only the way back to the list without selected targets', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/bulk/llm-keys')
    expect(await screen.findByText('목록에서 바꿀 키를 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'LLM API 키 목록으로' })).toHaveAttribute(
      'href',
      '/admin/llm/keys',
    )
    expect(screen.queryByRole('button', { name: '미리보기' })).not.toBeInTheDocument()
  })

  test('sends only the chosen limits and applies with every preview fingerprint', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-org-admin', orgAdminUser, [
      'active-admin-key',
      'suspended-admin-key',
      'revoked-admin-key',
    ])
    await chooseKind(user, '한도·모델·기능 권한')
    await user.click(screen.getByRole('checkbox', { name: 'RPM' }))
    await user.type(screen.getByRole('spinbutton', { name: 'RPM' }), '120')
    await user.click(screen.getByRole('button', { name: '미리보기' }))

    const preview = await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies).toHaveLength(1)
    expect(bulkPreviewBodies[0]).toEqual({
      targetType: 'LLM_KEY',
      targetIds: [uuid(171), uuid(172), uuid(174)],
      change: { kind: 'LLM_KEY_LIMITS', llmKeyLimits: { rpm: 120 } },
    })
    const active = within(preview).getByRole('row', { name: /active-admin-key/ })
    expect(active).toHaveTextContent('RPM 60 → 120')
    const revoked = within(preview).getByRole('row', { name: /revoked-admin-key/ })
    expect(revoked).toHaveTextContent('적용 안 됨')
    expect(revoked).toHaveTextContent('지금 상태에서 할 수 없음')

    await user.click(screen.getByRole('button', { name: '2개에 적용' }))
    const result = await screen.findByRole('table', { name: '일괄 변경 결과' })
    expect(bulkApplyBodies).toHaveLength(1)
    const fingerprints = bulkApplyBodies[0].fingerprints ?? {}
    expect(Object.keys(fingerprints).sort()).toEqual([uuid(171), uuid(172), uuid(174)].sort())
    expect(Object.values(fingerprints).every((value) => typeof value === 'string')).toBe(true)
    expect(bulkApplyBodies[0].change).toEqual(bulkPreviewBodies[0].change)
    expect(within(result).getByRole('row', { name: /active-admin-key/ })).toHaveTextContent('적용됨')
    expect(within(result).getByRole('row', { name: /revoked-admin-key/ })).toHaveTextContent(
      '건너뜀',
    )
    expect(screen.getByLabelText('적용 결과 요약')).toHaveTextContent('적용됨 2개, 건너뜀 1개')
    expect(adminLlmKeyStore.find((key) => key.id === uuid(171))?.rpm).toBe(120)

    // One target was skipped, so the list keeps the selection for another try.
    await user.click(screen.getByRole('link', { name: 'LLM API 키 목록으로' }))
    expect(await screen.findByRole('checkbox', { name: 'active-admin-key 선택' })).toBeChecked()
    expect(screen.getByRole('toolbar', { name: '선택한 항목 동작' })).toHaveTextContent('3개 선택됨')
  })

  test('maps the list operation onto the allow and deny lists', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-admin', sysAdminUser, ['active-admin-key'])
    await chooseKind(user, '한도·모델·기능 권한')
    await user.click(screen.getByRole('checkbox', { name: '유료 모델 허용·차단' }))
    await user.type(screen.getByRole('textbox', { name: '유료 모델 허용·차단' }), '+openai/*{Enter}-*/*-pro')
    await user.click(screen.getByRole('checkbox', { name: '기능 권한' }))
    await user.click(screen.getByRole('checkbox', { name: /임베딩/ }))
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies[0].change.llmKeyLimits).toEqual({
      creditAllowedModels: { op: 'ADD', values: ['openai/*'] },
      creditDeniedModels: { op: 'ADD', values: ['*/*-pro'] },
      passthroughEndpoints: { op: 'ADD', values: ['embeddings'] },
    })

    // Removing names only the lists the lines touch.
    await user.click(screen.getByRole('button', { name: '이전' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '유료 모델 목록 변경 방식' }), 'REMOVE')
    const rules = screen.getByRole('textbox', { name: '유료 모델 허용·차단' })
    await user.clear(rules)
    await user.type(rules, '+openai/*')
    await user.click(screen.getByRole('checkbox', { name: '기능 권한' }))
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies[1].change.llmKeyLimits).toEqual({
      creditAllowedModels: { op: 'REMOVE', values: ['openai/*'] },
    })

    // Replacing with only allow lines empties the deny list on every key.
    await user.click(screen.getByRole('button', { name: '이전' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '유료 모델 목록 변경 방식' }), 'REPLACE')
    expect(
      screen.getByText('선택한 모든 키의 유료 모델 차단 목록이 비워집니다.'),
    ).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: '유료 모델 허용·차단' }))
    await user.type(screen.getByRole('textbox', { name: '유료 모델 허용·차단' }), '-*/*-pro')
    expect(
      screen.getByText('선택한 모든 키의 유료 모델 허용 목록이 비워집니다.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies[2].change.llmKeyLimits).toEqual({
      creditAllowedModels: { op: 'REPLACE', values: [] },
      creditDeniedModels: { op: 'REPLACE', values: ['*/*-pro'] },
    })

    // Replacing with nothing clears both lists, and says so first.
    await user.click(screen.getByRole('button', { name: '이전' }))
    await user.clear(screen.getByRole('textbox', { name: '유료 모델 허용·차단' }))
    expect(
      screen.getByText('선택한 모든 키의 유료 모델 허용·차단 목록이 비워집니다.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: '기능 권한' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '기능 권한 변경 방식' }), 'REPLACE')
    await user.click(screen.getByRole('checkbox', { name: /임베딩/ }))
    expect(screen.getByText('모든 기능 권한이 회수됩니다')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies[3].change.llmKeyLimits).toEqual({
      creditAllowedModels: { op: 'REPLACE', values: [] },
      creditDeniedModels: { op: 'REPLACE', values: [] },
      passthroughEndpoints: { op: 'REPLACE', values: [] },
    })
  })

  test('offers no money fields to SYS_MANAGER', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-manager', sysManagerUser, ['active-admin-key'])
    await chooseKind(user, '한도·모델·기능 권한')
    expect(screen.getByRole('checkbox', { name: 'RPM' })).toBeInTheDocument()
    for (const name of ['금액 한도 (USD)', '금액 리셋 창', '유료 모델 허용·차단', '기능 권한']) {
      expect(screen.queryByRole('checkbox', { name })).not.toBeInTheDocument()
    }
  })

  test('offers revoke and access only to the administrator tier', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-org-manager', orgManagerUser, ['active-admin-key'])
    expect(screen.queryByRole('radio', { name: '접근 권한' })).not.toBeInTheDocument()
    await chooseKind(user, '상태')
    expect(screen.getByRole('radio', { name: '정지' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '재개' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '폐기' })).not.toBeInTheDocument()
  })

  test('warns that revoking is irreversible before applying and spends the selection', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-org-admin', orgAdminUser, ['active-admin-key'])
    expect(screen.getByRole('radio', { name: '접근 권한' })).toBeInTheDocument()
    await chooseKind(user, '상태')
    await user.click(screen.getByRole('radio', { name: '폐기' }))
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    expect(await screen.findByText('되돌릴 수 없습니다')).toBeInTheDocument()
    expect(bulkPreviewBodies[0].change).toEqual({
      kind: 'LLM_KEY_STATUS',
      llmKeyStatus: { action: 'REVOKE', reason: null },
    })
    await user.click(screen.getByRole('button', { name: '1개에 적용' }))
    expect(await screen.findByRole('table', { name: '일괄 변경 결과' })).toHaveTextContent('적용됨')

    // Every target applied, so the selection is spent.
    await user.click(screen.getByRole('link', { name: 'LLM API 키 목록으로' }))
    expect(await screen.findByRole('checkbox', { name: 'active-admin-key 선택' })).not.toBeChecked()
    expect(screen.queryByRole('button', { name: '일괄 변경' })).not.toBeInTheDocument()
  })

  test('does not preview a suspension without a reason', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-org-admin', orgAdminUser, ['active-admin-key'])
    await chooseKind(user, '상태')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    expect(await screen.findByText('정지 사유를 입력해 주세요.')).toBeInTheDocument()
    expect(bulkPreviewBodies).toHaveLength(0)
  })

  test('routes a server 422 back to its field on the values step', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-admin', sysAdminUser, ['active-admin-key'])
    await chooseKind(user, '만료일')
    server.use(
      http.post('*/api/v1/admin/bulk-changes/preview', () =>
        problemResponse({
          type: 'about:blank',
          title: '입력값이 올바르지 않습니다',
          status: 422,
          detail: '종료일은 오늘 이후여야 합니다.',
          code: 'VALIDATION_FAILED',
          errors: [{ field: 'change.llmKeyExpiry.endDate', message: '종료일은 오늘 이후여야 합니다.' }],
        }),
      ),
    )
    const date = screen.getByLabelText(/새 만료일/)
    await user.type(date, '2030-01-01')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('종료일은 오늘 이후여야 합니다.')
    expect(screen.getByRole('button', { name: '미리보기' })).toBeInTheDocument()
  })

  test('shows extending a paid-model key expiry as ineligible', async () => {
    const user = userEvent.setup()
    adminLlmKeyStore.find((key) => key.id === uuid(171))!.expiresAt = '2029-12-31T15:00:00Z'
    await openBulk(user, 'access-sys-admin', sysAdminUser, ['active-admin-key', 'pending-admin-key'])
    await chooseKind(user, '만료일')
    expect(screen.getByText('유료 모델 키는 만료일을 앞당기는 것만 할 수 있습니다.')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/새 만료일/), '2030-06-01')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    const preview = await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(within(preview).getByRole('row', { name: /active-admin-key/ })).toHaveTextContent('대상 아님')
    expect(within(preview).getByRole('row', { name: /pending-admin-key/ })).toHaveTextContent('적용')
  })

  test('reports a target changed since the preview as stale and previews it again', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-admin', sysAdminUser, [
      'pending-admin-key',
      'initial-binding-key',
    ])
    await chooseKind(user, '만료일')
    await user.type(screen.getByLabelText(/새 만료일/), '2030-01-01')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    // Someone else changes one key between preview and apply.
    adminLlmKeyStore.find((key) => key.id === uuid(176))!.rpm = 999
    await user.click(screen.getByRole('button', { name: '2개에 적용' }))
    const result = await screen.findByRole('table', { name: '일괄 변경 결과' })
    expect(within(result).getByRole('row', { name: /initial-binding-key/ })).toHaveTextContent(
      '미리보기 이후 변경됨',
    )
    expect(within(result).getByRole('row', { name: /pending-admin-key/ })).toHaveTextContent(
      '적용됨',
    )

    await user.click(screen.getByRole('button', { name: '다시 미리보기' }))
    const again = await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies).toHaveLength(2)
    expect(bulkPreviewBodies[1]).toEqual(bulkPreviewBodies[0])
    expect(within(again).getByRole('row', { name: /pending-admin-key/ })).toHaveTextContent(
      '변경 없음',
    )
    await user.click(screen.getByRole('button', { name: '1개에 적용' }))
    expect(
      within(await screen.findByRole('table', { name: '일괄 변경 결과' })).getByRole('row', {
        name: /initial-binding-key/,
      }),
    ).toHaveTextContent('적용됨')
    expect(bulkApplyBodies[1].fingerprints).not.toEqual(bulkApplyBodies[0].fingerprints)
  })

  test('renders result and reason codes it does not know as themselves', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/v1/admin/bulk-changes', () =>
        HttpResponse.json({
          batchId: uuid(900),
          items: [
            {
              targetId: uuid(170),
              name: 'pending-admin-key',
              result: 'DEFERRED',
              reason: 'QUOTA_HELD',
              fields: [],
            },
          ],
        }),
      ),
    )
    await openBulk(user, 'access-sys-admin', sysAdminUser, ['pending-admin-key'])
    await chooseKind(user, '만료일')
    await user.type(screen.getByLabelText(/새 만료일/), '2031-01-01')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await user.click(await screen.findByRole('button', { name: '1개에 적용' }))
    const unknown = await screen.findByRole('table', { name: '일괄 변경 결과' })
    expect(unknown).toHaveTextContent('DEFERRED')
    expect(unknown).toHaveTextContent('QUOTA_HELD')
  })

  test('refuses a grantee outside the workspace and reports a grant changed since the preview', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-admin', sysAdminUser, ['active-admin-key'])
    await chooseKind(user, '접근 권한')
    await user.type(screen.getByRole('searchbox', { name: /대상 사용자/ }), '정외부')
    await user.click(
      within(await screen.findByRole('list', { name: '검색된 사용자' })).getAllByRole('button')[0],
    )
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    expect(
      within(await screen.findByRole('table', { name: '일괄 변경 미리보기' })).getByRole('row', {
        name: /active-admin-key/,
      }),
    ).toHaveTextContent('워크스페이스 구성원 아님')

    await user.click(screen.getByRole('button', { name: '이전' }))
    await user.click(screen.getByRole('button', { name: '다시 고르기' }))
    await user.type(screen.getByRole('searchbox', { name: /대상 사용자/ }), '홍길동')
    await user.click(
      within(await screen.findByRole('list', { name: '검색된 사용자' })).getAllByRole('button')[0],
    )
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await screen.findByRole('button', { name: '1개에 적용' })
    // Another administrator grants the same person meanwhile.
    setBulkGrant(uuid(171), uuid(42), 'VIEWER')
    await user.click(screen.getByRole('button', { name: '1개에 적용' }))
    expect(await screen.findByRole('table', { name: '일괄 변경 결과' })).toHaveTextContent(
      '미리보기 이후 변경됨',
    )
  })

  test('sends a VM power change and offers no deletion or access to an org manager', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-org-manager', orgManagerUser, ['algo-judge'], 'vms')
    expect(screen.getByRole('radio', { name: '기간' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '삭제 예약·취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '접근 권한' })).not.toBeInTheDocument()
    await chooseKind(user, '전원')
    await user.click(screen.getByRole('radio', { name: '재부팅' }))
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies[0]).toEqual({
      targetType: 'VM',
      targetIds: [uuid(56)],
      change: { kind: 'VM_POWER', vmPower: { action: 'REBOOT' } },
    })
  })

  test('sends a VM deletion schedule read as KST with its reason', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-admin', sysAdminUser, ['algo-judge'], 'vms')
    await chooseKind(user, '삭제 예약·취소')
    await user.type(screen.getByLabelText(/삭제 예정 시각/), '2030-01-01T09:30')
    await user.type(screen.getByRole('textbox', { name: /삭제 사유/ }), '학기 종료')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies[0].change).toEqual({
      kind: 'VM_DELETION',
      vmDeletion: {
        action: 'SCHEDULE',
        scheduledFor: '2030-01-01T00:30:00.000Z',
        reason: '학기 종료',
      },
    })
  })

  test('sends the searched user and chosen role for an access grant', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-admin', sysAdminUser, ['algo-judge'], 'vms')
    await chooseKind(user, '접근 권한')
    await user.type(screen.getByRole('searchbox', { name: /대상 사용자/ }), '홍길동')
    const results = await screen.findByRole('list', { name: '검색된 사용자' })
    await user.click(within(results).getAllByRole('button')[0])
    await user.selectOptions(screen.getByRole('combobox', { name: /등급/ }), 'EDITOR')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await waitFor(() => expect(bulkPreviewBodies).toHaveLength(1))
    expect(bulkPreviewBodies[0].change).toEqual({
      kind: 'ACCESS',
      access: { userId: uuid(42), action: 'GRANT', role: 'EDITOR' },
    })
  })
})

describe('AdminBulkChangePage on domains', () => {
  test('offers the domain kinds to an org manager and access only to the administrator tier', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-org-manager', orgManagerUser, ['myblog.pusan.dev'], 'domains')
    for (const title of ['사용 기한', '재검증', '강제 해제']) {
      expect(screen.getByRole('radio', { name: title })).toBeInTheDocument()
    }
    expect(screen.queryByRole('radio', { name: '접근 권한' })).not.toBeInTheDocument()
  })

  test('sends a renewal as the end of the chosen KST day and marks other kinds ineligible', async () => {
    const user = userEvent.setup()
    await openBulk(
      user,
      'access-sys-admin',
      sysAdminUser,
      ['myblog.pusan.dev', 'ai-team.pusan.dev'],
      'domains',
    )
    await chooseKind(user, '사용 기한')
    await user.type(screen.getByLabelText(/새 사용 기한/), '2030-01-01')
    await user.type(screen.getByRole('textbox', { name: /사유/ }), '학기 연장')
    await user.click(screen.getByRole('button', { name: '미리보기' }))

    const preview = await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    const platformId = bulkPreviewBodies[0].targetIds[1]
    expect(bulkPreviewBodies[0]).toEqual({
      targetType: 'DOMAIN',
      targetIds: [EXTERNAL_DOMAIN_ID, platformId],
      change: {
        kind: 'DOMAIN_RENEWAL',
        domainRenewal: { renewDueAt: '2030-01-01T14:59:59.000Z', reason: '학기 연장' },
      },
    })
    expect(within(preview).getByRole('row', { name: /myblog\.pusan\.dev/ })).toHaveTextContent(
      /사용 기한 .+ → .+/,
    )
    expect(within(preview).getByRole('row', { name: /ai-team\.pusan\.dev/ })).toHaveTextContent(
      '대상 아님',
    )

    await user.click(screen.getByRole('button', { name: '1개에 적용' }))
    expect(
      within(await screen.findByRole('table', { name: '일괄 변경 결과' })).getByRole('row', {
        name: /myblog\.pusan\.dev/,
      }),
    ).toHaveTextContent('적용됨')
    expect(externalDomains.find((domain) => domain.id === EXTERNAL_DOMAIN_ID)?.renewDueAt).toBe(
      '2030-01-01T14:59:59.000Z',
    )
  })

  test('sends no reason when the renewal reason is blank', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-org-manager', orgManagerUser, ['myblog.pusan.dev'], 'domains')
    await chooseKind(user, '사용 기한')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    expect(await screen.findByText('새 사용 기한을 선택해 주세요.')).toBeInTheDocument()
    expect(bulkPreviewBodies).toHaveLength(0)
    await user.type(screen.getByLabelText(/새 사용 기한/), '2030-01-01')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies[0].change.domainRenewal?.reason).toBeNull()
  })

  test('routes the server refusing a past deadline back to the renewal input', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-admin', sysAdminUser, ['myblog.pusan.dev'], 'domains')
    await chooseKind(user, '사용 기한')
    await user.type(screen.getByLabelText(/새 사용 기한/), '2020-01-01')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('지난 시각으로는 옮길 수 없습니다.')
    expect(screen.getByLabelText(/새 사용 기한/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: '일괄 변경 미리보기' })).not.toBeInTheDocument()
  })

  test('reports a renewal target changed since the preview as stale', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-admin', sysAdminUser, ['myblog.pusan.dev'], 'domains')
    await chooseKind(user, '사용 기한')
    await user.type(screen.getByLabelText(/새 사용 기한/), '2030-01-01')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    // The owner extends the name between preview and apply.
    externalDomains.find((domain) => domain.id === EXTERNAL_DOMAIN_ID)!.renewDueAt =
      '2028-01-01T00:00:00+09:00'
    await user.click(screen.getByRole('button', { name: '1개에 적용' }))
    expect(await screen.findByRole('table', { name: '일괄 변경 결과' })).toHaveTextContent(
      '미리보기 이후 변경됨',
    )
  })

  test('goes from the kind straight to the preview for a verify and names non-custom domains ineligible', async () => {
    const user = userEvent.setup()
    await openBulk(
      user,
      'access-org-admin',
      orgAdminUser,
      ['demo.example.com', 'myblog.pusan.dev'],
      'domains',
    )
    await user.click(screen.getByRole('radio', { name: '재검증' }))
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    const preview = await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies[0].change).toEqual({ kind: 'DOMAIN_VERIFY', domainVerify: {} })
    expect(within(preview).getByRole('row', { name: /demo\.example\.com/ })).toHaveTextContent(
      '소유권 검증 — → 재검증 접수',
    )
    expect(within(preview).getByRole('row', { name: /myblog\.pusan\.dev/ })).toHaveTextContent(
      '대상 아님',
    )
    await user.click(screen.getByRole('button', { name: '이전' }))
    expect(screen.getByRole('radio', { name: '재검증' })).toBeChecked()
  })

  test('applies a force release only after the applicable count is typed', async () => {
    const user = userEvent.setup()
    await openBulk(
      user,
      'access-sys-admin',
      sysAdminUser,
      ['demo.example.com', 'myblog.pusan.dev'],
      'domains',
    )
    await user.click(screen.getByRole('radio', { name: '강제 해제' }))
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    const preview = await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies[0].change).toEqual({
      kind: 'DOMAIN_FORCE_RELEASE',
      domainForceRelease: {},
    })
    expect(within(preview).getByRole('row', { name: /myblog\.pusan\.dev/ })).toHaveTextContent(
      '상태 연결됨 → 해제됨',
    )
    expect(screen.getByText('되돌릴 수 없습니다')).toBeInTheDocument()
    expect(screen.getByText(/DNS 존에서 레코드가 지워집니다/)).toBeInTheDocument()

    const apply = screen.getByRole('button', { name: '2개에 적용' })
    const count = screen.getByRole('textbox', { name: '적용 대상 수(2)를 입력해 주세요' })
    expect(apply).toBeDisabled()
    await user.type(count, '1')
    expect(apply).toBeDisabled()
    await user.clear(count)
    await user.type(count, '2')
    expect(apply).toBeEnabled()
    await user.click(apply)

    const result = await screen.findByRole('table', { name: '일괄 변경 결과' })
    expect(bulkApplyBodies).toHaveLength(1)
    expect(within(result).getByRole('row', { name: /demo\.example\.com/ })).toHaveTextContent('적용됨')
    expect(within(result).getByRole('row', { name: /myblog\.pusan\.dev/ })).toHaveTextContent('적용됨')

    await user.click(screen.getByRole('link', { name: '공개 서비스 목록으로' }))
    await screen.findByRole('checkbox', { name: 'ai-team.pusan.dev 선택' })
    expect(screen.queryByText('demo.example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('myblog.pusan.dev')).not.toBeInTheDocument()
  })

  test('asks for the count again after a fresh preview', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-admin', sysAdminUser, ['myblog.pusan.dev'], 'domains')
    await user.click(screen.getByRole('radio', { name: '강제 해제' }))
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await user.type(
      await screen.findByRole('textbox', { name: '적용 대상 수(1)를 입력해 주세요' }),
      '1',
    )
    await user.click(screen.getByRole('button', { name: '이전' }))
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    expect(
      await screen.findByRole('textbox', { name: '적용 대상 수(1)를 입력해 주세요' }),
    ).toHaveValue('')
    expect(screen.getByRole('button', { name: '1개에 적용' })).toBeDisabled()
  })

  test('sends an access grant on domains with the domain grade hints', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-admin', sysAdminUser, ['myblog.pusan.dev'], 'domains')
    await chooseKind(user, '접근 권한')
    await user.type(screen.getByRole('searchbox', { name: /대상 사용자/ }), '홍길동')
    await user.click(
      within(await screen.findByRole('list', { name: '검색된 사용자' })).getAllByRole('button')[0],
    )
    await user.selectOptions(screen.getByRole('combobox', { name: /등급/ }), 'EDITOR')
    expect(screen.getByText('레코드 편집과 사용 연장까지')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await screen.findByRole('table', { name: '일괄 변경 미리보기' })
    expect(bulkPreviewBodies[0]).toEqual({
      targetType: 'DOMAIN',
      targetIds: [EXTERNAL_DOMAIN_ID],
      change: { kind: 'ACCESS', access: { userId: uuid(42), action: 'GRANT', role: 'EDITOR' } },
    })
  })
})
