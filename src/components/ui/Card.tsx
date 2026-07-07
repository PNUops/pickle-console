import type { ComponentPropsWithRef } from 'react'
import { cn } from '../../lib/cn'

export function Card({ className, ...rest }: ComponentPropsWithRef<'div'>) {
  return (
    <div
      className={cn('rounded-card border border-neutral-200 bg-white shadow-card', className)}
      {...rest}
    />
  )
}

export function CardHeader({ className, ...rest }: ComponentPropsWithRef<'div'>) {
  return <div className={cn('border-b border-neutral-100 px-5 py-4', className)} {...rest} />
}

export function CardTitle({ className, ...rest }: ComponentPropsWithRef<'h2'>) {
  return <h2 className={cn('text-base font-semibold text-neutral-900', className)} {...rest} />
}

export function CardContent({ className, ...rest }: ComponentPropsWithRef<'div'>) {
  return <div className={cn('px-5 py-4', className)} {...rest} />
}

export function CardFooter({ className, ...rest }: ComponentPropsWithRef<'div'>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 border-t border-neutral-100 px-5 py-3', className)}
      {...rest}
    />
  )
}
