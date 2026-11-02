import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { limitsProjectionFixture } from '../../test/llm-projection-fixture'
import { AccountImpactView } from './AccountImpactView'

test.each(['FRESH', 'STALE'] as const)('latest failures and reported freshness stay independent (%s)', (freshness) => {
  const snapshot = structuredClone(limitsProjectionFixture.accountImpact)
  const row = snapshot.accounts![0]
  row.balanceError = 'THROTTLED'
  row.quality.keyMetersError = 'VENDOR_UNAVAILABLE'
  row.quality.creditsFreshness = freshness
  row.quality.keyMetersFreshness = freshness
  row.quality.creditsLastSuccessAt = '2026-10-27T00:00:00Z'
  row.quality.creditsLastAttemptAt = '2026-10-27T00:10:00Z'
  row.quality.keyMetersLastSuccessAt = '2026-10-27T00:01:00Z'
  row.quality.keyMetersLastAttemptAt = '2026-10-27T00:11:00Z'
  render(<AccountImpactView projection={snapshot} />)
  expect(screen.getByText('잔액의 최근 확인이 실패했습니다. 마지막 성공 관측값을 표시합니다.')).toBeInTheDocument()
  expect(screen.getByText(/키 대사의 최근 확인이 실패했습니다/)).toBeInTheDocument()
  expect(screen.getByText('계정 잔액 / 키 대사 상태').parentElement).toHaveTextContent(freshness === 'FRESH' ? '최근 관측 / 최근 관측' : '관측 지연 / 관측 지연')
  for (const [label, time] of [['잔액 마지막 성공', '09:00:00'], ['키 대사 마지막 성공', '09:01:00']]) {
    expect(screen.getByText(label).parentElement).toHaveTextContent(time)
  }
  expect(screen.queryByText('잔액 마지막 시도')).not.toBeInTheDocument()
  expect(screen.queryByText('키 대사 마지막 시도')).not.toBeInTheDocument()
  expect(screen.getByText('$5.00 → $15.00')).toBeInTheDocument()
})

test('unreported successful observations are not presented as a known time or zero', () => {
  const snapshot = structuredClone(limitsProjectionFixture.accountImpact)
  snapshot.accounts![0].quality.creditsLastSuccessAt = null
  snapshot.accounts![0].quality.keyMetersLastSuccessAt = null
  render(<AccountImpactView projection={snapshot} />)
  for (const label of ['잔액 마지막 성공', '키 대사 마지막 성공']) expect(screen.getByText(label).parentElement).toHaveTextContent('미보고')
})
