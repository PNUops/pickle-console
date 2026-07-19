import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setAccessToken } from '../api/token'
import { StubWebSocket } from './StubWebSocket'
import { resetFixtures, server } from './msw/server'

// jsdom엔 WebSocket이 없고, MSW의 setupServer는 listen 시점에 자체 WebSocket
// 인터셉터를 전역에 설치한다. 따라서 스텁 주입은 server.listen **뒤**에 해야
// MSW 인터셉터를 덮어 웹 터미널 훅이 스텁을 쓴다(M6.5).
function installStubWebSocket() {
  // MSW는 WebSocket을 읽기 전용 프로퍼티로 정의하므로 defineProperty로 덮는다.
  Object.defineProperty(globalThis, 'WebSocket', {
    value: StubWebSocket,
    writable: true,
    configurable: true,
  })
}

// 화면 다수는 세션 복원(refresh → /me) 뒤 다시 자식 기능 쿼리가 정착해야 원하는
// 요소가 나타나는 다단계 비동기 체인이다. 전체 스위트를 여러 포크로 병렬 실행하면
// (특히 CPU가 붐빌 때) 이 체인이 RTL 기본 1초를 넘겨, 결국 성공할 단언이 시간 초과로
// 실패하는 순서·부하 의존 플레이크가 난다. 대기 예산만 넉넉히 주고(단언 자체는 그대로)
// 이를 막는다.
configure({ asyncUtilTimeout: 5000 })

// jsdom은 ResizeObserver를 구현하지 않는다 — 웹 터미널 fit용 no-op 스텁(M6.5).
if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

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

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  installStubWebSocket() // MSW 인터셉터 설치 이후에 스텁을 덮어쓴다.
})
afterEach(() => {
  cleanup() // vitest runs without globals, so RTL auto-cleanup is not registered
  server.resetHandlers()
  resetFixtures()
  StubWebSocket.reset()
  setAccessToken(null)
  sessionStorage.clear() // 위저드 초안 등 세션 저장소가 테스트 간 새지 않게 한다
})
afterAll(() => server.close())
