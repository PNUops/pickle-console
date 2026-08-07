import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../../test/msw/handlers/auth'
import { server } from '../../test/msw/server'
import { renderApp } from '../../test/render'

/** 사용자 세션으로 VM 상세의 도메인·포트 탭을 연다 (그룹 12=OWNER, 그룹 15=MEMBER). */
function renderVm(vmId: number) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/vms/${vmId}?tab=publish`)
}

/** '도메인' 카드 요소를 반환한다. */
async function domainsCard(): Promise<HTMLElement> {
  const title = await screen.findByRole('heading', { name: '도메인' })
  return title.closest('div')!.parentElement as HTMLElement
}

describe('VM 도메인 — 목록 렌더링 (0/1/N)', () => {
  test('도메인이 없으면 빈 상태와 두 진입점을 보여준다', async () => {
    renderVm(57) // web-lab: 도메인 없음, OWNER, STOPPED(연결 가능)

    await screen.findByRole('heading', { name: 'web-lab' })
    const card = await domainsCard()
    expect(
      await within(card).findByText('아직 연결된 도메인이 없습니다'),
    ).toBeInTheDocument()
    expect(
      within(card).getByRole('button', { name: /플랫폼 서브도메인 추가/ }),
    ).toBeEnabled()
    expect(within(card).getByRole('button', { name: /내 도메인 연결/ })).toBeEnabled()
  })

  test('1개 서빙은 N=1일 뿐 — 같은 목록 행으로 주소·포트·상태를 보여준다', async () => {
    renderVm(61) // ai-train: 플랫폼 1개 서빙

    await screen.findByRole('heading', { name: 'ai-train' })
    const card = await domainsCard()

    // 서빙 행: 링크 + 포트 + 접힌 상태 배지
    const link = await within(card).findByRole('link', { name: /ai-team\.pusan\.dev/ })
    expect(link).toHaveAttribute('href', 'https://ai-team.pusan.dev')
    expect(within(card).getByText('→ :3000')).toBeInTheDocument()
    expect(within(card).getByText('연결됨')).toBeInTheDocument()
    // 정상 연결 행에는 안내 줄이 없다.
    expect(within(card).queryByText(/실패했습니다/)).not.toBeInTheDocument()
  })

  test('예약 중 절 — 트래픽을 받지 않는 이름을 서빙 목록과 분리해 보여준다', async () => {
    renderVm(63) // shop-app: 서빙 2개 + 예약 중 1개(shop-old)

    await screen.findByRole('heading', { name: 'shop-app' })
    const card = await domainsCard()

    // 예약 중 절: 링크 없는 이름 + 다시 연결 + 안내 문장
    expect(await within(card).findByText('예약 중', { selector: 'h3' })).toBeInTheDocument()
    expect(within(card).getByText('shop-old.pusan.dev')).toBeInTheDocument()
    expect(
      within(card).queryByRole('link', { name: /shop-old\.pusan\.dev/ }),
    ).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: '다시 연결' })).toBeInTheDocument()
    expect(within(card).getByText(/이름이 풀립니다/)).toBeInTheDocument()
  })

  test('N개 서빙 — 도메인마다 행이 하나씩 나오고 실패 축을 지목한다', async () => {
    renderVm(63) // shop-app: 플랫폼(정상) + 커스텀(라우트 실패)

    await screen.findByRole('heading', { name: 'shop-app' })
    const card = await domainsCard()

    expect(
      await within(card).findByRole('link', { name: /shop-app\.pusan\.dev/ }),
    ).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /shop\.example\.com/ })).toBeInTheDocument()
    // 커스텀 행은 실패로 접히고 라우트 축을 지목한다.
    expect(within(card).getByText('실패')).toBeInTheDocument()
    expect(within(card).getByText('라우트 적용에 실패했습니다.')).toBeInTheDocument()
    // 플랫폼 행은 정상.
    expect(within(card).getByText('연결됨')).toBeInTheDocument()
  })

  test('MEMBER는 읽기 전용 — 추가·해제 진입점 대신 안내만 보인다', async () => {
    renderVm(56) // algo-judge: 그룹 15 MEMBER

    await screen.findByRole('heading', { name: 'algo-judge' })
    const card = await domainsCard()
    expect(
      await within(card).findByText(/도메인 연결·해제는 그룹의 소유자·편집자만/),
    ).toBeInTheDocument()
    expect(
      within(card).queryByRole('button', { name: /플랫폼 서브도메인 추가/ }),
    ).not.toBeInTheDocument()
  })

  test('연결 불가 상태(NEEDS_ADMIN)면 추가 버튼이 비활성화되고 사유를 안내한다', async () => {
    renderVm(58) // stuck-vm: NEEDS_ADMIN, OWNER

    await screen.findByRole('heading', { name: 'stuck-vm' })
    const card = await domainsCard()
    expect(
      await within(card).findByText(
        '실행 중 또는 중지됨 상태의 VM만 도메인을 연결할 수 있습니다.',
      ),
    ).toBeInTheDocument()
    expect(
      within(card).getByRole('button', { name: /플랫폼 서브도메인 추가/ }),
    ).toBeDisabled()
    expect(within(card).getByRole('button', { name: /내 도메인 연결/ })).toBeDisabled()
  })
})

describe('VM 도메인 — 플랫폼 서브도메인 추가 (모달)', () => {
  test('이름·루트·포트를 접수하면 행이 생기고 폴링으로 연결됨에 수렴한다', async () => {
    const user = userEvent.setup()
    renderVm(57)

    await screen.findByRole('heading', { name: 'web-lab' })
    const card = await domainsCard()
    await user.click(
      await within(card).findByRole('button', { name: /플랫폼 서브도메인 추가/ }),
    )

    const modal = await screen.findByRole('dialog', { name: '플랫폼 서브도메인 추가' })
    await user.type(within(modal).getByLabelText('서브도메인'), 'web-lab')
    // 허용 루트가 2개라 선택지가 보이고, 최종 주소를 미리 보여준다.
    expect(within(modal).getByLabelText('루트 도메인')).toHaveValue('pusan.dev')
    expect(within(modal).getByText('https://web-lab.pusan.dev')).toBeInTheDocument()
    const port = within(modal).getByLabelText('공개 포트')
    await user.clear(port)
    await user.type(port, '8080')
    await user.click(within(modal).getByRole('button', { name: '연결' }))

    // 토스트로 접수를 확인하고 모달은 닫힌다.
    expect(
      await screen.findByText('web-lab.pusan.dev 연결을 접수했습니다. 잠시 후 적용됩니다.'),
    ).toBeInTheDocument()
    // 행이 생기고, 라우트 PENDING → 폴링 → APPLIED로 연결됨에 수렴한다.
    expect(
      await within(card).findByRole('link', { name: /web-lab\.pusan\.dev/ }),
    ).toBeInTheDocument()
    expect(within(card).getByText('→ :8080')).toBeInTheDocument()
    expect(await within(card).findByText('연결됨')).toBeInTheDocument()
  })

  test('예약어 이름은 서버 왕복 없이 필드 오류로 막는다', async () => {
    const user = userEvent.setup()
    renderVm(57)

    await screen.findByRole('heading', { name: 'web-lab' })
    const card = await domainsCard()
    await user.click(
      await within(card).findByRole('button', { name: /플랫폼 서브도메인 추가/ }),
    )

    const modal = await screen.findByRole('dialog', { name: '플랫폼 서브도메인 추가' })
    await user.type(within(modal).getByLabelText('서브도메인'), 'www')
    await user.click(within(modal).getByRole('button', { name: '연결' }))
    expect(
      await within(modal).findByText("'www'은(는) 예약된 서브도메인이라 사용할 수 없습니다."),
    ).toBeInTheDocument()
  })

  test('상한 초과 409는 안내 문구로 흡수한다 (상한값은 서버만 안다)', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/v1/vms/57/domains', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '플랫폼 서브도메인 상한에 도달했습니다',
            status: 409,
            detail: '플랫폼 서브도메인은 VM당 3개까지 연결할 수 있습니다.',
            instance: '/api/v1/vms/57/domains',
            code: 'DOMAIN_LIMIT_REACHED',
          },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    renderVm(57)

    await screen.findByRole('heading', { name: 'web-lab' })
    const card = await domainsCard()
    await user.click(
      await within(card).findByRole('button', { name: /플랫폼 서브도메인 추가/ }),
    )
    const modal = await screen.findByRole('dialog', { name: '플랫폼 서브도메인 추가' })
    await user.type(within(modal).getByLabelText('서브도메인'), 'one-more')
    await user.click(within(modal).getByRole('button', { name: '연결' }))

    expect(
      await within(modal).findByText(
        '플랫폼 서브도메인 상한에 도달해 연결을 접수하지 못했습니다.',
      ),
    ).toBeInTheDocument()
  })
})

describe('VM 도메인 — 내 도메인 연결 (드로어)', () => {
  test('접수하면 같은 드로어가 도메인 상세로 전환되어 DNS 레코드 표가 보인다', async () => {
    const user = userEvent.setup()
    renderVm(57)

    await screen.findByRole('heading', { name: 'web-lab' })
    const card = await domainsCard()
    await user.click(await within(card).findByRole('button', { name: /내 도메인 연결/ }))

    const drawer = await screen.findByRole('dialog', { name: '내 도메인 연결' })
    // 신청서와 같은 규칙으로 정규화(trim+소문자)해 전송한다.
    await user.type(within(drawer).getByLabelText('커스텀 도메인'), '  MyApp.Example.COM  ')
    await user.click(within(drawer).getByRole('button', { name: '도메인 연결' }))

    // 드로어가 접수된 도메인의 상세로 전환된다 — 후속 작업(레코드 등록)이 바로 보인다.
    const detail = await screen.findByRole('dialog', { name: 'myapp.example.com' })
    expect(
      within(detail).getByText(/연결을 접수했습니다\. 아래 DNS 레코드를 추가하면/),
    ).toBeInTheDocument()
    expect(within(detail).getByText('레코드 대기')).toBeInTheDocument()
    // A·TXT 두 레코드와 복사 버튼이 표로 안내된다.
    expect(within(detail).getByText('_pickle-verify.myapp.example.com')).toBeInTheDocument()
    expect(within(detail).getAllByRole('button', { name: '복사' }).length).toBeGreaterThanOrEqual(2)
    // 연결 진행 체크리스트가 함께 보인다.
    expect(within(detail).getByText('소유 확인')).toBeInTheDocument()
    expect(within(detail).getByText('인증서 발급')).toBeInTheDocument()
    expect(within(detail).getByText('라우트 적용')).toBeInTheDocument()
  })

  test('형식이 틀린 커스텀 도메인은 서버 왕복 없이 필드 오류를 보여준다', async () => {
    const user = userEvent.setup()
    renderVm(57)

    await screen.findByRole('heading', { name: 'web-lab' })
    const card = await domainsCard()
    await user.click(await within(card).findByRole('button', { name: /내 도메인 연결/ }))

    const drawer = await screen.findByRole('dialog', { name: '내 도메인 연결' })
    await user.type(within(drawer).getByLabelText('커스텀 도메인'), 'bad_domain!')
    await user.click(within(drawer).getByRole('button', { name: '도메인 연결' }))
    expect(
      await within(drawer).findByText(/커스텀 도메인 형식이 올바르지 않습니다/),
    ).toBeInTheDocument()
  })
})

describe('VM 도메인 — 드로어의 검증 재확인·포트 변경', () => {
  test('검증 중 커스텀 도메인은 드로어에서 레코드 상태를 보여주고 재확인할 수 있다', async () => {
    const user = userEvent.setup()
    renderVm(62) // demo-web: CUSTOM VERIFYING (A 확인, TXT 대기)

    await screen.findByRole('heading', { name: 'demo-web' })
    const card = await domainsCard()
    await user.click(await within(card).findByRole('button', { name: '자세히' }))

    const drawer = await screen.findByRole('dialog', { name: 'demo.example.com' })
    // 레코드별 확인 상태 (A 확인됨, TXT 대기 중)
    expect(within(drawer).getByText('확인됨')).toBeInTheDocument()
    expect(within(drawer).getByText('대기 중')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '지금 다시 확인' }))

    // 재검증 성공 → 소유 확인 완료, 접힌 상태가 진행/연결됨 쪽으로 바뀐다.
    await waitFor(() =>
      expect(within(drawer).queryByText('레코드 대기')).not.toBeInTheDocument(),
    )
  })

  test('포트 변경은 도메인 단위로 접수된다', async () => {
    const user = userEvent.setup()
    renderVm(63) // shop-app: 플랫폼 행(APPLIED)의 포트만 바꾼다

    await screen.findByRole('heading', { name: 'shop-app' })
    const card = await domainsCard()
    await within(card).findByRole('link', { name: /shop-app\.pusan\.dev/ })
    const rows = within(card).getAllByRole('button', { name: '자세히' })
    await user.click(rows[0]!)

    const drawer = await screen.findByRole('dialog', { name: 'shop-app.pusan.dev' })
    const port = within(drawer).getByLabelText('공개 포트')
    await user.clear(port)
    await user.type(port, '9090')
    await user.click(within(drawer).getByRole('button', { name: '공개 포트 변경' }))

    expect(
      await screen.findByText('공개 포트 변경을 접수했습니다. 잠시 후 적용됩니다.'),
    ).toBeInTheDocument()
    // 목록 행의 포트 표기가 갱신된다 (폴링·무효화 반영).
    expect(await within(card).findByText('→ :9090')).toBeInTheDocument()
  })
})

describe('VM 도메인 — 해제 확인의 무게', () => {
  test('커스텀 도메인 해제 문구 — 이름이 바로 풀린다 (마지막 아님 → 승격 없음)', async () => {
    const user = userEvent.setup()
    renderVm(63) // 도메인 2개 서빙

    await screen.findByRole('heading', { name: 'shop-app' })
    const card = await domainsCard()
    // 커스텀 행(shop.example.com)의 드로어를 연다.
    const detailButtons = within(card).getAllByRole('button', { name: '자세히' })
    await user.click(detailButtons[1]!)

    const drawer = await screen.findByRole('dialog', { name: 'shop.example.com' })
    await user.click(within(drawer).getByRole('button', { name: '연결 해제' }))

    const confirm = await screen.findByRole('dialog', { name: '도메인 연결 해제' })
    expect(
      within(confirm).getByText(/이름도 바로 풀립니다.*소유 확인을 처음부터/),
    ).toBeInTheDocument()
    // 도메인이 둘이라 마지막 도메인 경고는 없다.
    expect(within(confirm).queryByText(/마지막 도메인/)).not.toBeInTheDocument()

    await user.click(within(confirm).getByRole('button', { name: '연결 해제' }))
    expect(await screen.findByText('shop.example.com 연결을 해제했습니다.')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(card).queryByRole('link', { name: /shop\.example\.com/ }),
      ).not.toBeInTheDocument(),
    )
  })

  test('플랫폼 도메인 해제는 예약 안내를 보여주고 예약 중 절로 옮긴다', async () => {
    const user = userEvent.setup()
    renderVm(63) // 서빙 2개 — 플랫폼 행 해제

    await screen.findByRole('heading', { name: 'shop-app' })
    const card = await domainsCard()
    await within(card).findByRole('link', { name: /shop-app\.pusan\.dev/ })
    await user.click((within(card).getAllByRole('button', { name: '자세히' }))[0]!)

    const drawer = await screen.findByRole('dialog', { name: 'shop-app.pusan.dev' })
    await user.click(within(drawer).getByRole('button', { name: '연결 해제' }))

    const confirm = await screen.findByRole('dialog', { name: '도메인 연결 해제' })
    // 플랫폼 서브도메인은 이름이 예약된 뒤 풀린다. 도메인이 둘이라 승격은 없다.
    expect(within(confirm).getByText(/예약된 뒤 풀립니다/)).toBeInTheDocument()
    expect(within(confirm).queryByText(/마지막 도메인/)).not.toBeInTheDocument()

    await user.click(within(confirm).getByRole('button', { name: '연결 해제' }))
    // 서버 안내(예약 일수 포함)를 토스트로 그대로 보여준다.
    expect(
      await screen.findByText(/shop-app\.pusan\.dev 연결을 해제했습니다\. 이름은 \d+일 동안 예약됩니다\./),
    ).toBeInTheDocument()
    // 서빙 목록에서 빠지고 예약 중 절로 이동한다.
    await waitFor(() =>
      expect(
        within(card).queryByRole('link', { name: /shop-app\.pusan\.dev/ }),
      ).not.toBeInTheDocument(),
    )
    expect(await within(card).findByText('shop-app.pusan.dev')).toBeInTheDocument()
  })

  test('마지막 도메인 해제는 danger 경고로 승격된다', async () => {
    const user = userEvent.setup()
    renderVm(62) // demo-web: 서빙 1개 — 마지막 도메인

    await screen.findByRole('heading', { name: 'demo-web' })
    const card = await domainsCard()
    await user.click(await within(card).findByRole('button', { name: '자세히' }))

    const drawer = await screen.findByRole('dialog', { name: 'demo.example.com' })
    await user.click(within(drawer).getByRole('button', { name: '연결 해제' }))

    const confirm = await screen.findByRole('dialog', { name: '도메인 연결 해제' })
    expect(
      within(confirm).getByText(/마지막 도메인입니다.*HTTP 공개가 완전히 중단됩니다/),
    ).toBeInTheDocument()
  })
})

describe('VM 도메인 — 예약 중 이름의 두 갈래', () => {
  test('다시 연결 — 예약된 이름이 채워진 추가 모달을 거쳐 서빙 목록으로 돌아온다', async () => {
    const user = userEvent.setup()
    renderVm(63)

    await screen.findByRole('heading', { name: 'shop-app' })
    const card = await domainsCard()
    await user.click(await within(card).findByRole('button', { name: '다시 연결' }))

    const modal = await screen.findByRole('dialog', { name: '플랫폼 서브도메인 추가' })
    // 예약된 이름·루트가 채워져 있고, 포트만 확인하면 된다.
    expect(within(modal).getByLabelText('서브도메인')).toHaveValue('shop-old')
    await user.click(within(modal).getByRole('button', { name: '연결' }))

    expect(
      await screen.findByText('shop-old.pusan.dev 연결을 접수했습니다. 잠시 후 적용됩니다.'),
    ).toBeInTheDocument()
    // 예약 절에서 빠지고 서빙 목록에 링크로 나타난다.
    expect(
      await within(card).findByRole('link', { name: /shop-old\.pusan\.dev/ }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(within(card).queryByText('예약 중', { selector: 'h3' })).not.toBeInTheDocument(),
    )
  })

  test('즉시 반납 — 드로어에서 확인을 거쳐 이름이 바로 풀린다', async () => {
    const user = userEvent.setup()
    renderVm(63)

    await screen.findByRole('heading', { name: 'shop-app' })
    const card = await domainsCard()
    await within(card).findByText('shop-old.pusan.dev')
    // 예약 행의 '자세히'는 서빙 행 둘 다음이다. 행에는 반납 버튼을 두지 않는다 —
    // 다시 연결과 나란히 두면 오조작 표면이 된다.
    const detailButtons = within(card).getAllByRole('button', { name: '자세히' })
    await user.click(detailButtons[2]!)

    const drawer = await screen.findByRole('dialog', { name: 'shop-old.pusan.dev' })
    await user.click(within(drawer).getByRole('button', { name: '지금 이름 반납' }))
    const confirm = await screen.findByRole('dialog', { name: '지금 이름 반납' })
    expect(
      within(confirm).getByText(/이름이 즉시 풀려 다른 사용자가 사용할 수 있게 됩니다/),
    ).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: '지금 이름 반납' }))

    expect(await screen.findByText(/shop-old\.pusan\.dev 이름을 반납했습니다/)).toBeInTheDocument()
    await waitFor(() =>
      expect(within(card).queryByText('shop-old.pusan.dev')).not.toBeInTheDocument(),
    )
  })
})
