import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

/** 프리셋 표를 표시명 셀 기준으로 찾는다 (OS 표와 열 구성이 달라 행 단위로 본다). */
function flavorRow(displayName: string) {
  return screen.getByText(displayName).closest('tr')!
}

/** 프리셋 표가 도착할 때까지 기다린 뒤 해당 행을 돌려준다. */
async function findFlavorRow(displayName: string) {
  return (await screen.findByText(displayName)).closest('tr')!
}

describe('관리자 템플릿·사양 관리 — OS 템플릿', () => {
  test('전 상태 템플릿을 나열하고 은퇴 리비전에 배지를 붙인다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/templates')

    await screen.findByRole('heading', { name: '템플릿·사양 관리' })
    const active = (await screen.findByText('Ubuntu 24.04 LTS')).closest('tr')!
    expect(within(active).getByText('활성')).toBeInTheDocument()
    // 기본 사양 대신 OS 축의 최소 디스크가 보인다.
    expect(within(active).getByText('10 GiB')).toBeInTheDocument()
    const retired = screen.getByText('Ubuntu 24.04 LTS (구 리비전)').closest('tr')!
    expect(within(retired).getByText('은퇴')).toBeInTheDocument()
    expect(within(retired).getByRole('button', { name: '되살리기' })).toBeEnabled()
  })

  test('마지막 ACTIVE 템플릿 은퇴 시 경고를 띄우고 전환한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/templates')

    const active = (await screen.findByText('Ubuntu 24.04 LTS')).closest('tr')!
    await user.click(within(active).getByRole('button', { name: '은퇴' }))

    const dialog = await screen.findByRole('dialog', { name: '템플릿 은퇴' })
    expect(within(dialog).getByText(/마지막 ACTIVE 템플릿입니다/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '은퇴' }))

    expect(await screen.findByText('템플릿을 은퇴시켰습니다.')).toBeInTheDocument()
    const updated = (await screen.findByText('Ubuntu 24.04 LTS')).closest('tr')!
    expect(within(updated).getByText('은퇴')).toBeInTheDocument()
  })

  test('SYS_MANAGER에게는 토글이 비활성+사유로 보인다', async () => {
    server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
    renderApp('/admin/templates')

    await screen.findByRole('heading', { name: '템플릿·사양 관리' })
    expect(
      screen.getByText('템플릿·사양 프리셋 변경은 시스템 관리자만 수행할 수 있습니다.'),
    ).toBeInTheDocument()
    const active = (await screen.findByText('Ubuntu 24.04 LTS')).closest('tr')!
    expect(within(active).getByRole('button', { name: '은퇴' })).toBeDisabled()
  })
})

