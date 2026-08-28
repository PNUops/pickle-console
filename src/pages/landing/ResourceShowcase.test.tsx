import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ResourceShowcase } from './ResourceShowcase'

// 랜딩의 리소스 라인업은 콘솔 사이드바(layouts/ConsoleLayout.tsx)와 같아야 한다.
// 사이드바에서 준비 중 항목이 열리거나 늘면 이 단언이 깨져 랜딩을 같이 고치게 된다.
describe('랜딩 리소스 쇼케이스', () => {
  test('서비스 중 2종과 준비 중 7종을 모두 세운다', () => {
    render(<ResourceShowcase />)
    for (const title of ['가상머신', 'LLM API 키']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    const planned = [
      '컨테이너',
      '컨테이너 레지스트리',
      '데이터베이스',
      '오브젝트 스토리지',
      'GPU',
      '도메인',
      '단축 링크',
    ]
    for (const title of planned) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    expect(screen.getAllByText('준비 중')).toHaveLength(7)
  })
})
