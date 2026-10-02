import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'
import { ResourceShowcase } from './ResourceShowcase'

function renderShowcase() {
  render(<MemoryRouter><ResourceShowcase /></MemoryRouter>)
}

describe('Landing resource showcase', () => {
  test('keeps the three available resources and six planned resources in display order', () => {
    renderShowcase()
    const cards = screen.getAllByRole('article')
    expect(cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent))
      .toEqual(['가상머신', 'LLM API 키', '도메인'])

    const planned = screen.getByRole('list', { name: '준비 중인 리소스' })
    const items = within(planned).getAllByRole('listitem')
    expect(items.map((item) => item.textContent?.replace('준비 중', '').trim()))
      .toEqual(['컨테이너', '컨테이너 레지스트리', '데이터베이스', '오브젝트 스토리지', 'GPU', '단축 링크'])
    expect(within(planned).getAllByText('준비 중')).toHaveLength(6)
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
