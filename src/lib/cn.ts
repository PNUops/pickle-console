import { twMerge } from 'tailwind-merge'

/** Join class names and let the caller's Tailwind utilities override defaults. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(' '))
}
