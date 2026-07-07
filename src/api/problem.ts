import type { components } from './schema'

export type Problem = components['schemas']['Problem']

export function isProblem(value: unknown): value is Problem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'status' in value &&
    typeof (value as { code: unknown }).code === 'string'
  )
}

/** Error thrown by auth actions so callers can branch on the stable problem code. */
export class ApiError extends Error {
  readonly problem: Problem | null

  constructor(problem: Problem | null, fallbackMessage: string) {
    super(problem?.detail ?? problem?.title ?? fallbackMessage)
    this.name = 'ApiError'
    this.problem = problem
  }

  get code(): string | null {
    return this.problem?.code ?? null
  }
}

export function toApiError(error: unknown, fallbackMessage: string): ApiError {
  return new ApiError(isProblem(error) ? error : null, fallbackMessage)
}
