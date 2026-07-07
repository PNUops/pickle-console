import { Link } from 'react-router'
import { cn } from '../lib/cn'

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-lg bg-primary-600 text-white"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <path d="M17.5 19a4.5 4.5 0 0 0 .38-8.984 6.002 6.002 0 0 0-11.65 1.087A4 4 0 0 0 7 19h10.5z" />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight text-neutral-900">피클</span>
    </Link>
  )
}
