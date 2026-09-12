import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { GpuUtilization } from './GpuUtilization'
import { currentGpuUtilization, GPU_SAMPLE_FRESHNESS_MS } from '../../lib/gpu-utilization'

const now = Date.parse('2026-09-12T09:00:00Z')
afterEach(() => vi.useRealTimers())

describe('GPU measurement freshness', () => {
  test('a fresh measured zero is usage, while no collector provides no measurement', () => {
    expect(currentGpuUtilization(0, '2026-09-12T08:55:00Z', now)).toBe(0)
    expect(currentGpuUtilization(null, null, now)).toBeNull()
    expect(currentGpuUtilization(0, null, now)).toBeNull()
    expect(currentGpuUtilization(0, '2026-09-12T09:00:01Z', now)).toBeNull()
    expect(currentGpuUtilization(0, '2026-09-12T08:49:59Z', now)).toBeNull()
    expect(currentGpuUtilization(0, '2026-09-12T08:50:00Z', now)).toBe(0)
  })
  test('an old zero and a future sample never render as current zero', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const view = render(<GpuUtilization value={0} observedAt="2026-09-12T08:49:59Z" />)
    expect(screen.getByText('측정 불가')).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    view.rerender(<GpuUtilization value={0} observedAt="2026-09-12T09:00:01Z" />)
    expect(screen.getByText('측정 불가')).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    view.rerender(<GpuUtilization value={null} observedAt={null} />)
    expect(screen.getByText('측정 불가')).toBeInTheDocument()
  })
  test('a displayed zero expires after ten minutes without another response', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    render(<GpuUtilization value={0} observedAt="2026-09-12T09:00:00Z" />)
    expect(screen.getByText('0%')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(GPU_SAMPLE_FRESHNESS_MS + 1))
    expect(screen.getByText('측정 불가')).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })
})
