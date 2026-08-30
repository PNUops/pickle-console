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

  test('대표 lockup은 mail 원본의 130px·131px 측정값으로 두 줄을 맞춘다', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <Logo variant="lockup" size="sm" />
      </MemoryRouter>,
    )

    const lockup = screen.getByRole('link', {
      name: 'Pickle, 부산대학교 클라우드 플랫폼',
    })
    const topRow = container.querySelector('a > span')
    const emblem = container.querySelector('img')
    const wordmark = screen.getByText('Pickle')
    const subtitle = screen.getByText('부산대학교 클라우드 플랫폼')

    expect(lockup).toHaveClass('w-[131px]', 'gap-[7px]')
    expect(lockup).toHaveStyle({
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    })
    expect(topRow).toHaveClass('w-[130px]', 'gap-3')
    expect(emblem).toHaveClass('h-[30px]', 'w-[31px]')
    expect(wordmark).toHaveClass('text-[30px]', 'leading-[1.1]', 'tracking-[0.5px]')
    expect(subtitle).toHaveClass('w-[131px]', 'text-[12px]', 'leading-[1.4]')
    expect(screen.queryByText('PNU Cloud')).not.toBeInTheDocument()

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

  test('inverse lockup은 흰색 부산대학교 엠블럼을 사용한다', () => {
    const { container } = render(
      <MemoryRouter>
        <Logo tone="inverse" variant="lockup" />
      </MemoryRouter>,
    )

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('pnu-logo-white'),
    )
    expect(screen.queryByText('PNU Cloud')).not.toBeInTheDocument()
  })

  test('16px monochrome symbol은 독립 accessible name을 가진다', () => {
    render(<PickleSymbol tone="monochrome" className="size-4" />)
    expect(screen.getByRole('img', { name: 'Pickle' })).toHaveClass('size-4', 'text-current')
  })
})
