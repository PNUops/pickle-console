import type { AdminLlmAccountUsage } from '../api/queries'

/** Synthetic daily-rollup response metadata, independent of retained raw-event capacity. */
export function accountUsageFixture(overrides: Partial<AdminLlmAccountUsage> = {}): AdminLlmAccountUsage {
  return {
    generatedAt: '2026-09-30T00:00:00Z', timezone: 'Asia/Seoul',
    source: 'DAILY_ROLLUP_ATTRIBUTION_CURRENT_ACCOUNT_BINDING',
    from: '2026-09-01', to: '2026-09-30', page: 0, size: 20, sort: 'REPORTED_COST_DESC',
    totalKeyElements: 1, totalKeyPages: 1, keysUsed: 1, keysLinked: 1,
    attributedCostUsd: null, requests: 0, pricedRequests: 0, points: [], keys: [], ...overrides,
  }
}
