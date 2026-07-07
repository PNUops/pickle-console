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
})
afterAll(() => server.close())
