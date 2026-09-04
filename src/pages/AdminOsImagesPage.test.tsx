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

/** 사양 표를 표시명 셀 기준으로 찾는다 (OS 표와 열 구성이 달라 행 단위로 본다). */
function flavorRow(displayName: string) {
  return screen.getByText(displayName).closest('tr')!
}

/** 사양 표가 도착할 때까지 기다린 뒤 해당 행을 돌려준다. */
async function findFlavorRow(displayName: string) {
  return (await screen.findByText(displayName)).closest('tr')!
}

describe('관리자 OS 이미지·사양 관리 — OS 이미지', () => {
  test('전 상태 OS 이미지를 나열하고 은퇴 리비전에 배지를 붙인다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    await screen.findByRole('heading', { name: 'OS 이미지·사양 관리' })
    const active = (await screen.findByText('Ubuntu 24.04 LTS')).closest('tr')!
    expect(within(active).getByText('활성')).toBeInTheDocument()
    // 기본 사양 대신 OS 축의 최소 디스크가 보인다.
    expect(within(active).getByText('10 GiB')).toBeInTheDocument()
    const retired = screen.getByText('Ubuntu 24.04 LTS (구 리비전)').closest('tr')!
    expect(within(retired).getByText('은퇴')).toBeInTheDocument()
    expect(within(retired).getByRole('button', { name: '되살리기' })).toBeEnabled()
  })

  // 노드 자리에는 노드 id가 그대로 찍혀 있었다. id는 UUID라 어느 호스트인지 알려주지
  // 않는다 — 운영자가 아는 것은 노드 이름이다.
  test('이미지가 올라간 노드를 id가 아닌 이름으로 보여준다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    const active = (await screen.findByText('Ubuntu 24.04 LTS')).closest('tr')!
    expect(await within(active).findByText(/^pve1 \//)).toBeInTheDocument()
    expect(active.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  test('마지막 ACTIVE OS 이미지 은퇴 시 경고를 띄우고 전환한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    const active = (await screen.findByText('Ubuntu 24.04 LTS')).closest('tr')!
    await user.click(within(active).getByRole('button', { name: '은퇴' }))

    const dialog = await screen.findByRole('dialog', { name: 'OS 이미지 은퇴' })
    expect(within(dialog).getByText(/마지막 활성 OS 이미지입니다/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '은퇴' }))

    expect(await screen.findByText('OS 이미지를 은퇴시켰습니다.')).toBeInTheDocument()
    const updated = (await screen.findByText('Ubuntu 24.04 LTS')).closest('tr')!
    expect(within(updated).getByText('은퇴')).toBeInTheDocument()
  })

  test('SYS_MANAGER에게는 OS 이미지 변경 액션이 보이지 않는다', async () => {
    server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
    renderApp('/admin/os-images')

    await screen.findByRole('heading', { name: 'OS 이미지·사양 관리' })
    const active = (await screen.findByText('Ubuntu 24.04 LTS')).closest('tr')!
    expect(within(active).queryByRole('button', { name: '은퇴' })).not.toBeInTheDocument()
  })
})

describe('관리자 OS 이미지·사양 관리 — 사양', () => {
  test('전 상태의 사양을 수치와 함께 나열하고 은퇴한 행에 배지를 붙인다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    await screen.findByRole('heading', { name: '사양' })
    const basic = await findFlavorRow('컴퓨팅 최적화')
    expect(within(basic).getByText('2 vCPU · 1 GiB · 32 GiB')).toBeInTheDocument()
    expect(within(basic).getByText('활성')).toBeInTheDocument()

    const retired = flavorRow('구형 사양')
    expect(within(retired).getByText('은퇴')).toBeInTheDocument()
    expect(within(retired).getByRole('button', { name: '되살리기' })).toBeEnabled()
  })

  test('수정 모달에서 값을 바꾸면 표에 반영된다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    await user.click(
      within(await findFlavorRow('메모리 최적화')).getByRole('button', { name: '수정' }),
    )

    const dialog = await screen.findByRole('dialog', { name: '사양 수정' })
    // 이름(식별자)은 잠겨 있다.
    expect(within(dialog).getByLabelText('이름')).toBeDisabled()
    const memory = within(dialog).getByLabelText('메모리 (MiB)')
    await user.clear(memory)
    await user.type(memory, '2048')
    const display = within(dialog).getByLabelText('표시명')
    await user.clear(display)
    await user.type(display, '메모리 최적화 플러스')
    await user.click(within(dialog).getByRole('button', { name: '저장' }))

    expect(await screen.findByText('사양을 수정했습니다.')).toBeInTheDocument()
    const updated = flavorRow('메모리 최적화 플러스')
    expect(within(updated).getByText('1 vCPU · 2 GiB · 32 GiB')).toBeInTheDocument()
  })

  test('비고를 비우고 저장하면 실제로 지워진다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    const before = await findFlavorRow('메모리 최적화')
    expect(within(before).getByText('메모리를 많이 쓰는 작업에 맞습니다.')).toBeInTheDocument()
    await user.click(within(before).getByRole('button', { name: '수정' }))

    const dialog = await screen.findByRole('dialog', { name: '사양 수정' })
    await user.clear(within(dialog).getByLabelText('비고'))
    await user.click(within(dialog).getByRole('button', { name: '저장' }))

    expect(await screen.findByText('사양을 수정했습니다.')).toBeInTheDocument()
    // 빈 값은 null이 아니라 빈 문자열로 보내야 서버가 "변경 없음"으로 보지 않는다.
    const after = flavorRow('메모리 최적화')
    expect(
      within(after).queryByText('메모리를 많이 쓰는 작업에 맞습니다.'),
    ).not.toBeInTheDocument()
    expect(within(after).getByText('—')).toBeInTheDocument()
  })

  test('마지막 ACTIVE 사양이 아니면 경고 없이 은퇴시킨다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    await user.click(
      within(await findFlavorRow('메모리 최적화')).getByRole('button', { name: '은퇴' }),
    )

    const dialog = await screen.findByRole('dialog', { name: '사양 은퇴' })
    expect(within(dialog).queryByText(/마지막 활성 사양입니다/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '은퇴' }))

    expect(await screen.findByText('사양을 은퇴시켰습니다.')).toBeInTheDocument()
    expect(within(flavorRow('메모리 최적화')).getByText('은퇴')).toBeInTheDocument()
  })

  test('사양을 추가하고, 이름이 중복되면 422 필드 오류를 보여준다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    await findFlavorRow('컴퓨팅 최적화')
    await user.click(screen.getByRole('button', { name: '사양 추가' }))

    let dialog = await screen.findByRole('dialog', { name: '사양 추가' })
    // 중복 이름 → 서버 422가 이름 필드에 붙는다.
    await user.type(within(dialog).getByLabelText('이름'), 'highcpu')
    await user.type(within(dialog).getByLabelText('표시명'), '컴퓨팅 최적화 사본')
    await user.click(within(dialog).getByRole('button', { name: '추가' }))
    expect(
      await within(dialog).findByText('이미 사용 중인 사양 이름입니다.'),
    ).toBeInTheDocument()

    // 이름을 바꾸면 추가된다.
    dialog = screen.getByRole('dialog', { name: '사양 추가' })
    const name = within(dialog).getByLabelText('이름')
    await user.clear(name)
    await user.type(name, 'xlarge')
    const vcpu = within(dialog).getByLabelText('vCPU')
    await user.clear(vcpu)
    await user.type(vcpu, '8')
    await user.click(within(dialog).getByRole('button', { name: '추가' }))

    expect(await screen.findByText('사양을 추가했습니다.')).toBeInTheDocument()
    const created = flavorRow('컴퓨팅 최적화 사본')
    expect(within(created).getByText('xlarge')).toBeInTheDocument()
    expect(within(created).getByText('8 vCPU · 2 GiB · 20 GiB')).toBeInTheDocument()
  })

  test('이름 형식이 어긋나면 서버 호출 없이 막는다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    await findFlavorRow('컴퓨팅 최적화')
    await user.click(screen.getByRole('button', { name: '사양 추가' }))

    const dialog = await screen.findByRole('dialog', { name: '사양 추가' })
    await user.type(within(dialog).getByLabelText('이름'), 'Big_Flavor')
    await user.type(within(dialog).getByLabelText('표시명'), '대용량')
    await user.click(within(dialog).getByRole('button', { name: '추가' }))

    expect(
      within(dialog).getByText(/사양 이름은 소문자·숫자·하이픈만 사용해 주세요/),
    ).toBeInTheDocument()
  })

  test('SYS_MANAGER에게는 사양 변경 액션이 보이지 않는다', async () => {
    server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
    renderApp('/admin/os-images')

    const basic = await findFlavorRow('컴퓨팅 최적화')
    expect(screen.queryByRole('button', { name: '사양 추가' })).not.toBeInTheDocument()
    expect(within(basic).queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
    expect(within(basic).queryByRole('button', { name: '은퇴' })).not.toBeInTheDocument()
  })
})

