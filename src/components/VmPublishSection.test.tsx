import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { vmStore } from '../test/msw/handlers/vms'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

/** 학생 세션으로 VM 상세를 연다 (그룹 12=OWNER, 그룹 15=MEMBER). */
function renderVm(vmId: number) {
  server.use(refreshSuccessHandler('access-student'))
  renderApp(`/console/vms/${vmId}`)
}

/** 'HTTP 서비스 공개' 카드 요소를 반환한다. */
async function publishCard(): Promise<HTMLElement> {
  const title = await screen.findByRole('heading', { name: 'HTTP 서비스 공개' })
  return title.closest('div')!.parentElement as HTMLElement
}

describe('VM 공개 — 허가·권한 게이트', () => {
  test('HTTP 공개 미허가 VM은 공개 폼 없이 안내만 보여준다', async () => {
    renderVm(57) // web-lab: grantHttp=false

    await screen.findByRole('heading', { name: 'web-lab' })
    expect(await screen.findByText('HTTP 공개가 허가되지 않았습니다')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'HTTP 서비스 공개' })).not.toBeInTheDocument()
  })

  test('MEMBER는 공개 폼 없이 읽기 전용 안내만 본다', async () => {
    renderVm(56) // algo-judge: 그룹 15 MEMBER, 허가됨, 미공개

    await screen.findByRole('heading', { name: 'algo-judge' })
    const card = await publishCard()
    expect(
      await within(card).findByText(/공개는 그룹의 소유자·관리자만/),
    ).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'HTTP 서비스 공개' })).not.toBeInTheDocument()
    // 플랫폼 서브도메인 자유 입력 필드는 존재하지 않는다.
    expect(within(card).queryByLabelText(/서브도메인/)).not.toBeInTheDocument()
  })
})

describe('VM 공개 — 처음 공개(플랫폼 서브도메인)', () => {
  test('OWNER가 포트를 공개하면 라우트가 PENDING→APPLIED로 수렴한다', async () => {
    const user = userEvent.setup()
    renderVm(55) // capstone-team3-api: 그룹 12 OWNER, 허가됨. CREATING→RUNNING 후 공개.

    await screen.findByRole('heading', { name: 'capstone-team3-api' })
    // 생성 완료(폴링)까지 대기 후 공개 폼이 활성화된다.
    await screen.findByText('실행 중')
    const card = await publishCard()

    // 플랫폼 서브도메인은 자유 입력이 아니라 안내만 노출한다 (운영자 결정).
    expect(
      within(card).getByText(/신청 승인 시 관리자가 부여한 이름/),
    ).toBeInTheDocument()
    expect(within(card).queryByLabelText(/서브도메인/)).not.toBeInTheDocument()

    const port = within(card).getByLabelText('공개 포트')
    await user.clear(port)
    await user.type(port, '8080')
    await user.click(within(card).getByRole('button', { name: 'HTTP 서비스 공개' }))

    // 접수 직후 라우트 PENDING → 폴링으로 APPLIED.
    expect(
      await within(card).findByRole('link', { name: 'capstone-team3-api-a1b2.pickle.pnuops.com' }),
    ).toBeInTheDocument()
    expect(await within(card).findByText('적용됨')).toBeInTheDocument()
    expect(within(card).getByText('8080')).toBeInTheDocument()
  })

  test('SSH 포트(22) 공개는 거부되고 필드 오류를 보여준다 (클라이언트 사전 검증)', async () => {
    const user = userEvent.setup()
    renderVm(55)

    await screen.findByRole('heading', { name: 'capstone-team3-api' })
    await screen.findByText('실행 중')
    const card = await publishCard()

    const port = within(card).getByLabelText('공개 포트')
    await user.clear(port)
    await user.type(port, '22')
    await user.click(within(card).getByRole('button', { name: 'HTTP 서비스 공개' }))

    expect(
      await within(card).findByText('VM의 SSH 포트(22)는 공개할 수 없습니다.'),
    ).toBeInTheDocument()
  })
})

