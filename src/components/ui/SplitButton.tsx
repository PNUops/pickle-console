import { useEffect, useRef, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { cn } from '../../lib/cn'
import { buttonClass } from './button-style'
import { PopoverPanel } from './Popover'
import { usePopover } from './use-popover'

export interface SplitButtonItem {
  key: string
  label: string
  onSelect: () => void
  /** Renders the label in the danger colour (destructive or irreversible actions). */
  danger?: boolean
  disabled?: boolean
}

export interface SplitButtonProps {
  /** Label of the primary (left) button. */
  label: string
  onClick: () => void
  /** Disables only the primary button: the menu stays reachable so a state that
   * forbids the main action can still offer its alternatives. */
  disabled?: boolean
  variant?: 'secondary' | 'primary'
  size?: 'sm' | 'md'
  /** Accessible name of the chevron that opens the menu (e.g. '종료 옵션'). */
  menuLabel: string
  items: SplitButtonItem[]
  className?: string
}

/**
 * A primary action with a chevron that opens a menu of secondary actions.
 * The menu is click-to-open (hover reveal fails touch and keyboard users) and
 * follows the menu-button pattern: arrow keys move between items, Enter/Space
 * activate, Escape and outside click close, and focus returns to the chevron
 * when the menu closes.
 */
export function SplitButton({
  label,
  onClick,
  disabled = false,
  variant = 'secondary',
  size = 'md',
  menuLabel,
  items,
  className,
}: SplitButtonProps) {
  const { open, toggle, close, rootRef, triggerRef } = usePopover()
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const enabledIndexes = items.flatMap((item, index) => (item.disabled ? [] : [index]))
  // Read through a ref so the effect below runs on open only, not on every
  // parent render that hands over a fresh items array while the menu is open.
  const firstEnabledRef = useRef<number | undefined>(undefined)
  firstEnabledRef.current = enabledIndexes[0]

  // The chevron keeps focus while the menu is closed; opening moves it to the
  // first usable item so keyboard users land inside the menu straight away.
  useEffect(() => {
    if (!open) return
    const first = firstEnabledRef.current
    if (first !== undefined) itemRefs.current[first]?.focus()
  }, [open])

  const focusItem = (index: number) => itemRefs.current[index]?.focus()

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (enabledIndexes.length === 0) return
    const current = enabledIndexes.indexOf(
      itemRefs.current.findIndex((el) => el === document.activeElement),
    )
    const last = enabledIndexes.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusItem(enabledIndexes[current < 0 || current === last ? 0 : current + 1])
        break
      case 'ArrowUp':
        event.preventDefault()
        focusItem(enabledIndexes[current <= 0 ? last : current - 1])
        break
      case 'Home':
        event.preventDefault()
        focusItem(enabledIndexes[0])
        break
      case 'End':
        event.preventDefault()
        focusItem(enabledIndexes[last])
        break
      default:
        break
    }
  }

  // Tab (or any other focus move) out of the component closes the menu; the
  // browser then continues the tab order from the panel's own position, right
  // after the chevron. Selecting an item and Escape both keep focus inside.
  const onRootBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (open && !rootRef.current?.contains(event.relatedTarget as Node | null)) close()
  }

  const select = (item: SplitButtonItem) => {
    if (item.disabled) return
    close()
    triggerRef.current?.focus()
    item.onSelect()
  }

  const divider =
    variant === 'primary' ? 'border-l border-white/30' : 'border-l-0'

  return (
    <div ref={rootRef} onBlur={onRootBlur} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={buttonClass({ variant, size, className: 'rounded-r-none' })}
      >
        {label}
      </button>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={items.length === 0}
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonClass({
          variant,
          size,
          className: cn('rounded-l-none px-2', divider),
        })}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-4"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <PopoverPanel open={open} role="menu" aria-label={menuLabel} className="min-w-36 py-1">
        {/* A press on the panel (its padding, a disabled row) must not move focus
            out of the menu and close it through the blur handler above. */}
        <div onKeyDown={onMenuKeyDown} onMouseDown={(event: MouseEvent) => event.preventDefault()}>
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={(el) => {
                itemRefs.current[index] = el
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              // aria-disabled rather than disabled: a natively disabled button
              // swallows the press, so the mousedown guard above could not run.
              aria-disabled={item.disabled || undefined}
              onClick={() => select(item)}
              className={cn(
                'block w-full cursor-pointer px-3 py-2 text-left text-sm whitespace-nowrap',
                item.danger
                  ? 'text-danger-700 hover:bg-danger-50'
                  : 'text-neutral-700 hover:bg-neutral-50',
                'aria-disabled:cursor-not-allowed aria-disabled:text-foreground-disabled aria-disabled:hover:bg-transparent',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </PopoverPanel>
    </div>
  )
}
