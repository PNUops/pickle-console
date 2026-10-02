import { screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderApp } from './test/render'
import { refreshSuccessHandler } from './test/msw/handlers/auth'
import { server } from './test/msw/server'

// jsdom에는 WebGL이 없고 three 청크 로드는 무의미하게 느리다 — 정적 목업으로 대체.
vi.mock('./pages/landing/HeroVisual', () => ({ HeroVisual: () => null }))

test('shows resource introductions, usage, sharing and the preserved process', async () => {
  renderApp('/')

  // 히어로 (랜딩 청크는 lazy — findBy로 로드를 기다린다).
  //
  // 기본 1초는 이 대기에 맞지 않는다. 기다리는 것이 렌더가 아니라 **동적 import** 이고,
  // 병렬 워커가 CPU를 나눠 쓰는 동안에는 1초를 넘긴다(두 라운드가 각자 실측으로 같은
  // 결론에 닿았다). 시간을 늘리는 것이 증상 덮기가 아닌 이유는 이 단언이 재는 것이
  // 속도가 아니라 "청크가 결국 렌더된다" 이기 때문이다.
  //
  // 5초도 모자랐다(2026-08-26). 전체 실행에서 간헐 실패했고, 통과할 때조차 4783ms 로
  // 상한 바로 아래였다. 한 머신에서 여러 세션이 동시에 테스트를 돌리는 것이 이 레포의
  // 평시 상태라 그 경합이 예외가 아니다. 15초는 이 단언이 실제로 잡는 실패(청크가
  // 끝내 렌더되지 않음)까지 기다려도 되는 값이다.
  expect(
    await screen.findByRole('heading', { name: /서비스가 시작되는 곳/ }, { timeout: 15_000 }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /서비스 소개/ })).toBeInTheDocument()

  // 본문 섹션 헤딩
  expect(
    screen.getByRole('heading', { name: '지금 신청할 수 있는 리소스' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: '네 단계면 리소스가 준비됩니다' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: '익숙한 도구 그대로' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: /워크스페이스에서.*함께 관리합니다/ }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '만료돼도 데이터는 안전' })).not.toBeInTheDocument()

  // 이용 절차 4단계
  expect(screen.getByRole('heading', { name: '신청' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '사용' })).toBeInTheDocument()

  // Signup remains available in the header and final action.
  expect(screen.getAllByRole('link', { name: /회원가입/ })).toHaveLength(2)
})

test.each([
  [null, '로그인', '/login'],
  ['access-user', '콘솔로 이동', '/console'],
  ['access-sys-admin', '콘솔로 이동', '/admin'],
] as const)('keeps two hero actions and an internal guide link for %s', async (token, action, destination) => {
  if (token) server.use(refreshSuccessHandler(token))
  renderApp('/')
  const introduction = await screen.findByRole('link', { name: '서비스 소개' }, { timeout: 15_000 })
  expect(introduction).toHaveAttribute('href', '/docs/introduction')
  expect(introduction).not.toHaveAttribute('target')
  const row = within(introduction.parentElement!)
  expect(row.getAllByRole('link')).toHaveLength(2)
  expect(row.getByRole('link', { name: new RegExp(action) })).toHaveAttribute('href', destination)
})

test('closes mobile navigation with Escape and restores its toggle focus', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  renderApp('/')
  await screen.findByRole('heading', { name: /서비스가 시작되는 곳/ }, { timeout: 15_000 })
  const toggle = screen.getByRole('button', { name: '메뉴' })
  await userEvent.click(toggle)
  const navigation = screen.getByRole('navigation', { name: '모바일 랜딩 메뉴' })
  const guide = within(navigation).getByRole('link', { name: '사용 가이드' })
  guide.focus()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('navigation', { name: '모바일 랜딩 메뉴' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '메뉴' })).toHaveFocus()
})
