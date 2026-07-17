import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { problemResponse, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { vmStore } from '../test/msw/handlers/vms'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderVm(vmId: number) {
  server.use(refreshSuccessHandler('access-student'))
  renderApp(`/console/vms/${vmId}`)
}

describe('VM 상세 — 전원 제어', () => {
  test('중지된 VM은 시작 버튼만 보이고, 확인 후 실행 중으로 갱신된다', async () => {
    const user = userEvent.setup()
    renderVm(57)

    await screen.findByRole('heading', { name: 'web-lab' })
    expect(screen.getByRole('button', { name: '시작' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '재부팅' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 종료' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '시작' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 시작' })
    await user.click(within(dialog).getByRole('button', { name: '시작' }))

    expect(
      await screen.findByText('VM 시작 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('실행 중')).toBeInTheDocument()
  })

  test('실행 중 VM은 종료·재부팅·강제 종료가 보이고 시작은 없다', async () => {
    renderVm(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('button', { name: '종료' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '재부팅' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '강제 종료' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '시작' })).not.toBeInTheDocument()
  })

  test('강제 종료 확인 모달은 데이터 손상 경고를 보여준다', async () => {
    const user = userEvent.setup()
    renderVm(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '강제 종료' }))

    const dialog = await screen.findByRole('dialog', { name: 'VM 강제 종료' })
    expect(
      within(dialog).getByText(/파일 시스템과 데이터가 손상될 수 있습니다/),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '강제 종료' }))
    expect(await screen.findByText('중지됨')).toBeInTheDocument()
    // 종료된 뒤에는 시작 버튼으로 바뀐다.
    expect(await screen.findByRole('button', { name: '시작' })).toBeInTheDocument()
  })

  test('NEEDS_ADMIN VM은 조작 버튼 없이 관리자 확인 안내만 보여준다', async () => {
    renderVm(58)

    await screen.findByRole('heading', { name: 'stuck-vm' })
    expect(screen.getByText('관리자 확인 중입니다')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '시작' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '재부팅' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 종료' })).not.toBeInTheDocument()
  })
})

describe('VM 상세 — 진행 패널', () => {
  test('NEEDS_ADMIN 태스크는 단계·시도·마지막 오류를 보여준다', async () => {
    renderVm(58)

    await screen.findByRole('heading', { name: 'stuck-vm' })
    expect(screen.getByText('VM 생성 진행 상황')).toBeInTheDocument()
    expect(screen.getByText(/단계 6\/10 · cloud-init 설정 중 \(시도 3회\)/)).toBeInTheDocument()
    expect(screen.getByText('관리자 개입이 필요합니다')).toBeInTheDocument()
    expect(
      screen.getByText(/Proxmox API 응답 시간 초과 \(qm set 5058\)/),
    ).toBeInTheDocument()
  })

  test('생성 중에는 진행 패널이 보이고, 완료되면 폴링으로 사라진다', async () => {
    renderVm(55)

    await screen.findByRole('heading', { name: 'capstone-team3-api' })
    expect(screen.getByText(/템플릿 복제 중/)).toBeInTheDocument()

    // mock 프로비저닝 완료 → 실행 중으로 갱신되고 패널이 사라진다.
    expect(await screen.findByText('실행 중')).toBeInTheDocument()
    expect(screen.queryByText('VM 생성 진행 상황')).not.toBeInTheDocument()
  })
})

describe('VM 상세 — 이벤트 이력', () => {
  test('이벤트를 한국어 라벨·수행자와 함께 나열하고, 전원 조작 후 갱신된다', async () => {
    const user = userEvent.setup()
    renderVm(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    const history = (await screen.findByText('이벤트 이력')).closest('div')!
      .parentElement as HTMLElement
    expect(await within(history).findByText('생성')).toBeInTheDocument()
    expect(within(history).getByText('승인 신청 90에 따라 자동 생성')).toBeInTheDocument()
    expect(within(history).getByText('시스템')).toBeInTheDocument()
    expect(within(history).getByText('사용자 #42')).toBeInTheDocument()

    // 재부팅을 접수하면 무효화로 이벤트 이력에 REBOOT가 추가된다.
    await user.click(screen.getByRole('button', { name: '재부팅' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 재부팅' })
    await user.click(within(dialog).getByRole('button', { name: '재부팅' }))
    expect(await within(history).findByText('재부팅')).toBeInTheDocument()
  })
})

describe('VM 상세 — 삭제 흐름', () => {
  test('삭제 모달은 백업 고지를 보여주고 이름이 일치해야 접수할 수 있다', async () => {
    const user = userEvent.setup()
    renderVm(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: 'VM 삭제' }))

    const dialog = await screen.findByRole('dialog', { name: 'VM 삭제' })
    expect(
      within(dialog).getByText(
        /플랫폼은 VM 데이터를 백업하지 않습니다\. 데이터 보호와 백업은 사용자 책임이며, 삭제된 VM의 데이터는 복구할 수 없습니다\./,
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/복구가 필요하면 관리자에게 문의하세요/),
    ).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: '삭제 접수' })
    expect(confirm).toBeDisabled()
    const input = within(dialog).getByRole('textbox')
    await user.type(input, 'algo-judg')
    expect(confirm).toBeDisabled()
    await user.type(input, 'e')
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    // 접수 후: 삭제 예정 배너 + 삭제 중 상태, 사용자에게 취소 버튼은 없다.
    expect(await screen.findByText('삭제가 접수된 VM입니다')).toBeInTheDocument()
    expect(screen.getByText('삭제 중')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /취소/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'VM 삭제' })).not.toBeInTheDocument()
  })

  test('삭제 예정 VM은 배너에 취소 버튼 없이 관리자 문의 안내만 보여준다', async () => {
    renderVm(60)

    await screen.findByRole('heading', { name: 'retiring-vm' })
    expect(screen.getByText('삭제가 접수된 VM입니다')).toBeInTheDocument()
    expect(screen.getByText(/영구 파기될 예정입니다/)).toBeInTheDocument()
    expect(
      screen.getByText(/복구가 필요하면 관리자에게 문의하세요/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /취소/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'VM 삭제' })).not.toBeInTheDocument()
  })

  test('ERROR VM은 삭제만 가능하며 접수 즉시 삭제된다', async () => {
    const user = userEvent.setup()
    renderVm(59)

    await screen.findByRole('heading', { name: 'broken-vm' })
    expect(screen.getByText(/생성에 실패한 VM입니다/)).toBeInTheDocument()
    expect(screen.getByText(/접수 즉시 삭제됩니다/)).toBeInTheDocument()
    // 전원 제어는 어떤 버튼도 노출되지 않는다.
    expect(screen.queryByRole('button', { name: '시작' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'VM 삭제' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 삭제' })
    await user.type(within(dialog).getByRole('textbox'), 'broken-vm')
    await user.click(within(dialog).getByRole('button', { name: '즉시 삭제' }))

    expect(
      await screen.findByText('이 VM은 삭제되었습니다. 기록 조회만 가능합니다.'),
    ).toBeInTheDocument()
    expect(screen.getByText('삭제됨')).toBeInTheDocument()
  })
})

describe('VM 상세 — 비밀번호 열람·재설정 (v0.7.0 상시 재열람)', () => {
  test('비밀번호를 열람하고, 닫았다가 다시 열람할 수 있다', async () => {
    const user = userEvent.setup()
    renderVm(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByText('VM 비밀번호')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '비밀번호 보기' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 비밀번호 확인' })
    expect(
      await within(dialog).findByText('x7GmQ4vRk2LpWn9sCtYb8Zed'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('student')).toBeInTheDocument()

    // 복사 버튼은 클립보드로만 복사한다.
    await user.click(within(dialog).getByRole('button', { name: '비밀번호 복사' }))
    expect(await navigator.clipboard.readText()).toBe('x7GmQ4vRk2LpWn9sCtYb8Zed')

    // 비밀번호는 어떤 웹 스토리지에도 저장되지 않는다.
    expect(JSON.stringify({ ...localStorage })).not.toContain('x7GmQ4vRk2Lp')
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('x7GmQ4vRk2Lp')

    // 닫아도 버튼이 남고, 다시 열람할 수 있다 (상시 재열람).
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '비밀번호 보기' }))
    expect(
      await within(await screen.findByRole('dialog', { name: 'VM 비밀번호 확인' }))
        .findByText('x7GmQ4vRk2LpWn9sCtYb8Zed'),
    ).toBeInTheDocument()
  })

  test('저장된 비밀번호가 없으면(410) 관리자 문의 안내를 보여준다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/vms/:vmId/initial-password', () =>
        problemResponse({
          type: 'about:blank',
          title: '초기 비밀번호를 열람할 수 없습니다',
          status: 410,
          detail: '저장된 초기 비밀번호가 없습니다. 비밀번호가 필요하면 관리자에게 문의해 주세요.',
          code: 'VM_PASSWORD_ALREADY_VIEWED',
        }),
      ),
    )
    renderVm(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '비밀번호 보기' }))

    expect(
      await screen.findByText(/저장된 초기 비밀번호가 없습니다/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

/* ─── 만료 표면화 (M5) ─── */

/** 오늘 기준 offset일 뒤의 로컬 날짜 문자열 (YYYY-MM-DD). */
function localDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('VM 상세 — 사용 기간 만료 표면화', () => {
  test('종료일이 7일 이내면 사용 기간 옆에 D-day 배지를 보여준다', async () => {
    const base = vmStore.find((v) => v.id === 56)!
    server.use(
      http.get('*/api/v1/vms/56', () =>
        HttpResponse.json({ ...base, endDate: localDate(3) }),
      ),
    )
    renderVm(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByText('D-3')).toBeInTheDocument()
    expect(screen.queryByText(/사용 기간이 만료되어 중지되었습니다/)).not.toBeInTheDocument()
  })

  test('만료로 자동 중지된 VM은 경고 안내와 D+n 배지를 보여준다', async () => {
    const base = vmStore.find((v) => v.id === 57)!
    server.use(
      http.get('*/api/v1/vms/57', () =>
        HttpResponse.json({
          ...base,
          status: 'STOPPED',
          endDate: localDate(-2),
          expiryStoppedAt: new Date().toISOString(),
        }),
      ),
    )
    renderVm(57)

    await screen.findByRole('heading', { name: 'web-lab' })
    expect(
      await screen.findByText(/사용 기간이 만료되어 중지되었습니다/),
    ).toBeInTheDocument()
    expect(screen.getByText('D+2')).toBeInTheDocument()
  })

  test('종료일이 충분히 남으면 D-day 배지를 노출하지 않는다', async () => {
    const base = vmStore.find((v) => v.id === 56)!
    server.use(
      http.get('*/api/v1/vms/56', () =>
        HttpResponse.json({ ...base, endDate: localDate(60) }),
      ),
    )
    renderVm(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.queryByText(/^D[-+]/)).not.toBeInTheDocument()
  })
})

describe('VM 상세 — 만료 VM 시작 거부 (409 VM_EXPIRED)', () => {
  test('만료 자동 중지 VM은 시작 시도 시 409 상세 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    // 픽스처 46(expired-lab): STOPPED + expiryStoppedAt 설정 — 시작 버튼은 보이지만
    // 계약상 기간 연장 전까지 409 VM_EXPIRED로 거부된다.
    renderVm(46)

    await screen.findByRole('heading', { name: 'expired-lab' })
    await user.click(screen.getByRole('button', { name: '시작' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 시작' })
    await user.click(within(dialog).getByRole('button', { name: '시작' }))

    expect(
      await screen.findByText(
        '사용 기간이 만료되어 시작할 수 없습니다. 연장이 필요하면 관리자에게 문의해 주세요.',
      ),
    ).toBeInTheDocument()
    // 시작되지 않고 중지 상태 그대로다.
    expect(screen.getByRole('button', { name: '시작' })).toBeInTheDocument()
  })
})
