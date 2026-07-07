import { setupServer } from 'msw/node'
import type { RequestHandler } from 'msw'
import { authHandlers } from './handlers/auth'

/** Add per-WP API mock handlers here (or compose them from feature modules). */
export const handlers: RequestHandler[] = [...authHandlers]

export const server = setupServer(...handlers)
