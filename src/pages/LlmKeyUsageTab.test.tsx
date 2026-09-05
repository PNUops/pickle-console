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

    expect(
      await screen.findByText(/게이트웨이 마지막 보고 2026-08-11 09:20/),
    ).toBeInTheDocument()
    expect(screen.getByText(/오늘 자 값은 아직 채워지는 중입니다/)).toBeInTheDocument()
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
    // 하나는 우리가 세고 하나는 OpenRouter가 집행한다. 같은 시점의 값으로
    // 읽히면 안 된다.
    renderUsage(USED_KEY)

    expect(await screen.findByRole('progressbar', { name: '오늘 토큰 사용 소진율' }))
      .toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '금액 사용 소진율' })).toBeInTheDocument()
    expect(screen.getByText(/OpenRouter 기준 .*에 읽은 값입니다/)).toBeInTheDocument()
    expect(screen.getByText(/이 속도면 2026-09-12에 한도에 도달합니다/)).toBeInTheDocument()
  })

  test('쓰인 적 없는 키는 분해가 비어도 화면이 선다', async () => {
    renderUsage(NEVER_USED_KEY)

    expect(await screen.findByText(/요청이 없습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /모델별 요청 비중/ })).not.toBeInTheDocument()
    // 예산은 사용과 무관하게 현재 상태이므로 그대로 서 있어야 한다.
    expect(screen.getByRole('progressbar', { name: '오늘 토큰 사용 소진율' })).toBeInTheDocument()
  })
})
