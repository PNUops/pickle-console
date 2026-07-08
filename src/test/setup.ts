import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setAccessToken } from '../api/token'
import { resetFixtures, server } from './msw/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup() // vitest runs without globals, so RTL auto-cleanup is not registered
  server.resetHandlers()
  resetFixtures()
  setAccessToken(null)
  sessionStorage.clear() // 위저드 초안 등 세션 저장소가 테스트 간 새지 않게 한다
})
afterAll(() => server.close())
