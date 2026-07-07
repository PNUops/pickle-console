import type { ComponentPropsWithRef } from 'react'
import { cn } from '../../lib/cn'

export function Table({ className, ...rest }: ComponentPropsWithRef<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...rest} />
    </div>
  )
}

export function THead({ className, ...rest }: ComponentPropsWithRef<'thead'>) {
  return <thead className={cn('bg-neutral-50', className)} {...rest} />
}

export function TBody({ className, ...rest }: ComponentPropsWithRef<'tbody'>) {
  return <tbody className={cn('divide-y divide-neutral-100', className)} {...rest} />
}

export function TR({ className, ...rest }: ComponentPropsWithRef<'tr'>) {
  return <tr className={cn('hover:bg-neutral-50', className)} {...rest} />
}

export function TH({ className, ...rest }: ComponentPropsWithRef<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-neutral-200 px-4 py-2.5 text-left font-medium whitespace-nowrap text-neutral-500',
        className,
      )}
      {...rest}
    />
  )
}

export function TD({ className, ...rest }: ComponentPropsWithRef<'td'>) {
  return <td className={cn('px-4 py-3 text-neutral-700', className)} {...rest} />
}
