import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { OpenRouterCatalogue } from '../api/queries'
import { CreditModelPreview } from './CreditModelPreview'

const catalogue: OpenRouterCatalogue = {
  models: [{
    id: 'example/text', name: 'Example text', promptPricePerMillion: 1,
    completionPricePerMillion: 3, contextLength: 12500, pricing: null,
  }],
  freshness: 'FRESH', lastAttemptAt: '2026-10-24T00:00:00Z',
  lastSuccessAt: '2026-10-24T00:00:00Z', lastError: null, consecutiveFailures: 0,
}

describe('credit model policy candidates', () => {
  test('labels a pattern match as a candidate rather than an actual call grant', () => {
    render(<CreditModelPreview catalogue={catalogue} failed={false} allowed={[]} denied={[]} invalid={false} />)

    expect(screen.getByText(/패턴 조건을 통과하는 후보 1개/)).toBeInTheDocument()
    expect(screen.queryByText(/전부를 쓸 수 있습니다/)).not.toBeInTheDocument()
    expect(screen.getByText(/기능 권한.*호출/)).toBeInTheDocument()
  })
})
