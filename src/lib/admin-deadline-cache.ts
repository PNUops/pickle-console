import type { QueryClient } from '@tanstack/react-query'

export const ADMIN_DEADLINE_QUERY_KEY = ['admin', 'resource-deadlines'] as const

export function invalidateAdminDeadlines(client: QueryClient) {
  return client.invalidateQueries({ queryKey: ADMIN_DEADLINE_QUERY_KEY })
}
