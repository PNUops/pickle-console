import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { UsageMailPreferenceCard } from './UsageMailPreferenceCard'

test('known ON changes only the personal usage-mail boolean', async () => {
  const save = vi.fn()
  render(<UsageMailPreferenceCard enabled loading={false} saving={false} onSave={save} onRetry={() => {}} />)
  const checkbox = screen.getByRole('checkbox', { name: '사용량 알림 메일 받기' })
  expect(checkbox).toBeChecked()
  expect(screen.getByText('키 한도를 모두 사용하면 메일로 알려드려요. 꺼도 알림함에서는 확인할 수 있어요.')).toBeInTheDocument()
  expect(screen.queryByText(/기본은 켬|서버 관측|80% 도달|100% 도달/)).not.toBeInTheDocument()
  await userEvent.click(checkbox)
  await userEvent.click(screen.getByRole('button', { name: '메일 설정 저장' }))
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith(false)
})

test('an unknown setting is not presented as a known unchecked value', () => {
  render(<UsageMailPreferenceCard enabled={undefined} loading saving={false} onSave={() => {}} onRetry={() => {}} />)
  expect(screen.queryByRole('checkbox', { name: '사용량 알림 메일 받기' })).not.toBeInTheDocument()
})

test('a failed initial read remains unknown and offers a retry', async () => {
  const retry = vi.fn()
  render(<UsageMailPreferenceCard enabled={undefined} loading={false} saving={false} error="설정을 조회하지 못했습니다." onSave={() => {}} onRetry={retry} />)
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '메일 설정 다시 조회' }))
  expect(retry).toHaveBeenCalledTimes(1)
})
