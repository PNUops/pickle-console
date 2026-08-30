import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface TabItem {
  id: string
  label: ReactNode
}

/**
 * 언더라인 스타일 탭(WAI-ARIA tabs 패턴). roving tabIndex + 화살표/Home/End
 * 이동 시 즉시 활성화(activation follows focus). 패널은 {@link TabPanel}로
 * 감싸고 비활성 탭은 렌더하지 않아 탭별 쿼리가 lazy하게 실행된다.
 */
export function Tabs({
  tabs,
  value,
  onChange,
  'aria-label': ariaLabel,
  idPrefix = '',
}: {
  tabs: TabItem[]
  value: string
  onChange: (id: string) => void
  'aria-label': string
  /**
   * 같은 탭 집합이 한 화면에 두 번 마운트될 수 있으면(예: 페이지 카드와 모달)
   * `useId()` 값을 넘겨 DOM id 충돌을 막는다. 짝이 되는 {@link TabPanel}에도
   * 같은 값을 넘겨야 aria-controls가 제 패널을 가리킨다.
   */
  idPrefix?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)

  const focusAndActivate = (index: number) => {
    const tab = tabs[(index + tabs.length) % tabs.length]
    onChange(tab.id)
    // 상태 반영 직후 해당 탭 버튼으로 포커스 이동
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${idPrefix}tab-${tab.id}`)}`)
        ?.focus()
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === value)
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        focusAndActivate(currentIndex + 1)
        break
      case 'ArrowLeft':
        event.preventDefault()
        focusAndActivate(currentIndex - 1)
        break
      case 'Home':
        event.preventDefault()
        focusAndActivate(0)
        break
      case 'End':
        event.preventDefault()
        focusAndActivate(tabs.length - 1)
        break
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto border-b border-stroke-subtle"
    >
      {tabs.map((tab) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}tabpanel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              '-mb-px cursor-pointer border-b-2 px-3.5 py-2.5 text-sm whitespace-nowrap transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
              selected
                ? 'border-brand-fill font-semibold text-brand-foreground'
                : 'border-transparent font-medium text-foreground-muted hover:border-stroke-default hover:text-foreground-primary',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({
  id,
  active,
  children,
  className,
  idPrefix = '',
}: {
  id: string
  active: boolean
  children: ReactNode
  className?: string
  /** 짝이 되는 {@link Tabs}와 같은 값 — 다중 마운트 시 id 충돌 방지. */
  idPrefix?: string
}) {
  if (!active) return null
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}tabpanel-${id}`}
      aria-labelledby={`${idPrefix}tab-${id}`}
      tabIndex={-1}
      className={className}
    >
      {children}
    </div>
  )
}
