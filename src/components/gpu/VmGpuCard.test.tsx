import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { VmGpuCard } from './VmGpuCard'
import type { VmDetail } from '../../api/queries'
import { uuid } from '../../test/msw/ids'

const gpu: NonNullable<VmDetail['gpu']> = { allocationId: uuid(901), allocationName: '학습 GPU', model: '테스트 GPU', connectionStatus: 'ATTACHED', detailAccessAllowed: true }
afterEach(() => vi.unstubAllEnvs())

describe('VM GPU summary', () => {
  test('shows the connected GPU after the VM information in previews', () => {
    vi.stubEnv('VITE_GPU_PREVIEW', '1')
    render(<MemoryRouter><VmGpuCard gpu={gpu} /></MemoryRouter>)
    expect(screen.getByText('테스트 GPU')).toBeInTheDocument()
    expect(screen.getByText('연결됨')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GPU 할당 보기' })).toHaveAttribute('href', `/console/gpus/${uuid(901)}`)
  })
  test('VM visibility does not grant access to a separate GPU allocation', () => {
    vi.stubEnv('VITE_GPU_PREVIEW', '1')
    render(<MemoryRouter><VmGpuCard gpu={{ ...gpu, detailAccessAllowed: false }} /></MemoryRouter>)
    expect(screen.getByText('테스트 GPU')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
  test('the default build does not show an unopened GPU feature', () => {
    vi.stubEnv('VITE_GPU_PREVIEW', '')
    render(<MemoryRouter><VmGpuCard gpu={gpu} /></MemoryRouter>)
    expect(screen.queryByRole('heading', { name: 'GPU' })).not.toBeInTheDocument()
  })
})
