import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'
import { Logo, PickleSymbol } from './Logo'

describe('Logo', () => {
  test('기본 surface는 부산대학교 엠블럼과 Pickle wordmark를 노출한다', () => {
    const { container } = render(
      <MemoryRouter>
        <Logo />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Pickle' })).toBeInTheDocument()
    expect(screen.getByText('Pickle')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })

  test('lockup은 PNU Cloud를 병기하지 않고 endorsement만 공식 명칭을 덧붙인다', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <Logo variant="lockup" />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Pickle' })).toBeInTheDocument()
    expect(screen.queryByText('PNU Cloud')).not.toBeInTheDocument()
    expect(container.querySelector('img')).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <Logo variant="endorsement" />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('link', { name: 'Pickle, 부산대학교 클라우드 플랫폼' }),
    ).toBeInTheDocument()
    expect(screen.getByText('부산대학교 클라우드 플랫폼')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeInTheDocument()
  })

  test('16px monochrome symbol은 독립 accessible name을 가진다', () => {
    render(<PickleSymbol tone="monochrome" className="size-4" />)
    expect(screen.getByRole('img', { name: 'Pickle' })).toHaveClass('size-4', 'text-current')
  })
})
