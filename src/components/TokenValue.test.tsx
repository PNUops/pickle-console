import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TokenLimit, TokenValue } from './TokenValue'

describe('TokenValue', () => {
  it('opens exact values with the keyboard and touch-compatible clicks', async () => {
    const user = userEvent.setup()
    render(<TokenValue value={5000001} decision />)
    const toggle = screen.getByRole('button', { name: /정확값 보기/ })
    await user.tab()
    expect(toggle).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('정확값 5,000,001 토큰')).toBeVisible()
    await user.click(toggle)
    expect(screen.queryByText('정확값 5,000,001 토큰')).not.toBeInTheDocument()
  })
  it('keeps stored unlimited, blocked and unprovided values separate', () => {
    render(<><TokenLimit value={null} daily /><TokenLimit value={0} daily /><TokenLimit value={undefined} daily /><TokenLimit value={null} /></>)
    expect(screen.getByText('무제한')).toBeVisible()
    expect(screen.getByText('0 토큰')).toBeVisible()
    expect(screen.getByText(/토큰 사용 불가/)).toBeVisible()
    expect(screen.getByText('제공되지 않음')).toBeVisible()
    expect(screen.getByText('서비스 기본값')).toBeVisible()
  })
})