describe('관리자 OS 이미지·사양 관리 — 사용 기간', () => {
  /** 기간 표를 표시명 셀 기준으로 찾는다. */
  async function findPeriodRow(displayName: string) {
    return (await screen.findByText(displayName)).closest('tr')!
  }

  /**
   * 이 화면이 존재하는 이유가 이 비대칭이다. 날짜가 절대값이라 학기마다 갱신해야 하는데,
   * 지난 항목이 보이지 않으면 이번 학기 항목이 빠졌다는 것을 알아챌 방법이 없다.
   */
  test('신청 화면이 감추는 지난 기간까지 배지와 함께 나열한다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    const past = await findPeriodRow('지난 학기')
    expect(within(past).getByText('기간 지남')).toBeInTheDocument()
    // 내린 것과 지난 것은 다른 상태다.
    expect(within(past).getByText('활성')).toBeInTheDocument()

  })

  test('기간을 추가하면 신청 화면의 선택지가 된다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    await findPeriodRow('이번 학기')
    await user.click(screen.getByRole('button', { name: '기간 추가' }))

    const dialog = await screen.findByRole('dialog', { name: '사용 기간 추가' })
    await user.type(within(dialog).getByLabelText('이름'), 'term-2027-1')
    await user.type(within(dialog).getByLabelText('표시명'), '2027학년도 1학기')
    await user.type(within(dialog).getByLabelText('종료일'), '2027-06-30')
    await user.click(within(dialog).getByRole('button', { name: '추가' }))

    expect(await screen.findByText('사용 기간을 추가했습니다.')).toBeInTheDocument()
    const created = await findPeriodRow('2027학년도 1학기')
    expect(within(created).getByText('2027-06-30')).toBeInTheDocument()
  })

  test('이름이 중복되면 서버 422가 이름 칸에 붙는다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    await findPeriodRow('이번 학기')
    await user.click(screen.getByRole('button', { name: '기간 추가' }))

    const dialog = await screen.findByRole('dialog', { name: '사용 기간 추가' })
    await user.type(within(dialog).getByLabelText('이름'), 'term')
    await user.type(within(dialog).getByLabelText('표시명'), '겹치는 학기')
    await user.click(within(dialog).getByRole('button', { name: '추가' }))

    expect(await within(dialog).findByText('이미 사용 중인 기간 이름입니다.')).toBeInTheDocument()
  })

  // 발행되는 기간은 모두 끝나는 날이 있다. 무기한을 내주는 경로는 신청 화면에만 있다.
  test('기간 수정에는 무기한이 없고 날짜만 옮긴다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/os-images')

    const row = await findPeriodRow('이번 방학')
    await user.click(within(row).getByRole('button', { name: '수정' }))

    const dialog = await screen.findByRole('dialog', { name: '사용 기간 수정' })
    expect(within(dialog).queryByRole('checkbox', { name: /무기한/ })).not.toBeInTheDocument()

    const endDate = within(dialog).getByLabelText('종료일')
    await user.clear(endDate)
    await user.type(endDate, '2027-02-28')
    await user.click(within(dialog).getByRole('button', { name: '저장' }))

    expect(await screen.findByText('사용 기간을 수정했습니다.')).toBeInTheDocument()
    expect(within(await findPeriodRow('이번 방학')).getByText('2027-02-28')).toBeInTheDocument()
  })

  test('SYS_MANAGER에게는 기간 변경 액션이 보이지 않는다', async () => {
    server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
    renderApp('/admin/os-images')

    await findPeriodRow('이번 학기')
    expect(screen.queryByRole('button', { name: '기간 추가' })).not.toBeInTheDocument()
  })
})
