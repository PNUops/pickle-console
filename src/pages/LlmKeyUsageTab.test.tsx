import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

const USED_KEY = uuid(70)
const PENDING_KEY = uuid(71)
const REVOKED_KEY = uuid(73)
const NEVER_USED_KEY = uuid(74)

function renderUsage(keyId: string) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/llm-keys/${keyId}?tab=usage`)
}

describe('사용량 탭', () => {
  test('주소로 바로 열리고 타일에 없는 것 하나를 문장으로 말한다', async () => {
    renderUsage(USED_KEY)

    expect(await screen.findByRole('tab', { name: '사용량', selected: true })).toBeInTheDocument()
    expect(await screen.findByText(/가장 많이 쓴 날은 /)).toBeInTheDocument()
    // 합계는 문장이 아니라 타일이 말한다 — 한 화면에서 두 번 세지 않는다.
    expect(screen.queryByText(/동안 요청 .*회, 토큰/)).not.toBeInTheDocument()
  })

  test('개요 탭에서 사용량 탭으로 넘어갈 수 있다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp(`/console/llm-keys/${USED_KEY}`)

    await screen.findByRole('heading', { name: 'capstone-chatbot' })
    // 개요에는 발급 카드가 있고 사용량 차트는 없다.
    expect(screen.getByRole('button', { name: '키 재발급' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '사용량' }))
    expect(await screen.findByRole('img', { name: '요청 수' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '키 재발급' })).not.toBeInTheDocument()
  })

  test('오늘 자 값이 아직 채워지는 중이라는 근거를 마지막 보고 시각으로 댄다', async () => {
    renderUsage(USED_KEY)

    const notice = await screen.findByText(/오늘 자 값은 아직 채워지는 중입니다/)
    // The claim needs its evidence on the screen, and the evidence is a
    // moment. What pins it is the machine-readable attribute rather than the
    // rendered words: "is this current?" takes the relative form, so a text
    // match on an absolute stamp would pass only while the rule is broken.
    const time = notice.querySelector('time')
    expect(time).toHaveAttribute('dateTime', '2026-08-11T09:20:00+09:00')
    expect(time?.textContent).not.toMatch(/-/)
  })

  test('한 번도 보고가 없으면 그 사실을 그대로 말하고 빈 차트를 그리지 않는다', async () => {
    renderUsage(NEVER_USED_KEY)

    expect(
      await screen.findByText(/사용량을 아직 보고하지 않았습니다/),
    ).toBeInTheDocument()
    expect(screen.getByText('최근 30일 동안 이 키로 들어온 요청이 없습니다.')).toBeInTheDocument()
    // 0으로 눕는 선 세 개는 위 문장이 이미 말한 것을 되풀이할 뿐이다.
    expect(screen.queryByRole('img', { name: '요청 수' })).not.toBeInTheDocument()
  })

  test('보고가 며칠째 끊긴 구간의 0을 요청이 없던 날로 단언하지 않는다', async () => {
    // 마지막 보고가 구간 끝보다 앞서면 뒤쪽 0은 아직 모르는 값이다. 여기에
    // "오늘 자 값은 채워지는 중"을 붙이면 화면이 사실을 뒤집는다.
    renderUsage(REVOKED_KEY)

    expect(
      await screen.findByText(/2026-08-01부터는 보고가 없어/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/채워지는 중입니다/)).not.toBeInTheDocument()
    expect(screen.getByText(/그 뒤의 0은 아직 모르는 값입니다/)).toBeInTheDocument()
  })

  test('한도 초과 거부는 다른 실패와 따로 세고, 할 수 있는 일을 알려 준다', async () => {
    renderUsage(USED_KEY)

    const alert = await screen.findByText('한도에 걸려 거부된 요청이 있습니다')
    expect(alert).toBeInTheDocument()
    expect(screen.getByText(/한도 상향을 신청해 주세요/)).toBeInTheDocument()

    // 차트에서도 그 밖의 실패와 같은 계열로 뭉뚱그리지 않는다.
    const chart = screen.getByRole('img', { name: '거부·실패' }).closest('figure')!
    expect(within(chart).getByText('한도 초과 거부')).toBeInTheDocument()
    expect(within(chart).getByText('그 밖의 실패')).toBeInTheDocument()
  })

  test('토큰이 추정 섞인 값이면 제목과 타일이 그렇게 말한다', async () => {
    // 실측인 척하는 숫자를 남기지 않는다. 차트 제목이 표시하고, 얼마나
    // 섞였는지는 합계 타일이 센다 — 같은 말을 문단으로 또 하지는 않는다.
    renderUsage(USED_KEY)

    expect(await screen.findByRole('img', { name: '토큰 사용량 (일부 추정)' })).toBeInTheDocument()
    expect(screen.getByText(/가 추정$/)).toBeInTheDocument()
  })

  test('추정이 없는 구간은 제목에 단서를 달지 않는다', async () => {
    renderUsage(REVOKED_KEY)

    expect(await screen.findByRole('img', { name: '토큰 사용량' })).toBeInTheDocument()
    expect(screen.queryByText(/가 추정$/)).not.toBeInTheDocument()
  })

  test('조회 기간을 바꾸면 그 기간으로 다시 묻는다', async () => {
    const user = userEvent.setup()
    renderUsage(USED_KEY)

    // 응답이 준 구간으로 확인한다 — 화면이 고른 일수만 보면 요청이 나가지
    // 않았어도 라벨은 바뀌므로 아무것도 증명하지 못한다.
    expect(await screen.findByText('2026-07-13 ~ 2026-08-11')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '7일' }))
    expect(await screen.findByText('2026-08-05 ~ 2026-08-11')).toBeInTheDocument()
  })

  test('발급 전 키는 빈 차트 대신 왜 비었는지를 말한다', async () => {
    renderUsage(PENDING_KEY)

    expect(await screen.findByText('아직 발급되지 않은 키입니다')).toBeInTheDocument()
    expect(
      screen.getByText(/발급 전에는 이 키로 인증되는 요청이 없으므로 사용 기록도 없습니다/),
    ).toBeInTheDocument()
    // 그릴 것이 없으므로 차트도 기간 스위처도 없다.
    expect(screen.queryByRole('img', { name: '요청 수' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '조회 기간' })).not.toBeInTheDocument()
  })

  test('폐기된 키는 반대로 과거 기록이 남아 있다', async () => {
    renderUsage(REVOKED_KEY)

    expect(
      await screen.findByText('폐기된 키입니다. 아래는 폐기되기 전까지 남은 기록입니다.'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: '요청 수' })).toBeInTheDocument()
  })

  test('합계는 타일이 센다', async () => {
    // 추정 단서도 여기 붙는다. 문장은 타일이 말하지 않는 것만 맡는다.
    renderUsage(USED_KEY)

    const totals = await screen.findByText('총 요청')
    expect(totals.parentElement).toHaveTextContent(/[0-9,]+회/)
    expect(screen.getByText('합계 토큰')).toBeInTheDocument()
    expect(screen.getByText(/가 추정$/)).toBeInTheDocument()
  })

  test('모델별 비중이 원형과 표로 함께 나온다', async () => {
    // 원형은 색으로만 말하므로 이름과 값이 범례에, 전체 요약이 그림 이름에 있다.
    renderUsage(USED_KEY)

    const donut = await screen.findByRole('img', { name: /모델별 요청 비중/ })
    expect(donut).toHaveAccessibleName(/pickle-general \d+%/)
    expect(screen.getByRole('columnheader', { name: '실패율' })).toBeInTheDocument()
    expect(screen.getAllByText('openai/gpt-4o-mini').length).toBeGreaterThan(0)
  })

  test('예산 게이지 둘이 서로 다른 신선도를 밝힌다', async () => {
    // 하나는 우리가 세고 하나는 공급자가 집행한다. 같은 시점의 값으로
    // 읽히면 안 된다.
    renderUsage(USED_KEY)

    const token = await screen.findByRole('progressbar', { name: '오늘 토큰 사용 소진율' })
    const money = screen.getByRole('progressbar', { name: '금액 사용 소진율' })
    const tokenGauge = token.closest('div[class*="space-y"]') ?? token.parentElement!
    const moneyGauge = money.closest('div[class*="space-y"]') ?? money.parentElement!

    // The money gauge states its observation exactly once. Two renderings of
    // one moment is the defect the time rule exists for, and hiding the second
    // in a title attribute is the same defect wearing a hat.
    const moments = moneyGauge.querySelectorAll('time')
    expect(moments).toHaveLength(1)
    expect(moments[0]).toHaveAttribute('dateTime', '2026-07-31T08:30:00+09:00')
    expect(moneyGauge.querySelector('[title]')).toBeNull()

    // The token gauge carries none: its delay is the batching one, and the
    // reporting notice below already says that. Two places for one fact is
    // what this assertion refuses.
    //
    // The label check is not decoration. An empty count proves nothing about
    // an element that is not the gauge, so the container has to be shown to be
    // the right one before its emptiness means anything.
    expect(tokenGauge.textContent).toContain('오늘 토큰 사용')
    expect(tokenGauge.querySelectorAll('time')).toHaveLength(0)

    expect(screen.getByText(/이 속도면 2026-09-12에 한도에 도달합니다/)).toBeInTheDocument()
  })

  test('user usage tab names no vendor', async () => {
    // A student cannot act on the vendor's name and it is not theirs to know.
    // A proper noun is one of the few things a text search can rule out
    // exactly, so this axis is worth pinning even though copy checks usually
    // cannot see the same fact said in different words.
    renderUsage(USED_KEY)

    await screen.findByRole('progressbar', { name: '금액 사용 소진율' })
    expect(screen.queryByText(/openrouter/i)).not.toBeInTheDocument()
  })

  test('쓰인 적 없는 키는 분해가 비어도 화면이 선다', async () => {
    renderUsage(NEVER_USED_KEY)

    expect(await screen.findByText(/요청이 없습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /모델별 요청 비중/ })).not.toBeInTheDocument()
    // 예산은 사용과 무관하게 현재 상태이므로 그대로 서 있어야 한다.
    expect(screen.getByRole('progressbar', { name: '오늘 토큰 사용 소진율' })).toBeInTheDocument()
  })
})

describe('사용량 탭의 새 지표', () => {
  test('캐시와 사고 토큰은 토큰 차트가 아니라 자기 차트에 선다', async () => {
    // 둘은 입력·출력의 **부분집합**이라 같은 축에 나란히 두면 합계로 읽힌다.
    // 계열이 넷인 차트 하나가 아니라 둘씩 나눈 차트 둘이라야 한다.
    renderUsage(USED_KEY)

    const tokens = await screen.findByRole('img', { name: '토큰 사용량 (일부 추정)' })
    const subsets = await screen.findByRole('img', { name: '캐시·사고 토큰' })
    expect(tokens).toBeInTheDocument()
    expect(subsets).toBeInTheDocument()
    expect(tokens).not.toBe(subsets)
  })

  test('이미지를 받은 적 있는 키만 이미지 타일을 세운다', async () => {
    // 대부분의 키가 0이고, 0인 타일은 자리만 차지하고 말해 주는 것이 없다.
    renderUsage(USED_KEY)
    expect(await screen.findByText('받은 이미지')).toBeInTheDocument()

    renderUsage(REVOKED_KEY)
    expect(await screen.findAllByText('총 요청')).not.toHaveLength(0)
  })

  test('자체 서빙만 쓴 모델 행은 금액 자리에 0이 아니라 값 없음을 둔다', async () => {
    // `$0.00`은 「공짜로 썼다」는, 서버가 한 적 없는 주장이다.
    renderUsage(USED_KEY)

    // 이름이 도넛 범례에도 있으므로 표의 칸에 있는 것만 고른다.
    const cells = await screen.findAllByText('pickle-general')
    const selfHosted = cells.find((node) => node.closest('td'))!.closest('tr')!
    expect(within(selfHosted).getByText('—')).toBeInTheDocument()
    const paid = screen.getAllByText('openai/gpt-4o-mini')
      .find((node) => node.closest('td'))!.closest('tr')!
    expect(within(paid).getByText('$0.4825')).toBeInTheDocument()
  })

  test('금액이 일부에만 붙은 모델은 아는 행과 모르는 행 둘로 선다', async () => {
    // 종전에는 한 행에 「87회 · $0.079」로 적었고, 그 금액이 18건분이라는 것을
    // 화면이 말하지 않았다. **같은 사실이 관리자 화면과 다르게 읽혔다**(운영자
    // 2026-09-07). 관리자 쪽과 같은 규칙으로 나눈다.
    renderUsage(USED_KEY)

    await screen.findAllByText('pickle-general')
    const rows = screen.getAllByText('openai/gpt-4o-mini')
      .filter((node) => node.closest('td'))
      .map((node) => node.closest('tr')!)
    expect(rows).toHaveLength(2)
    const [known, unknown] = rows
    // 둘은 붙어 있다 — 사이에 다른 모델이 끼면 요청 수로 정렬한 순위가 깨진다.
    expect(known.nextElementSibling).toBe(unknown)
    expect(within(known).getByText('$0.4825')).toBeInTheDocument()
    // 자체 서빙의 「—」와 다른 말이라야 한다. 저쪽은 금액이라는 것이 없고
    // 이쪽은 있어야 하는데 모른다.
    expect(within(unknown).getByText('정보 없음')).toBeInTheDocument()
    // 응답 시간은 행마다 자기 값이다. 한 값을 되풀이하면 서로 다른 요청 수를
    // 갖고도 같은 응답 시간을 말하게 된다.
    expect(within(known).getByText('1.4초')).toBeInTheDocument()
    expect(within(unknown).getByText('990ms')).toBeInTheDocument()
  })
})
