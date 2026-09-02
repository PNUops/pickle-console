import { screen, within } from '@testing-library/react'
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
