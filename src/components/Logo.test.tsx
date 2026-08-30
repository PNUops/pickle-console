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

  test('공식 명칭 병기는 footer용 endorsement에만 포함한다', () => {
    const { container } = render(
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

  test('inverse brand는 흰색 부산대학교 엠블럼을 사용하고 공식 명칭을 넣지 않는다', () => {
    const { container } = render(
      <MemoryRouter>
        <Logo tone="inverse" variant="brand" />
      </MemoryRouter>,
    )

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('pnu-logo-white'),
    )
    expect(screen.getByRole('link', { name: 'Pickle' })).toBeInTheDocument()
    expect(screen.queryByText('부산대학교 클라우드 플랫폼')).not.toBeInTheDocument()
    expect(screen.queryByText('PNU Cloud')).not.toBeInTheDocument()
  })

  test('16px monochrome symbol은 독립 accessible name을 가진다', () => {
    render(<PickleSymbol tone="monochrome" className="size-4" />)
    expect(screen.getByRole('img', { name: 'Pickle' })).toHaveClass('size-4', 'text-current')
  })
})
