import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import { orgAdminUser, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { openRouterAccountStore } from '../test/msw/handlers/openrouter-accounts'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderDetail(accountId: string) {
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
  renderApp(`/admin/llm/accounts/${accountId}`)
}

/**
 * 잔액보다 많이 배정된 상태를 만든다. 기본 픽스처를 이 모양으로 두면 금액 축을
 * 승인하는 무관한 테스트가 전부 확인 절차에 걸리므로, 필요한 테스트만 세운다.
 */
function overAllocate(accountId: string) {
  const account = openRouterAccountStore.find((item) => item.id === accountId)!
  account.allocation = {
    ...account.allocation,
    committedCreditLimit: 300,
    committedTotalCap: 300,
    committedKeyCount: 30,
    remainingCommitment: 290,
    committedUsage: 10,
    awaitingProvisionKeyCount: 28,
  }
}

/** 관측 없는 계정 픽스처는 다른 기관에 있어 시스템 계층으로 읽는다. */
function renderDetailAsSysAdmin(accountId: string) {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`/admin/llm/accounts/${accountId}`)
}

describe('사업 계정 상세의 배정 현황', () => {
  /**
   * 착수 근거가 된 사고. 잔액보다 많이 배정된 계정은 그 사실이 화면에 있어야
   * 한다. 승인 직전이 아니라 계정을 열어 보는 것만으로도 읽혀야 다음 승인 전에
   * 알 수 있다.
   */
  test('남은 배정이 잔액을 넘으면 경고와 함께 두 수를 나란히 보여 준다', async () => {
    overAllocate(uuid(410))
    renderDetail(uuid(410))

    const section = (await screen.findByRole('heading', { name: '배정 현황' })).closest('section')!
    // 남은 배정은 게이지와 항목 표에 둘 다 나온다 — 같은 수를 두 자리에서 읽는다.
    expect(within(section).getByText(/\$300\.00/)).toBeInTheDocument()
    expect(within(section).getAllByText(/\$290\.00/).length).toBeGreaterThan(0)
    expect(
      within(section).getByText(/먼저 쓰는 사람이 잔액을 소진하면/),
    ).toBeInTheDocument()
  })

  /** 승인만 받고 아직 발급되지 않은 키가 합계에 이미 들어 있다는 사실을 말한다. */
  test('발급 대기 키가 합계에 포함돼 있음을 밝힌다', async () => {
    overAllocate(uuid(410))
    renderDetail(uuid(410))

    const section = (await screen.findByRole('heading', { name: '배정 현황' })).closest('section')!
    expect(within(section).getByText(/28개/)).toBeInTheDocument()
    expect(within(section).getByText(/배정 합계에는 이미 들어 있습니다/)).toBeInTheDocument()
  })

  /**
   * 잔액을 한 번도 관측하지 못한 계정. 우리 관측이 없는 것이지 잔액이 0인 것이
   * 아니므로, 초과라고 단정하지 않고 판단할 수 없다고만 말한다.
   */
  test('잔액을 관측하지 못한 계정은 초과라 단정하지 않는다', async () => {
    const unobserved = openRouterAccountStore.find(
      (account) => account.credits.balance == null,
    )!
    renderDetailAsSysAdmin(unobserved.id)

    const section = (await screen.findByRole('heading', { name: '배정 현황' })).closest('section')!
    expect(within(section).getByText(/초과 여부를 판단할 수 없습니다/)).toBeInTheDocument()
    expect(within(section).queryByText(/잔액을 넘습니다/)).not.toBeInTheDocument()
  })

  /** 창 한도는 합계에 들어가되 창마다 되살아난다는 사실을 따로 말해야 한다. */
  test('창마다 다시 채워지는 몫을 따로 밝힌다', async () => {
    const windowed = openRouterAccountStore.find(
      (account) => account.allocation.committedMonthly > 0,
    )!
    renderDetail(windowed.id)

    const section = (await screen.findByRole('heading', { name: '배정 현황' })).closest('section')!
    expect(within(section).getByText(/창마다 다시 채워지는 몫/)).toBeInTheDocument()
    expect(within(section).getByText(/리셋 창마다 한도가 되살아납니다/)).toBeInTheDocument()
  })
})

describe('사업 계정의 승인 기본 목록', () => {
  /**
   * 승인 폼이 두 목록을 함께 프리필하므로 계정도 둘을 함께 든다. 한쪽만 저장하면
   * 승인 화면에서 차단이 조용히 빠진 채로 열린다.
   */
  test('허용과 차단 기본값을 각각 저장한다', async () => {
    const user = userEvent.setup()
    renderDetail(uuid(410))

    await user.click(await screen.findByRole('button', { name: '정보 변경' }))
    const dialog = within(
      screen.getByRole('dialog', { name: 'OpenRouter 사업 계정 정보 변경' }),
    )
    await user.type(dialog.getByLabelText('승인 화면 기본 차단 목록'), 'openai/*-pro')
    await user.click(dialog.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const account = openRouterAccountStore.find((item) => item.id === uuid(410))!
      expect(account.defaultCreditDeniedModels).toEqual(['openai/*-pro'])
      expect(account.defaultCreditAllowedModels).toEqual(['openai/*'])
    })
  })

  test('차단 기본값이 틀리면 저장하지 않는다', async () => {
    const user = userEvent.setup()
    renderDetail(uuid(410))

    await user.click(await screen.findByRole('button', { name: '정보 변경' }))
    const dialog = within(
      screen.getByRole('dialog', { name: 'OpenRouter 사업 계정 정보 변경' }),
    )
    // 앞 테스트가 남긴 값 위에 적으면 무엇을 검사하는지 흐려진다.
    const denied = dialog.getByLabelText('승인 화면 기본 차단 목록')
    await user.clear(denied)
    await user.type(denied, 'openai/**')
    await user.click(dialog.getByRole('button', { name: '저장' }))

    expect(await dialog.findByText(/형식이 아닙니다/)).toBeInTheDocument()
  })

  // 기능 권한 기본값도 두 목록과 같은 저장에 실려야 한다. 빠지면 승인 폼이 계정이
  // 정해 둔 것보다 적게 체크된 채로 열리고, 승인자는 그것을 계정의 뜻으로 읽는다.
  test('기능 권한 기본값도 같은 저장에 실린다', async () => {
    const user = userEvent.setup()
    renderDetail(uuid(410))

    await user.click(await screen.findByRole('button', { name: '정보 변경' }))
    const dialog = within(
      screen.getByRole('dialog', { name: 'OpenRouter 사업 계정 정보 변경' }),
    )
    await user.click(dialog.getByLabelText('임베딩'))
    await user.click(dialog.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const account = openRouterAccountStore.find((item) => item.id === uuid(410))!
      expect(account.defaultPassthroughEndpoints).toEqual(['images', 'embeddings'])
    })
  })
})
