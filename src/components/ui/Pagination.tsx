import { Button } from './Button'

export interface PaginationProps {
  /** Zero-based current page. */
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

/** 표시할 0-기반 페이지 번호 목록 — 연속되지 않는 간극은 null(생략 부호). */
function pageItems(page: number, totalPages: number): (number | null)[] {
  const wanted = new Set([0, totalPages - 1, page - 1, page, page + 1])
  const pages = [...wanted].filter((p) => p >= 0 && p < totalPages).sort((a, b) => a - b)
  const items: (number | null)[] = []
  let prev: number | null = null
  for (const p of pages) {
    if (prev !== null && p - prev > 1) items.push(null)
    items.push(p)
    prev = p
  }
  return items
}

/** Numbered pager for zero-based paged lists. Hidden when there is a single page. */
export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null
  return (
    <nav aria-label="페이지 이동" className="flex items-center justify-center gap-1.5">
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 0}
        onClick={() => onPageChange(page - 1)}
      >
        이전
      </Button>
      {pageItems(page, totalPages).map((item, index) =>
        item === null ? (
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className="px-1 text-sm text-neutral-400"
          >
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? 'primary' : 'ghost'}
            size="sm"
            aria-label={`${item + 1} 페이지`}
            aria-current={item === page ? 'page' : undefined}
            className="min-w-8 px-2"
            onClick={() => onPageChange(item)}
          >
            {item + 1}
          </Button>
        ),
      )}
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
      >
        다음
      </Button>
    </nav>
  )
}
