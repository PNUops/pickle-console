import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { SplitButton, type SplitButtonProps } from './SplitButton'

// usePopover reads the location, so the harness renders inside a router.
function renderSplit(overrides: Partial<SplitButtonProps> = {}) {
  const onClick = vi.fn()
  const onFirst = vi.fn()
  const onSecond = vi.fn()
  const onOff = vi.fn()
  render(
    <MemoryRouter>
      <SplitButton
        label="종료"
        onClick={onClick}
        menuLabel="종료 옵션"
        items={[
          { key: 'first', label: '첫째', onSelect: onFirst },
          { key: 'off', label: '꺼진 항목', onSelect: onOff, disabled: true },
          { key: 'second', label: '둘째', onSelect: onSecond, danger: true },
        ]}
        {...overrides}
      />
      <button type="button">바깥 버튼</button>
    </MemoryRouter>,
  )
  return { onClick, onFirst, onSecond, onOff }
}

const chevron = () => screen.getByRole('button', { name: '종료 옵션' })
const menu = () => screen.queryByRole('menu', { name: '종료 옵션' })

describe('SplitButton', () => {
  test('the primary button fires its own handler without opening the menu', async () => {
    const user = userEvent.setup()
    const { onClick } = renderSplit()
    await user.click(screen.getByRole('button', { name: '종료' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(menu()).not.toBeInTheDocument()
  })

  test('the chevron opens a menu of menuitems and focuses the first usable one', async () => {
    const user = userEvent.setup()
    renderSplit()
    expect(chevron()).toHaveAttribute('aria-haspopup', 'menu')
    expect(chevron()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menuitem', { name: '둘째' })).not.toBeInTheDocument()

    await user.click(chevron())
    expect(chevron()).toHaveAttribute('aria-expanded', 'true')
    expect(menu()).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    expect(screen.getByRole('menuitem', { name: '첫째' })).toHaveFocus()
  })

  test('selecting an item closes the menu, returns focus to the chevron, then runs it', async () => {
    const user = userEvent.setup()
    const { onSecond, onClick } = renderSplit()
    await user.click(chevron())
    await user.click(screen.getByRole('menuitem', { name: '둘째' }))
    expect(onSecond).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
    expect(menu()).not.toBeInTheDocument()
    expect(chevron()).toHaveFocus()
  })

  test('a disabled item cannot be activated by click or keyboard', async () => {
    const user = userEvent.setup()
    const { onOff } = renderSplit()
    await user.click(chevron())
    const off = screen.getByRole('menuitem', { name: '꺼진 항목' })
    expect(off).toHaveAttribute('aria-disabled', 'true')
    await user.click(off)
    expect(onOff).not.toHaveBeenCalled()
    // The press neither closes the menu nor moves focus out of it.
    expect(menu()).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '첫째' })).toHaveFocus()
    // Arrow navigation skips it: first -> second, never landing on the disabled row.
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: '둘째' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: '첫째' })).toHaveFocus()
    expect(onOff).not.toHaveBeenCalled()
  })

  test('arrow keys, Home and End move focus and wrap around; Enter and Space activate', async () => {
    const user = userEvent.setup()
    const { onFirst, onSecond } = renderSplit()
    await user.click(chevron())
    const first = () => screen.getByRole('menuitem', { name: '첫째' })
    const second = () => screen.getByRole('menuitem', { name: '둘째' })

    expect(first()).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(second()).toHaveFocus()
    await user.keyboard('{ArrowDown}') // wraps to the top
    expect(first()).toHaveFocus()
    await user.keyboard('{ArrowUp}') // wraps to the bottom
    expect(second()).toHaveFocus()
    await user.keyboard('{Home}')
    expect(first()).toHaveFocus()
    await user.keyboard('{End}')
    expect(second()).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onSecond).toHaveBeenCalledTimes(1)
    expect(menu()).not.toBeInTheDocument()

    await user.click(chevron())
    await user.keyboard(' ')
    expect(onFirst).toHaveBeenCalledTimes(1)
    expect(menu()).not.toBeInTheDocument()
  })

  test('Escape closes the menu and returns focus to the chevron', async () => {
    const user = userEvent.setup()
    renderSplit()
    await user.click(chevron())
    expect(menu()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(menu()).not.toBeInTheDocument()
    expect(chevron()).toHaveFocus()
    expect(chevron()).toHaveAttribute('aria-expanded', 'false')
  })

  test('clicking outside closes the menu without running anything', async () => {
    const user = userEvent.setup()
    const { onFirst, onSecond } = renderSplit()
    await user.click(chevron())
    await user.click(screen.getByRole('button', { name: '바깥 버튼' }))
    expect(menu()).not.toBeInTheDocument()
    expect(onFirst).not.toHaveBeenCalled()
    expect(onSecond).not.toHaveBeenCalled()
  })

  test('Tab moves on to the next control and closes the menu', async () => {
    const user = userEvent.setup()
    renderSplit()
    await user.click(chevron())
    await user.tab()
    expect(menu()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '바깥 버튼' })).toHaveFocus()
  })

  test('disabling the primary button leaves the menu reachable', async () => {
    const user = userEvent.setup()
    const { onClick, onFirst } = renderSplit({ disabled: true })
    const primary = screen.getByRole('button', { name: '종료' })
    expect(primary).toBeDisabled()
    await user.click(primary)
    expect(onClick).not.toHaveBeenCalled()
    await user.click(chevron())
    await user.click(screen.getByRole('menuitem', { name: '첫째' }))
    expect(onFirst).toHaveBeenCalledTimes(1)
  })

  test('with no items the chevron is disabled', () => {
    renderSplit({ items: [] })
    expect(chevron()).toBeDisabled()
  })
})
