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
import { bulkApplyBodies, bulkPreviewBodies } from '../test/msw/handlers/bulk-changes'
import { adminLlmKeyStore } from '../test/msw/handlers/llm-keys'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

type User = ReturnType<typeof userEvent.setup>

async function openBulk(
  user: User,
  token: string,
  profile: typeof sysAdminUser,
  names: string[],
  list: 'llm-keys' | 'vms' = 'llm-keys',
) {
  server.use(refreshSuccessHandler(token, profile))
  renderApp(list === 'llm-keys' ? '/admin/llm/keys' : '/admin/vms')
  for (const name of names) {
    await user.click(await screen.findByRole('checkbox', { name: `${name} 선택` }))
  }
  await user.click(screen.getByRole('button', { name: '일괄 변경' }))
  await screen.findByRole('heading', {
    name: list === 'llm-keys' ? 'LLM API 키 일괄 변경' : 'VM 일괄 변경',
  })
}

async function chooseKind(user: User, title: string) {
  await user.click(screen.getByRole('radio', { name: title }))
  await user.click(screen.getByRole('button', { name: '다음' }))
}

describe('관리자 일괄 변경', () => {
  test('선택 없이 들어오면 목록으로 돌아가는 길만 보여 준다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/bulk/llm-keys')
    expect(await screen.findByText('목록에서 바꿀 키를 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'LLM API 키 목록으로' })).toHaveAttribute(
      'href',
      '/admin/llm/keys',
    )
    expect(screen.queryByRole('button', { name: '미리보기' })).not.toBeInTheDocument()
  })

  test('고른 한도만 보내고, 미리보기의 fingerprint를 모두 담아 적용한다', async () => {
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

    // The selection is spent: back on the list, nothing is selected.
    await user.click(screen.getByRole('link', { name: 'LLM API 키 목록으로' }))
    expect(await screen.findByRole('checkbox', { name: 'active-admin-key 선택' })).not.toBeChecked()
    expect(screen.queryByRole('button', { name: '일괄 변경' })).not.toBeInTheDocument()
  })

  test('목록 변경 방식이 허용·차단 목록의 op로 갈린다', async () => {
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

    // Replacing with nothing clears both lists, and says so first.
    await user.click(screen.getByRole('button', { name: '이전' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '유료 모델 목록 변경 방식' }), 'REPLACE')
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
    expect(bulkPreviewBodies[2].change.llmKeyLimits).toEqual({
      creditAllowedModels: { op: 'REPLACE', values: [] },
      creditDeniedModels: { op: 'REPLACE', values: [] },
      passthroughEndpoints: { op: 'REPLACE', values: [] },
    })
  })

  test('SYS_MANAGER에게는 금액 축 항목이 없다', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-sys-manager', sysManagerUser, ['active-admin-key'])
    await chooseKind(user, '한도·모델·기능 권한')
    expect(screen.getByRole('checkbox', { name: 'RPM' })).toBeInTheDocument()
    for (const name of ['금액 한도 (USD)', '금액 리셋 창', '유료 모델 허용·차단', '기능 권한']) {
      expect(screen.queryByRole('checkbox', { name })).not.toBeInTheDocument()
    }
  })

  test('폐기와 접근 권한은 관리자 계층에게만 있다', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-org-manager', orgManagerUser, ['active-admin-key'])
    expect(screen.queryByRole('radio', { name: '접근 권한' })).not.toBeInTheDocument()
    await chooseKind(user, '상태')
    expect(screen.getByRole('radio', { name: '정지' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '재개' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '폐기' })).not.toBeInTheDocument()
  })

  test('폐기는 되돌릴 수 없다는 경고를 적용 버튼 앞에 둔다', async () => {
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
  })

  test('정지는 사유 없이 미리보기로 가지 않는다', async () => {
    const user = userEvent.setup()
    await openBulk(user, 'access-org-admin', orgAdminUser, ['active-admin-key'])
    await chooseKind(user, '상태')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    expect(await screen.findByText('정지 사유를 입력해 주세요.')).toBeInTheDocument()
    expect(bulkPreviewBodies).toHaveLength(0)
  })

  test('서버 422는 값 입력 단계의 그 칸으로 돌아간다', async () => {
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

  test('유료 모델 키의 만료 연장은 대상 아님으로 건너뛴다', async () => {
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

  test('그사이 바뀐 대상과 모르는 코드를 그대로 보여 준다', async () => {
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
      '그사이 바뀜',
    )
    expect(within(result).getByRole('row', { name: /pending-admin-key/ })).toHaveTextContent(
      '적용됨',
    )

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
    await user.click(screen.getByRole('link', { name: 'LLM API 키 목록으로' }))
    await user.click(await screen.findByRole('checkbox', { name: 'pending-admin-key 선택' }))
    await user.click(screen.getByRole('button', { name: '일괄 변경' }))
    await chooseKind(user, '만료일')
    await user.type(screen.getByLabelText(/새 만료일/), '2031-01-01')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await user.click(await screen.findByRole('button', { name: '1개에 적용' }))
    const unknown = await screen.findByRole('table', { name: '일괄 변경 결과' })
    expect(unknown).toHaveTextContent('DEFERRED')
    expect(unknown).toHaveTextContent('QUOTA_HELD')
  })

  test('VM 전원 변경을 보내고, 삭제와 접근 권한은 운영자에게 없다', async () => {
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

  test('VM 삭제 예약은 시각과 사유를 KST로 보낸다', async () => {
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

  test('접근 권한은 검색해서 고른 사용자와 등급을 보낸다', async () => {
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
