import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TimeSeriesChart } from './TimeSeriesChart'
import { formatTokenCompact, formatTokenExact } from '../../lib/token-presentation'

describe('token chart observations', () => {
  it('exposes raw observations and gaps without hovering on the canvas', async () => {
    const user = userEvent.setup()
    render(<TimeSeriesChart title="토큰 사용량" times={[1, 2]} series={[{ label: '입력', data: [5000001, null] }]}
      format={formatTokenCompact} formatDetail={formatTokenExact} formatTime={(time) => `day ${time}`} />)
    await user.selectOptions(screen.getByRole('combobox', { name: '토큰 사용량 정확값' }), '1')
    expect(screen.getByText('입력 5,000,001 토큰')).toBeVisible()
    await user.selectOptions(screen.getByRole('combobox'), '2')
    expect(screen.getByText('입력 —')).toBeVisible()
  })
})
