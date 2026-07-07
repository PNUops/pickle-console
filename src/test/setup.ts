import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setAccessToken } from '../api/token'
import { server } from './msw/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup() // vitest runs without globals, so RTL auto-cleanup is not registered
  server.resetHandlers()
  setAccessToken(null)
})
afterAll(() => server.close())
