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
  test('주소로 바로 열리고 구간 요약을 문장으로 먼저 말한다', async () => {
    renderUsage(USED_KEY)

    expect(await screen.findByRole('tab', { name: '사용량', selected: true })).toBeInTheDocument()
    expect(
      await screen.findByText(/최근 30일 동안 요청 .*회, 토큰 .*개\(일부 추정\)를 썼습니다/),
    ).toBeInTheDocument()
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

  test('호출이 없던 날이 0이라는 것을 화면이 말한다', async () => {
    // 계약이 0으로 채워 보내므로 빈 구간이 아니다. 차트가 둘을 같게 그리면
    // "게이트웨이가 죽었나"로 읽힌다.
    renderUsage(USED_KEY)

    expect(
      await screen.findByText(/바닥에 붙은 구간은 자료가 빠진 날이 아니라 요청이 없던 날입니다/),
    ).toBeInTheDocument()
  })

  test('오늘 자 값이 아직 채워지는 중이라는 근거를 마지막 보고 시각으로 댄다', async () => {
    renderUsage(USED_KEY)

    expect(
      await screen.findByText(/게이트웨이 마지막 보고 2026-08-11 09:20/),
    ).toBeInTheDocument()
    expect(screen.getByText(/마지막 날이 낮게 보이는 것은 정상입니다/)).toBeInTheDocument()
  })

  test('한 번도 보고가 없으면 그 사실을 그대로 말하고 빈 차트를 그리지 않는다', async () => {
    renderUsage(NEVER_USED_KEY)

    expect(
      await screen.findByText(/아직 한 번도 보고하지 않았습니다/),
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
      await screen.findByText(/2026-08-01부터는 아직 보고가 오지 않았습니다/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/마지막 날이 낮게 보이는 것은 정상입니다/)).not.toBeInTheDocument()
    expect(
      screen.getByText(/그 날짜의 0은 요청이 없었다는 뜻이 아닐 수 있습니다/),
    ).toBeInTheDocument()
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

  test('토큰이 추정 섞인 값이면 제목과 설명이 그렇게 말한다', async () => {
    renderUsage(USED_KEY)

    expect(await screen.findByRole('img', { name: '토큰 사용량 (일부 추정)' })).toBeInTheDocument()
    // 분모는 전체 요청이 아니라 토큰을 만든 요청이다 — 거부에 가려 추정 비율이
    // 낮아 보이면 실측인 척하는 것과 다르지 않다.
    expect(screen.getByText(/토큰을 만든 요청 .*회 중/)).toBeInTheDocument()
    expect(screen.getByText(/토큰 합은 그만큼 추정값입니다/)).toBeInTheDocument()
  })

  test('추정이 없는 구간은 실측이라고 말한다', async () => {
    renderUsage(REVOKED_KEY)

    expect(await screen.findByRole('img', { name: '토큰 사용량' })).toBeInTheDocument()
    expect(screen.getByText('업스트림이 보고한 실측 토큰 수입니다.')).toBeInTheDocument()
  })

  test('조회 기간을 바꾸면 그 기간으로 다시 묻는다', async () => {
    const user = userEvent.setup()
    renderUsage(USED_KEY)

    // 응답이 준 구간으로 확인한다 — 화면이 고른 일수만 보면 요청이 나가지
    // 않았어도 라벨은 바뀌므로 아무것도 증명하지 못한다.
    expect(await screen.findByText('2026-07-13 ~ 2026-08-11')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '7일' }))
    expect(await screen.findByText('2026-08-05 ~ 2026-08-11')).toBeInTheDocument()
    expect(screen.getByText(/최근 7일 동안 요청/)).toBeInTheDocument()
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
})
