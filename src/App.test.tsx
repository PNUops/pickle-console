import { screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderApp } from './test/render'

// jsdom에는 WebGL이 없고 three 청크 로드는 무의미하게 느리다 — 정적 목업으로 대체.
vi.mock('./pages/landing/HeroVisual', () => ({ HeroVisual: () => null }))

test('랜딩 페이지가 히어로·본문 섹션·CTA를 보여준다', async () => {
  renderApp('/')

  // 히어로 (랜딩 청크는 lazy — findBy로 로드를 기다린다)
  expect(
    await screen.findByRole('heading', { name: /나만의 서버, 피클/ }),
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
    screen.getByRole('heading', { name: '필요한 건 콘솔에 다 있습니다' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: '피클은 지금도 자라는 중입니다' }),
  ).toBeInTheDocument()

  // 이용 절차 4단계와 로드맵 "예정" 뱃지
  expect(screen.getByRole('heading', { name: '신청' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '접속' })).toBeInTheDocument()
  expect(screen.getAllByText('예정').length).toBeGreaterThanOrEqual(8)

  // 헤더 내비게이션과 푸터, 최종 CTA에 회원가입 링크가 있다
  expect(screen.getAllByRole('link', { name: /회원가입/ })).toHaveLength(3)
})
