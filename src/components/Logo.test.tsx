import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'
import { Logo, PickleSymbol } from './Logo'

describe('Logo', () => {
  test('기본 surface는 Pickle symbol과 wordmark만 노출한다', () => {
    const { container } = render(
      <MemoryRouter>
        <Logo />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Pickle' })).toBeInTheDocument()
    expect(screen.getByText('Pickle')).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24')
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  test('PNU Cloud descriptor와 부산대학교 endorsement를 variant로 분리한다', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <Logo variant="lockup" />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Pickle, PNU Cloud' })).toBeInTheDocument()
    expect(screen.getByText('PNU Cloud')).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <Logo variant="endorsement" />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('link', { name: 'Pickle, 부산대학교 클라우드 플랫폼' }),
    ).toBeInTheDocument()
    expect(container.querySelector('img')).toBeInTheDocument()
  })

  test('16px monochrome symbol은 독립 accessible name을 가진다', () => {
    render(<PickleSymbol tone="monochrome" className="size-4" />)
    expect(screen.getByRole('img', { name: 'Pickle' })).toHaveClass('size-4', 'text-current')
  })
})
