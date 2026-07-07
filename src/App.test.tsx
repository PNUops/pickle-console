import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders the platform heading', () => {
  render(<App />)
  expect(
    screen.getByRole('heading', { name: '부산대학교 클라우드 플랫폼' }),
  ).toBeInTheDocument()
})
