import { cn } from '../../lib/cn'

const sizes = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
} as const

export interface SpinnerProps {
  size?: keyof typeof sizes
  className?: string
  /** Accessible label. Defaults to a generic loading message. */
  label?: string
}

export function Spinner({ size = 'md', className, label = '불러오는 중' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex', className)}>
      <svg
        className={cn('animate-spin text-current', sizes[size])}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
        />
      </svg>
    </span>
  )
}