describe('관리자 템플릿·사양 관리 — 사양 프리셋', () => {
  test('전 상태 프리셋을 사양과 함께 나열하고 은퇴 프리셋에 배지를 붙인다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/templates')

    await screen.findByRole('heading', { name: '사양 프리셋' })
    const basic = await findFlavorRow('기본형')
    expect(within(basic).getByText('2 vCPU · 2 GiB · 20 GiB')).toBeInTheDocument()
    expect(within(basic).getByText('활성')).toBeInTheDocument()

    const retired = flavorRow('구형 프리셋')
    expect(within(retired).getByText('은퇴')).toBeInTheDocument()
    expect(within(retired).getByRole('button', { name: '되살리기' })).toBeEnabled()
  })

  test('수정 모달에서 값을 바꾸면 표에 반영된다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/templates')

    await user.click(
      within(await findFlavorRow('소형')).getByRole('button', { name: '수정' }),
    )

    const dialog = await screen.findByRole('dialog', { name: '사양 프리셋 수정' })
    // 이름(식별자)은 잠겨 있다.
    expect(within(dialog).getByLabelText('이름')).toBeDisabled()
    const memory = within(dialog).getByLabelText('메모리 (MiB)')
    await user.clear(memory)
    await user.type(memory, '2048')
    const display = within(dialog).getByLabelText('표시명')
    await user.clear(display)
    await user.type(display, '소형 플러스')
    await user.click(within(dialog).getByRole('button', { name: '저장' }))

    expect(await screen.findByText('사양 프리셋을 수정했습니다.')).toBeInTheDocument()
    const updated = flavorRow('소형 플러스')
    expect(within(updated).getByText('1 vCPU · 2 GiB · 10 GiB')).toBeInTheDocument()
  })

  test('비고를 비우고 저장하면 실제로 지워진다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/templates')

    const before = await findFlavorRow('소형')
    expect(within(before).getByText('간단한 실습·정적 웹 서버에 적합합니다.')).toBeInTheDocument()
    await user.click(within(before).getByRole('button', { name: '수정' }))

    const dialog = await screen.findByRole('dialog', { name: '사양 프리셋 수정' })
    await user.clear(within(dialog).getByLabelText('비고'))
    await user.click(within(dialog).getByRole('button', { name: '저장' }))

    expect(await screen.findByText('사양 프리셋을 수정했습니다.')).toBeInTheDocument()
    // 빈 값은 null이 아니라 빈 문자열로 보내야 서버가 "변경 없음"으로 보지 않는다.
    const after = flavorRow('소형')
    expect(
      within(after).queryByText('간단한 실습·정적 웹 서버에 적합합니다.'),
    ).not.toBeInTheDocument()
    expect(within(after).getByText('—')).toBeInTheDocument()
  })

  test('마지막 ACTIVE 프리셋이 아니면 경고 없이 은퇴시킨다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/templates')

    await user.click(
      within(await findFlavorRow('대형')).getByRole('button', { name: '은퇴' }),
    )

    const dialog = await screen.findByRole('dialog', { name: '사양 프리셋 은퇴' })
    expect(within(dialog).queryByText(/마지막 ACTIVE 프리셋입니다/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '은퇴' }))

    expect(await screen.findByText('사양 프리셋을 은퇴시켰습니다.')).toBeInTheDocument()
    expect(within(flavorRow('대형')).getByText('은퇴')).toBeInTheDocument()
  })

  test('프리셋을 추가하고, 이름이 중복되면 422 필드 오류를 보여준다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/templates')

    await findFlavorRow('기본형')
    await user.click(screen.getByRole('button', { name: '프리셋 추가' }))

    let dialog = await screen.findByRole('dialog', { name: '사양 프리셋 추가' })
    // 중복 이름 → 서버 422가 이름 필드에 붙는다.
    await user.type(within(dialog).getByLabelText('이름'), 'small')
    await user.type(within(dialog).getByLabelText('표시명'), '소형 사본')
    await user.click(within(dialog).getByRole('button', { name: '추가' }))
    expect(
      await within(dialog).findByText('이미 사용 중인 프리셋 이름입니다.'),
    ).toBeInTheDocument()

    // 이름을 바꾸면 추가된다.
    dialog = screen.getByRole('dialog', { name: '사양 프리셋 추가' })
    const name = within(dialog).getByLabelText('이름')
    await user.clear(name)
    await user.type(name, 'xlarge')
    const vcpu = within(dialog).getByLabelText('vCPU')
    await user.clear(vcpu)
    await user.type(vcpu, '8')
    await user.click(within(dialog).getByRole('button', { name: '추가' }))

    expect(await screen.findByText('사양 프리셋을 추가했습니다.')).toBeInTheDocument()
    const created = flavorRow('소형 사본')
    expect(within(created).getByText('xlarge')).toBeInTheDocument()
    expect(within(created).getByText('8 vCPU · 2 GiB · 20 GiB')).toBeInTheDocument()
  })

  test('이름 형식이 어긋나면 서버 호출 없이 막는다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/templates')

    await findFlavorRow('기본형')
    await user.click(screen.getByRole('button', { name: '프리셋 추가' }))

    const dialog = await screen.findByRole('dialog', { name: '사양 프리셋 추가' })
    await user.type(within(dialog).getByLabelText('이름'), 'Big_Flavor')
    await user.type(within(dialog).getByLabelText('표시명'), '대용량')
    await user.click(within(dialog).getByRole('button', { name: '추가' }))

    expect(
      within(dialog).getByText(/프리셋 이름은 소문자·숫자·하이픈만 사용해 주세요/),
    ).toBeInTheDocument()
  })

  test('SYS_MANAGER에게는 프리셋 작업이 비활성+사유로 보인다', async () => {
    server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
    renderApp('/admin/templates')

    const basic = await findFlavorRow('기본형')
    expect(
      screen.getByText('템플릿·사양 프리셋 변경은 시스템 관리자만 수행할 수 있습니다.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '프리셋 추가' })).toBeDisabled()
    expect(within(basic).getByRole('button', { name: '수정' })).toBeDisabled()
    expect(within(basic).getByRole('button', { name: '은퇴' })).toBeDisabled()
  })
})
