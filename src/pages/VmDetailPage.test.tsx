import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test, vi } from 'vitest'
import { problemResponse, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { vmMetricsFixture } from '../test/msw/handlers/metrics'
import { vmDetailAs, vmStore } from '../test/msw/handlers/vms'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { seedVmSshKey } from '../test/msw/handlers/vm-ssh-key'
import { closeTerminalWindows } from '../terminal/openTerminalWindow'
import { VM_METRICS_UNAVAILABLE_ID, VM_NOT_PROVISIONED_ID, uuid } from '../test/msw/ids'

/** VM 상세를 연다. tab을 주면 해당 탭 딥링크(?tab=)로 진입한다. */
function renderVm(
  vmId: string,
  tab?: 'publish' | 'settings' | 'activity' | 'monitoring',
) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/vms/${vmId}${tab ? `?tab=${tab}` : ''}`)
}

describe('VM 상세 — 전원 제어', () => {
  test('중지된 VM은 시작 버튼만 보이고, 확인 후 실행 중으로 갱신된다', async () => {
    const user = userEvent.setup()
    renderVm(uuid(57))

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
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('button', { name: '종료' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '재부팅' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '강제 종료' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '시작' })).not.toBeInTheDocument()
  })

  test('강제 종료 확인 모달은 데이터 손상 경고를 보여준다', async () => {
    const user = userEvent.setup()
    renderVm(uuid(56))

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
    renderVm(uuid(58))

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
    renderVm(uuid(58))

    await screen.findByRole('heading', { name: 'stuck-vm' })
    expect(screen.getByText('VM 생성 진행 상황')).toBeInTheDocument()
    expect(screen.getByText(/단계 6\/10 · cloud-init 설정 중 \(시도 3회\)/)).toBeInTheDocument()
    expect(screen.getByText('관리자 개입이 필요합니다')).toBeInTheDocument()
    expect(
      screen.getByText(/Proxmox API 응답 시간 초과 \(qm set 5058\)/),
    ).toBeInTheDocument()
  })

  test('생성 중에는 진행 패널이 보이고, 완료되면 폴링으로 사라진다', async () => {
    renderVm(VM_NOT_PROVISIONED_ID)

    await screen.findByRole('heading', { name: 'capstone-team3-api' })
    expect(screen.getByText(/OS 이미지 복제 중/)).toBeInTheDocument()

    // mock 프로비저닝 완료 → 실행 중으로 갱신되고 패널이 사라진다.
    expect(await screen.findByText('실행 중')).toBeInTheDocument()
    expect(screen.queryByText('VM 생성 진행 상황')).not.toBeInTheDocument()
  })
})

describe('VM 상세 — 이벤트 이력', () => {
  test('이벤트를 한국어 라벨·수행자와 함께 나열하고, 전원 조작 후 갱신된다', async () => {
    const user = userEvent.setup()
    renderVm(uuid(56), 'activity')

    await screen.findByRole('heading', { name: 'algo-judge' })
    const history = (await screen.findByText('이벤트 이력')).closest('div')!
      .parentElement as HTMLElement
    expect(await within(history).findByText('생성')).toBeInTheDocument()
    expect(within(history).getByText('승인 신청 90에 따라 자동 생성')).toBeInTheDocument()
    expect(within(history).getByText('시스템')).toBeInTheDocument()
    // 동료가 한 일은 이름으로, 관리자 개입은 개인 신원 없이 "관리자"로.
    expect(within(history).getByText('홍길동')).toBeInTheDocument()
    expect(within(history).getByText('관리자')).toBeInTheDocument()
    expect(within(history).queryByText('운영 담당자')).not.toBeInTheDocument()
    // 수행 화면이 기록되기 전 행은 이름 없이 "사용자". 서버가 이름을 비워 보낸다.
    expect(within(history).getByText('사용자')).toBeInTheDocument()

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
    renderVm(uuid(56), 'settings')

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
    renderVm(uuid(60))

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
    renderVm(VM_METRICS_UNAVAILABLE_ID, 'settings')

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

describe('VM 상세 — 비밀번호 (v0.8.0)', () => {
  test('비밀번호를 열람하고, 닫았다가 다시 열람할 수 있다', async () => {
    const user = userEvent.setup()
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('button', { name: '비밀번호 보기' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '비밀번호 보기' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 비밀번호' })
    expect(
      await within(dialog).findByText('x7GmQ4vRk2LpWn9sCtYb8Zed'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('ubuntu')).toBeInTheDocument()

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
      await within(await screen.findByRole('dialog', { name: 'VM 비밀번호' }))
        .findByText('x7GmQ4vRk2LpWn9sCtYb8Zed'),
    ).toBeInTheDocument()
  })

  test('열람 권한이 없으면(passwordRevealAllowed=false) 버튼 대신 제한 안내를 보여준다', async () => {
    server.use(vmDetailAs(uuid(56), 'MEMBER', { passwordRevealAllowed: false }))
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(
      await screen.findByText(/비밀번호 열람이 제한되어 있습니다/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '비밀번호 보기' })).not.toBeInTheDocument()
    // 참여자는 설정을 바꿀 수 없으므로 재생성 버튼도 없다 (settingsEditAllowed=false).
    expect(screen.queryByRole('button', { name: '비밀번호 재생성' })).not.toBeInTheDocument()
  })

  test('편집자 이상은 비밀번호를 재생성하고 새 비밀번호를 확인할 수 있다', async () => {
    const user = userEvent.setup()
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '비밀번호 재생성' }))

    const dialog = await screen.findByRole('dialog', { name: '비밀번호 재생성' })
    expect(within(dialog).getByText('기존 비밀번호가 즉시 무효화됩니다.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '재생성' }))

    // 재생성 성공 → 결과 모달에 새 비밀번호가 표시된다.
    const result = await screen.findByRole('dialog', { name: 'VM 비밀번호' })
    expect(
      await within(result).findByText('nB4tWq8xKm2ZrPv6JcYh3Sdf'),
    ).toBeInTheDocument()
  })

  test('저장된 비밀번호가 없으면(410) 재생성 복구 안내를 보여준다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/vms/:vmId/password', () =>
        problemResponse({
          type: 'about:blank',
          title: '비밀번호를 열람할 수 없습니다',
          status: 410,
          detail: '저장된 비밀번호가 없습니다. 비밀번호 재생성으로 새 비밀번호를 만들 수 있습니다.',
          code: 'VM_PASSWORD_ALREADY_VIEWED',
        }),
      ),
    )
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '비밀번호 보기' }))

    expect(await screen.findByText(/저장된 비밀번호가 없습니다/)).toBeInTheDocument()
    // 열람 모달은 닫히고, 재생성 버튼은 남아 복구 경로를 제공한다.
    expect(screen.queryByRole('dialog', { name: 'VM 비밀번호' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '비밀번호 재생성' })).toBeInTheDocument()
  })
})

/* ─── 만료 표면화 ─── */

/** 오늘 기준 offset일 뒤의 로컬 날짜 문자열 (YYYY-MM-DD). */
function localDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('VM 상세 — 사용 기간 만료 표면화', () => {
  test('종료일이 7일 이내면 사용 기간 옆에 D-day 배지를 보여준다', async () => {
    const base = vmStore.find((v) => v.id === uuid(56))!
    server.use(
      http.get(`*/api/v1/vms/${uuid(56)}`, () =>
        HttpResponse.json({ ...base, endDate: localDate(3) }),
      ),
    )
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByText('D-3')).toBeInTheDocument()
    expect(screen.queryByText(/사용 기간이 만료되어 중지되었습니다/)).not.toBeInTheDocument()
  })

  test('만료로 자동 중지된 VM은 경고 안내와 D+n 배지를 보여준다', async () => {
    const base = vmStore.find((v) => v.id === uuid(57))!
    server.use(
      http.get(`*/api/v1/vms/${uuid(57)}`, () =>
        HttpResponse.json({
          ...base,
          status: 'STOPPED',
          endDate: localDate(-2),
          expiryStoppedAt: new Date().toISOString(),
        }),
      ),
    )
    renderVm(uuid(57))

    await screen.findByRole('heading', { name: 'web-lab' })
    expect(
      await screen.findByText(/사용 기간이 만료되어 중지되었습니다/),
    ).toBeInTheDocument()
    expect(screen.getByText('D+2')).toBeInTheDocument()
  })

  test('종료일이 충분히 남으면 D-day 배지를 노출하지 않는다', async () => {
    const base = vmStore.find((v) => v.id === uuid(56))!
    server.use(
      http.get(`*/api/v1/vms/${uuid(56)}`, () =>
        HttpResponse.json({ ...base, endDate: localDate(60) }),
      ),
    )
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.queryByText(/^D[-+]/)).not.toBeInTheDocument()
  })
})

describe('VM 상세 — 만료 VM 시작 거부 (409 VM_EXPIRED)', () => {
  test('만료 자동 중지 VM은 시작 시도 시 409 상세 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    // 픽스처 46(expired-lab): STOPPED + expiryStoppedAt 설정 — 시작 버튼은 보이지만
    // 계약상 기간 연장 전까지 409 VM_EXPIRED로 거부된다.
    renderVm(uuid(46))

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

/* ─── 접속 카드 (웹 터미널 + VM별 SSH 키) ─── */

describe('VM 상세 — 접속', () => {
  test('키를 발급받기 전에는 발급 버튼을 보여준다', async () => {
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(
      await screen.findByText('아직 이 가상머신의 SSH 키를 발급받지 않았습니다.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'SSH 키 발급 및 다운로드' }),
    ).toBeInTheDocument()
  })

  test('발급하면 개인키를 내려주고 지문과 접속 명령이 나타난다', async () => {
    const click = vi.fn()
    const createElement = document.createElement.bind(document)
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag)
      if (tag === 'a') el.click = click
      return el
    })
    try {
      renderVm(uuid(56))
      await screen.findByRole('heading', { name: 'algo-judge' })
      await userEvent.click(
        await screen.findByRole('button', { name: 'SSH 키 발급 및 다운로드' }),
      )

      // 다운로드가 실제로 트리거됐다 (개인키는 화면에 남지 않는다).
      await waitFor(() => expect(click).toHaveBeenCalled())
      expect(
        await screen.findByText('SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU'),
      ).toBeInTheDocument()
      // 같은 명령이 카드와 (접힌) 안내 3단계에 함께 나온다.
      expect(
        screen.getAllByText(
          'ssh -i ~/.ssh/pickle-algo-judge.pem -o IdentitiesOnly=yes algo-judge@ssh.pcl.kr',
        ),
      ).not.toHaveLength(0)
    } finally {
      spy.mockRestore()
    }
  })

  test('재발급은 경고 모달을 거치고 지문을 교체한다', async () => {
    seedVmSshKey(uuid(56))
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    const before = await screen.findByText(
      'SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU',
    )
    expect(before).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '키 재발급' }))
    expect(
      await screen.findByText(/기존 키는 즉시 무효화되어/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '재발급하고 내려받기' }))

    expect(
      await screen.findByText('SHA256:hZ9Kk3nQ2wErTyUiOpAsDfGhJkLzXcVbNmQwErTyUiO'),
    ).toBeInTheDocument()
  })

  test('삭제하면 발급 버튼으로 돌아온다', async () => {
    seedVmSshKey(uuid(56))
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    await userEvent.click(await screen.findByRole('button', { name: '키 삭제' }))
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))

    expect(
      await screen.findByRole('button', { name: 'SSH 키 발급 및 다운로드' }),
    ).toBeInTheDocument()
  })

  test('접속 권한이 없으면 접속 카드 자체가 없다', async () => {
    server.use(vmDetailAs(uuid(56), 'VIEWER', { status: 'RUNNING' }))
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.queryByText('접속')).not.toBeInTheDocument()
  })
})

/* ─── 웹 터미널 열기 버튼 ─── */

describe('VM 상세 — 웹 터미널 열기', () => {
  test('RUNNING + 접속 권한이 있으면 웹 터미널 열기 버튼을 보여준다', async () => {
    server.use(vmDetailAs(uuid(56), 'MEMBER', { status: 'RUNNING' }))
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(await screen.findByRole('button', { name: '웹 터미널 열기' })).toBeInTheDocument()
  })

  test('STOPPED VM에서는 버튼이 사유와 함께 비활성이다', async () => {
    renderVm(uuid(57)) // web-lab, STOPPED, OWNER

    await screen.findByRole('heading', { name: 'web-lab' })
    expect(await screen.findByRole('button', { name: '웹 터미널 열기' })).toBeDisabled()
    expect(screen.getByText('가상머신이 실행 중일 때만 열 수 있습니다.')).toBeInTheDocument()
  })

  test('버튼을 누르면 팝업 창을 연다 (콘솔 라우트 이동이 아니다)', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({
      closed: false,
      focus: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as Window)
    try {
      server.use(vmDetailAs(uuid(56), 'MEMBER', { status: 'RUNNING' }))
      renderVm(uuid(56))

      const button = await screen.findByRole('button', { name: '웹 터미널 열기' })
      await userEvent.click(button)
      expect(open).toHaveBeenCalledWith(
        `/terminal/${uuid(56)}`,
        `pickle-terminal-${uuid(56)}`,
        expect.any(String),
      )
    } finally {
      open.mockRestore()
      closeTerminalWindows()
    }
  })

  test('팝업이 차단되면 해제 안내를 띄운다', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    try {
      server.use(vmDetailAs(uuid(56), 'MEMBER', { status: 'RUNNING' }))
      renderVm(uuid(56))

      await userEvent.click(await screen.findByRole('button', { name: '웹 터미널 열기' }))
      expect(await screen.findByText(/팝업 차단을 해제/)).toBeInTheDocument()
    } finally {
      open.mockRestore()
      closeTerminalWindows()
    }
  })

  test('접속 권한이 없으면(accessAllowed=false) 접속 카드가 통째로 없다', async () => {
    // 열람자는 상태만 볼 수 있다 — 안으로 들어가는 수단은 주어지지 않는다.
    server.use(vmDetailAs(uuid(56), 'VIEWER', { status: 'RUNNING' }))
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(
      screen.queryByRole('button', { name: '웹 터미널 열기' }),
    ).not.toBeInTheDocument()
  })
})

/* ─── VM별 설정 ─── */

describe('VM 상세 — VM 설정', () => {
  test('편집자 이상은 설정을 보고, 비밀번호 SSH를 켜면 2차 경고 후 적용된다', async () => {
    const user = userEvent.setup()
    renderVm(uuid(56), 'settings') // OWNER, RUNNING

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(await screen.findByText('VM 설정')).toBeInTheDocument()
    expect(
      screen.getByText('설정 변경은 모두 감사 로그에 기록됩니다.'),
    ).toBeInTheDocument()

    // OFF→ON 토글 → 2차 경고 모달.
    await user.click(screen.getByRole('checkbox', { name: '비밀번호 SSH 허용' }))
    const dialog = await screen.findByRole('dialog', { name: '비밀번호 SSH 허용' })
    expect(
      within(dialog).getByText(/누가 접속했는지 개인을 식별할 수 없습니다/),
    ).toBeInTheDocument()
    // 비밀번호 경로는 접근 목록을 검사하지 않는다 — 회수해도 막히지 않음을 알린다.
    expect(
      within(dialog).getByText(/이 경로는 접근 권한 목록을 검사하지 않습니다/),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/접근 권한을 회수한 뒤에도 접속할 수 있습니다/),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '허용' }))
    // 적용 후 배지가 '허용'으로 바뀐다.
    expect(await screen.findByText('허용')).toBeInTheDocument()
  })

  test('요청자 역할이 부족한 설정은 비활성 + 필요 역할 안내를 보여준다', async () => {
    server.use(
      http.get(`*/api/v1/vms/${uuid(56)}/settings`, () =>
        HttpResponse.json([
          {
            key: 'password_reveal_min_role',
            value: 'MEMBER',
            valueType: 'ENUM',
            allowedValues: ['MEMBER', 'EDITOR', 'OWNER'],
            defaultValue: 'MEMBER',
            label: '비밀번호 열람 최소 역할',
            description: 'VM 비밀번호를 열람할 수 있는 최소 워크스페이스 역할입니다.',
            requiredRole: 'OWNER',
            editable: false,
            updatedByName: null,
            updatedAt: null,
          },
        ]),
      ),
    )
    renderVm(uuid(56), 'settings')

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(
      await screen.findByText('『소유자』만 변경할 수 있습니다.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '비밀번호 열람 최소 역할' })).toBeDisabled()
  })

  test('참여자(MEMBER)에게는 VM 설정 섹션이 노출되지 않는다', async () => {
    server.use(vmDetailAs(uuid(56), 'MEMBER', { passwordRevealAllowed: true }))
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.queryByText('VM 설정')).not.toBeInTheDocument()
  })
})

/* ─── 탭 내비게이션 (콘솔 UX 개편) ─── */

describe('VM 상세 — 탭', () => {
  test('기본은 개요 탭이고, 탭 클릭으로 영역이 전환된다', async () => {
    const user = userEvent.setup()
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('tab', { name: '개요' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('접속')).toBeInTheDocument()
    expect(screen.queryByText('이벤트 이력')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '활동' }))
    expect(await screen.findByText('이벤트 이력')).toBeInTheDocument()
    expect(screen.queryByText('SSH 접속')).not.toBeInTheDocument()
  })

  test('참여자(MEMBER)에게는 설정 탭 자체가 노출되지 않는다', async () => {
    server.use(vmDetailAs(uuid(56), 'MEMBER', { passwordRevealAllowed: true }))
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('tab', { name: '개요' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '설정' })).not.toBeInTheDocument()
  })
})

/* ─── 사용량(모니터링) 탭 ─── */

describe('VM 상세 — 모니터링', () => {
  test('모니터링 탭은 네 개의 사용량 차트와 갱신 시각을 보여준다', async () => {
    renderVm(uuid(56), 'monitoring')

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('tab', { name: '모니터링' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(await screen.findByRole('heading', { name: 'CPU' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '메모리' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '네트워크' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '디스크 I/O' })).toBeInTheDocument()
    // 차트마다 제목이 그림 영역의 접근 가능한 이름이 된다.
    expect(screen.getByRole('img', { name: 'CPU' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '디스크 I/O' })).toBeInTheDocument()
    expect(screen.getByText(/마지막 갱신/)).toBeInTheDocument()
    // 값 읽는 창구는 차트뿐이다 — 접이식 표는 두지 않는다.
    expect(screen.queryByText('표로 보기')).not.toBeInTheDocument()
    // 잰 값이 있는 구간에는 '값이 없다'는 안내를 붙이지 않는다.
    expect(
      screen.queryByText('이 구간 동안 VM이 실행되지 않아 측정된 값이 없습니다.'),
    ).not.toBeInTheDocument()
  })

  test('캔버스를 못 쓰는 브라우저에서는 빈 판 대신 이유를 적는다', async () => {
    // jsdom에는 canvas 2d 컨텍스트가 없다 — 그리지 못하는 브라우저와 같은 경로다.
    renderVm(uuid(56), 'monitoring')

    const chart = await screen.findByRole('img', { name: 'CPU' })
    expect(chart).toHaveAccessibleDescription(
      '이 브라우저에서는 차트를 그릴 수 없습니다.',
    )
    expect(
      within(chart).getByText('이 브라우저에서는 차트를 그릴 수 없습니다.'),
    ).toBeInTheDocument()
  })

  test('구간 내내 잰 값이 없으면 빈 차트만 남기지 않고 이유를 밝힌다', async () => {
    // 한 시간 내내 꺼져 있던 VM — 점은 오지만 값이 전부 비어 있다.
    server.use(
      http.get('*/api/v1/vms/:vmId/metrics', ({ request }) => {
        const timeframe = new URL(request.url).searchParams.get('timeframe') ?? 'HOUR'
        const fixture = vmMetricsFixture(timeframe)
        return HttpResponse.json(
          {
            ...fixture,
            points: fixture.points.map((point) => ({
              time: point.time,
              cpu: null,
              memBytes: null,
              memHostBytes: null,
              maxmemBytes: null,
              netinBps: null,
              netoutBps: null,
              diskReadBps: null,
              diskWriteBps: null,
            })),
          },
          { status: 200 },
        )
      }),
    )
    renderVm(uuid(56), 'monitoring')

    expect(
      await screen.findByText('이 구간 동안 VM이 실행되지 않아 측정된 값이 없습니다.'),
    ).toBeInTheDocument()
    // 안내가 차트를 대신하지는 않는다 — 시간 축이 있는 빈 차트는 그대로 둔다.
    expect(screen.getByRole('heading', { name: 'CPU' })).toBeInTheDocument()
  })

  test('개요에서 모니터링 탭으로 전환하고 조회 구간을 바꿀 수 있다', async () => {
    const user = userEvent.setup()
    renderVm(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('tab', { name: '모니터링' }))

    const switcher = await screen.findByRole('group', { name: '조회 구간' })
    expect(within(switcher).getByRole('button', { name: '1시간' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(within(switcher).getByRole('button', { name: '1주' }))
    expect(within(switcher).getByRole('button', { name: '1주' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // 구간을 바꿔도 차트는 유지된다 (이전 자료를 들고 있다가 교체).
    expect(await screen.findByRole('heading', { name: 'CPU' })).toBeInTheDocument()
  })

  test('아직 프로비저닝되지 않은 VM은 차분한 안내만 보여준다', async () => {
    renderVm(VM_NOT_PROVISIONED_ID, 'monitoring')

    expect(
      await screen.findByText('VM이 준비되면 사용량 데이터가 표시됩니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'CPU' })).not.toBeInTheDocument()
  })

  test('하이퍼바이저에 물어볼 수 없으면 오류가 아니라 차분한 안내로 알린다', async () => {
    renderVm(VM_METRICS_UNAVAILABLE_ID, 'monitoring')

    const notice = await screen.findByText(
      /하이퍼바이저가 응답하지 않아 사용량을 표시할 수 없습니다/,
    )
    // 잴 수 없다는 사실은 장애 경보가 아니다 — 붉은 경보로 띄우지 않는다.
    expect(notice.closest('[role="alert"]')).toBeNull()
    // 대신 멈춰 있지도 않다 — 계속 물어보는 중임을 문구가 밝힌다.
    expect(notice).toHaveTextContent('다시 시도하는 중입니다')
  })

  test('삭제 중인 VM은 모니터링 탭을 아예 열지 않는다', async () => {
    // 삭제 중에도 하이퍼바이저 식별자는 남아 있어, 탭을 두면 사라지는 게스트를
    // 30초마다 조회해 실패한다.
    renderVm(uuid(60), 'monitoring')

    await screen.findByRole('heading', { name: 'retiring-vm' })
    expect(screen.queryByRole('tab', { name: '모니터링' })).not.toBeInTheDocument()
    // 딥링크로 들어와도 개요로 되돌아간다.
    expect(screen.getByRole('tab', { name: '개요' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByRole('heading', { name: 'CPU' })).not.toBeInTheDocument()
  })

  test('중지된 VM에는 모니터링 탭이 그대로 있다', async () => {
    renderVm(uuid(57))

    await screen.findByRole('heading', { name: 'web-lab' })
    expect(screen.getByRole('tab', { name: '모니터링' })).toBeInTheDocument()
  })
})
