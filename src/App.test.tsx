import { screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderApp } from './test/render'

// jsdom에는 WebGL이 없고 three 청크 로드는 무의미하게 느리다 — 정적 목업으로 대체.
vi.mock('./pages/landing/HeroVisual', () => ({ HeroVisual: () => null }))

test('랜딩 페이지가 히어로·본문 섹션·CTA를 보여준다', async () => {
  renderApp('/')

  // 히어로 (랜딩 청크는 lazy — findBy로 로드를 기다린다).
  //
  // findBy 의 기본 1초는 이 대기에 맞지 않는다. 기다리는 것이 렌더가 아니라 **동적
  // import** 이고, 병렬 워커가 CPU를 나눠 쓰는 동안에는 1초를 넘긴다(부하 15에서 실측
  // 실패, 단독 실행에서는 매번 통과). 시간을 늘리는 것이 증상 덮기가 아닌 이유는 이
  // 단언이 재는 것이 속도가 아니라 "청크가 결국 렌더된다" 이기 때문이다.
  expect(
    await screen.findByRole('heading', { name: /서비스가 시작되는 곳/ }, { timeout: 10_000 }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /지금 시작하기/ })).toBeInTheDocument()

  // 본문 섹션 헤딩
  expect(
    screen.getByRole('heading', { name: '네 단계면 서버가 준비됩니다' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: '터미널이 있어도, 없어도' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: '서버만 주고 끝나지 않습니다' }),
  ).toBeInTheDocument()

  // 이용 절차 4단계
  expect(screen.getByRole('heading', { name: '신청' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '접속' })).toBeInTheDocument()

  // 헤더 내비게이션과 푸터, 최종 CTA에 회원가입 링크가 있다
  expect(screen.getAllByRole('link', { name: /회원가입/ })).toHaveLength(3)
})