describe('VM 공개 — 변경·해제', () => {
  test('OWNER는 포트를 변경할 수 있다', async () => {
    const user = userEvent.setup()
    renderVm(63) // shop-app: 그룹 12 OWNER, 공개됨(CUSTOM)

    await screen.findByRole('heading', { name: 'shop-app' })
    const card = await publishCard()
    await within(card).findByRole('link', { name: 'shop.example.com' })

    const port = within(card).getByLabelText('공개 포트')
    await user.clear(port)
    await user.type(port, '9090')
    await user.click(within(card).getByRole('button', { name: '포트 변경' }))

    expect(
      await within(card).findByText(/공개 설정 변경을 접수했습니다/),
    ).toBeInTheDocument()
  })

  test('OWNER는 이름 확인 후 공개를 해제할 수 있다', async () => {
    const user = userEvent.setup()
    renderVm(63)

    await screen.findByRole('heading', { name: 'shop-app' })
    const card = await publishCard()
    await within(card).findByRole('link', { name: 'shop.example.com' })

    await user.click(within(card).getByRole('button', { name: 'HTTP 공개 해제' }))
    const dialog = await screen.findByRole('dialog', { name: 'HTTP 공개 해제' })
    const confirm = within(dialog).getByRole('button', { name: '공개 해제' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'shop-app')
    await user.click(confirm)

    // 해제되면 공개 폼으로 돌아간다 (허가된 RUNNING VM).
    expect(
      await within(card).findByRole('button', { name: 'HTTP 서비스 공개' }),
    ).toBeInTheDocument()
  })
})

describe('VM 공개 — 커스텀 도메인 검증', () => {
  test('검증 중 커스텀 도메인은 TXT/A 레코드와 확인 상태를 안내한다', async () => {
    renderVm(62) // demo-web: 그룹 12 OWNER, CUSTOM VERIFYING (A 확인, TXT 대기)

    await screen.findByRole('heading', { name: 'demo-web' })
    const card = await publishCard()

    expect(await within(card).findByRole('link', { name: 'demo.example.com' })).toBeInTheDocument()
    expect(within(card).getByText('검증 중')).toBeInTheDocument()
    // 필수 레코드 안내 (A + TXT)
    expect(within(card).getByText('_pickle-verify.demo.example.com')).toBeInTheDocument()
    expect(within(card).getByText('pv-3f6c1b2ae94d')).toBeInTheDocument()
    // A는 확인됨, TXT는 대기 중
    const rows = within(card).getAllByRole('row')
    expect(rows.some((r) => within(r).queryByText('확인됨'))).toBe(true)
    expect(rows.some((r) => within(r).queryByText('대기 중'))).toBe(true)
  })

  test('재검증하면 소유권·연결이 확인되어 ACTIVE가 된다', async () => {
    const user = userEvent.setup()
    renderVm(62)

    await screen.findByRole('heading', { name: 'demo-web' })
    const card = await publishCard()
    await within(card).findByRole('link', { name: 'demo.example.com' })

    await user.click(within(card).getByRole('button', { name: '지금 다시 확인' }))
    expect(await within(card).findByText('연결됨')).toBeInTheDocument()
  })
})

describe('VM 공개 — 부분 상태 방어적 렌더링', () => {
  test('route·certificate·verification이 모두 없는 publication도 크래시 없이 준비 중으로 보여준다', async () => {
    // 접수 직후 과도기: 서버가 publication은 돌려주지만 중첩 블록이 아직 없다.
    const vm = vmStore.find((v) => v.id === 62)!
    const pub = vm.publication as unknown as Record<string, unknown>
    pub.route = null
    pub.certificate = null
    ;(pub.domain as Record<string, unknown>).verification = null

    renderVm(62)

    await screen.findByRole('heading', { name: 'demo-web' })
    const card = await publishCard()
    expect(await within(card).findByRole('link', { name: 'demo.example.com' })).toBeInTheDocument()
    // 라우트가 없으면 포트·상태는 준비 중으로 대체된다.
    expect(within(card).getByText('적용 대기 중')).toBeInTheDocument()
    expect(within(card).getByText('공개 준비 중')).toBeInTheDocument()
    expect(
      within(card).getByText(/공개 설정을 적용하고 있습니다/),
    ).toBeInTheDocument()
    // 검증 블록·인증서 블록은 없으면 렌더링하지 않는다 (크래시 금지).
    expect(within(card).queryByText('도메인 소유권·연결 확인')).not.toBeInTheDocument()
    expect(within(card).queryByText('인증서')).not.toBeInTheDocument()
    // 변경·해제 액션은 그대로 동작한다 (포트 초기값은 기본 80으로 방어).
    expect(within(card).getByRole('button', { name: 'HTTP 공개 해제' })).toBeInTheDocument()
  })
})

describe('VM 공개 — 남은 도메인(tombstone) 삭제', () => {
  test('커스텀 도메인 해제 후 남은 도메인을 삭제해야 다시 연결할 수 있다', async () => {
    const user = userEvent.setup()
    renderVm(63) // shop-app: CUSTOM 공개됨, OWNER

    await screen.findByRole('heading', { name: 'shop-app' })
    let card = await publishCard()
    await within(card).findByRole('link', { name: 'shop.example.com' })

    // 1) 공개 해제 — 커스텀 도메인 행은 남는다 (계약 unpublishVm).
    await user.click(within(card).getByRole('button', { name: 'HTTP 공개 해제' }))
    const dialog = await screen.findByRole('dialog', { name: 'HTTP 공개 해제' })
    expect(within(dialog).getByText(/남은 도메인/)).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox'), 'shop-app')
    await user.click(within(dialog).getByRole('button', { name: '공개 해제' }))

    card = await publishCard()
    expect(
      await within(card).findByRole('button', { name: 'HTTP 서비스 공개' }),
    ).toBeInTheDocument()
    expect(await within(card).findByText('남은 도메인')).toBeInTheDocument()
    expect(within(card).getByText('shop.example.com')).toBeInTheDocument()

    // 2) 남은 행이 있는 동안 같은 도메인 재연결은 409로 거부된다.
    await user.type(within(card).getByLabelText(/커스텀 도메인/), 'shop.example.com')
    await user.click(within(card).getByRole('button', { name: 'HTTP 서비스 공개' }))
    expect(
      await within(card).findByText(/이미 다른 곳에 연결되어 있습니다/),
    ).toBeInTheDocument()

    // 3) 남은 도메인을 삭제하면 목록이 사라지고 재연결이 가능해진다.
    await user.click(within(card).getByRole('button', { name: '도메인 삭제' }))
    await waitFor(() =>
      expect(within(card).queryByText('남은 도메인')).not.toBeInTheDocument(),
    )
    await user.click(within(card).getByRole('button', { name: 'HTTP 서비스 공개' }))
    expect(
      await within(card).findByRole('link', { name: 'shop.example.com' }),
    ).toBeInTheDocument()
  })
})

describe('VM 공개 — 라우트 적용 실패', () => {
  test('라우트가 실패하면 nginx 오류 요약을 보여준다', async () => {
    renderVm(63) // shop-app: CUSTOM ACTIVE지만 라우트 FAILED

    await screen.findByRole('heading', { name: 'shop-app' })
    const card = await publishCard()
    expect(await within(card).findByText('라우트 적용에 실패했습니다')).toBeInTheDocument()
    expect(
      within(card).getByText(/nginx -t 실패/),
    ).toBeInTheDocument()
    // 인증서(Let's Encrypt)는 발급 완료(정상)
    expect(within(card).getByText("Let's Encrypt")).toBeInTheDocument()
  })
})
