import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import uPlot from 'uplot'
import { TimeSeriesChart } from './TimeSeriesChart'

vi.mock('uplot', () => ({ default: vi.fn(function (_options: uPlot.Options, data: uPlot.AlignedData) {
  return { data, over: document.createElement('div'), cursor: { idx: null, left: 0, top: 0 }, setSize: vi.fn(), setData: vi.fn(), destroy: vi.fn() }
}) }))

beforeEach(() => {
  vi.mocked(uPlot).mockClear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
})
afterEach(() => { vi.restoreAllMocks() })

function axisLabels(splits: number[]) {
  const format = vi.mocked(uPlot).mock.calls.at(-1)![0].axes![0].values
  if (typeof format !== 'function') throw new Error('Expected a time-axis formatter')
  return format({} as uPlot, splits, 0, 0, 0)
}

const fullTime = (time: number) => `2026-10-20 09:00:0${time}.125 KST`

test('shortens axis labels while preserving exact point times and observations', async () => {
  const user = userEvent.setup()
  render(<TimeSeriesChart title="요청 기록" times={[1, 2]} series={[{ label: '요청', data: [7, null] }]}
    format={String} formatDetail={String} formatTime={fullTime} formatAxisTime={(time) => `09:00:0${time}`} />)
  expect(axisLabels([1, 2])).toEqual(['09:00:01', '09:00:02'])
  expect(screen.getByRole('option', { name: fullTime(1) })).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: '요청 기록 정확값' }), '1')
  expect(screen.getByText('요청 7')).toBeVisible()
  await user.selectOptions(screen.getByRole('combobox'), '2')
  expect(screen.getByText('요청 —')).toBeVisible()
})

test('keeps the existing formatter as the default and refreshes an axis override without rebuilding the plot', () => {
  const props = { title: '요청 기록', times: [1, 2], series: [{ label: '요청', data: [7, 8] }], format: String, formatDetail: String, formatTime: fullTime }
  const view = render(<TimeSeriesChart {...props} />)
  expect(axisLabels([1])).toEqual([fullTime(1)])
  view.rerender(<TimeSeriesChart {...props} formatAxisTime={() => '10-20'} />)
  expect(vi.mocked(uPlot)).toHaveBeenCalledTimes(1)
  expect(axisLabels([1])).toEqual(['10-20'])
  expect(screen.getByRole('option', { name: fullTime(1) })).toBeInTheDocument()
})
