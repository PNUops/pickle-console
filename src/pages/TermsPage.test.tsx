import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderApp } from '../test/render'

describe('약관 공개 페이지', () => {
  test('문서 본문을 인증 없이 표시한다', async () => {
    renderApp('/terms/TERMS_OF_SERVICE')
    expect(await screen.findByRole('heading', { name: '피클 서비스 이용약관' })).toBeInTheDocument()
    expect(screen.getByText(/버전 1/)).toBeInTheDocument()
  })

  test('알 수 없는 문서 종류는 안내를 표시한다', async () => {
    renderApp('/terms/UNKNOWN')
    expect(await screen.findByText('요청한 문서를 찾을 수 없습니다.')).toBeInTheDocument()
  })
})
