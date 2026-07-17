import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setAccessToken } from '../api/token'
import { resetFixtures, server } from './msw/server'

// jsdom은 matchMedia를 구현하지 않는다 — 반응형 리스너(모바일 드로어 등)용 스텁.
// 테스트 뷰포트는 항상 "모바일 미만 아님(matches=false)"으로 취급한다.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (media: string): MediaQueryList =>
    ({
      matches: false,
      media,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup() // vitest runs without globals, so RTL auto-cleanup is not registered
  server.resetHandlers()
  resetFixtures()
  setAccessToken(null)
  sessionStorage.clear() // 위저드 초안 등 세션 저장소가 테스트 간 새지 않게 한다
})
afterAll(() => server.close())
