import { cva } from 'class-variance-authority'
import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants = cva(
  [
    'inline-flex cursor-pointer items-center justify-center rounded-control font-medium',
    'transition-colors duration-[var(--duration-fast)] ease-standard',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
    'disabled:cursor-not-allowed',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-brand-fill text-white hover:bg-brand-fill-hover active:bg-brand-fill-pressed disabled:bg-primary-300',
        secondary:
          'border border-stroke-default bg-surface-card text-foreground-secondary hover:bg-surface-subtle active:bg-surface-muted disabled:text-foreground-disabled',
        danger:
          'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800 disabled:bg-danger-300',
        ghost:
          'text-foreground-secondary hover:bg-surface-subtle hover:text-foreground-primary active:bg-surface-muted disabled:text-foreground-disabled',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-sm',
        md: 'control-height gap-2 px-4 text-sm',
        lg: 'h-12 gap-2 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

/**
 * 버튼의 겉모습만 낸다 — 실제로는 링크인 자리(목록 화면의 신청 버튼)가 같은 옷을
 * 입도록 Button과 LinkButton이 함께 쓴다. 컴포넌트 파일 밖에 두는 이유는 그쪽이
 * 컴포넌트만 내보내야 하기 때문이다.
 */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
} = {}) {
  return cn(buttonVariants({ variant, size }), className)
}
