import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'
import { ResourceShowcase } from './ResourceShowcase'

function renderShowcase() {
  render(<MemoryRouter><ResourceShowcase /></MemoryRouter>)
}

describe('Landing resource showcase', () => {
  test('shows only the three available resources in display order', () => {
    renderShowcase()
    const cards = screen.getAllByRole('article')
    expect(cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent))
      .toEqual(['가상머신', 'LLM API 키', '도메인'])

    expect(screen.queryByRole('list', { name: '준비 중인 리소스' })).not.toBeInTheDocument()
  })

  test('links each available resource to its guide in the current browsing context', () => {
    renderShowcase()
    for (const [name, destination] of [
      ['가상머신 이용 가이드', '/docs/vm/request'],
      ['LLM API 이용 가이드', '/docs/llm/start'],
      ['도메인 이용 가이드', '/docs/network/domains'],
    ]) {
      const link = screen.getByRole('link', { name: new RegExp(name) })
      expect(link).toHaveAttribute('href', destination)
      expect(link).not.toHaveAttribute('target')
    }
  })
})
