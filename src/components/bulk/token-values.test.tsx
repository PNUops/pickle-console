import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { BulkChangeDiffList } from './BulkChangeTables'
import { BudgetGauge } from '../llm-usage/BudgetGauge'

describe('token decisions', () => {
  it('preserves both exact sides of a change with the same abbreviation', async () => {
    const user = userEvent.setup()
    render(<BulkChangeDiffList targetType="LLM_KEY" fields={[{ field: 'dailyTokens', oldValue: 5000000, newValue: 5000001 }]} />)
    const values = screen.getAllByRole('button', { name: /정확값 보기/ })
    for (const value of values) await user.click(value)
    expect(screen.getByText('정확값 5,000,000 토큰')).toBeVisible()
    expect(screen.getByText('정확값 5,000,001 토큰')).toBeVisible()
  })
  it('does not display full exhaustion before the raw quota is reached', () => {
    render(<BudgetGauge label="토큰" usedLabel="5M" limitLabel="5M" ratio={4999999 / 5000000} />)
    expect(screen.getByText('5M / 5M (<100%)')).toBeVisible()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '99.99998')
  })
  it('distinguishes an unlimited daily limit from blocking only token use', () => {
    render(<BulkChangeDiffList targetType="LLM_KEY" fields={[{ field: 'dailyTokens', oldValue: null, newValue: 0 }]} />)
    expect(screen.getByText(/무제한/)).toBeVisible()
    expect(screen.getByText(/토큰 사용 불가/)).toBeVisible()
  })
})
