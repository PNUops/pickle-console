import { screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderApp } from './test/render'

// jsdom에는 WebGL이 없고 three 청크 로드는 무의미하게 느리다 — 정적 목업으로 대체.
vi.mock('./pages/landing/HeroVisual', () => ({ HeroVisual: () => null }))

test('랜딩 페이지가 히어로와 CTA를 보여준다', async () => {
  renderApp('/')

  expect(
    await screen.findByRole('heading', { name: /나만의 서버, 피클/ }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /지금 시작하기/ })).toBeInTheDocument()
  // 헤더 내비게이션과 푸터 두 곳에 회원가입 링크가 있다
  expect(screen.getAllByRole('link', { name: '회원가입' })).toHaveLength(2)
})
