import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { NetworkPolicyStatus } from './NetworkPolicyStatus'
import type { NetworkPolicyObservation } from './model'

describe('network policy observation', () => {
  test.each([
    [{ state: 'INACTIVE' }, '비활성'],
    [{ state: 'PENDING' }, '반영 대기'],
    [{ state: 'APPLIED' }, '설정 확인'],
    [{ state: 'FAILED', message: '설정을 확인하지 못했습니다.' }, '설정 실패'],
  ] satisfies [NetworkPolicyObservation, string][])('renders each observation separately', (observation, label) => {
    render(<NetworkPolicyStatus observation={observation} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByText(/보호 중|통신 검증 완료|적용 완료/)).not.toBeInTheDocument()
    if (observation.state === 'FAILED') expect(screen.getByRole('alert')).toHaveTextContent(observation.message)
    else expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
