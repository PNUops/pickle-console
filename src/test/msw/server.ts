import { setupServer } from 'msw/node'
import type { RequestHandler } from 'msw'

/** Add per-WP API mock handlers here (or compose them from feature modules). */
export const handlers: RequestHandler[] = []

export const server = setupServer(...handlers)
