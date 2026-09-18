import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { SourcePolicyView } from '../../api/queries'
import { SourcePolicyPanel } from './SourcePolicyPanel'

const initial: SourcePolicyView = {
  revision: 0,
  explicit: false,
  allowedCidrs: [],
  applyState: 'APPLIED',
}

function mount({
  loadPolicy = vi.fn().mockResolvedValue(initial),
  savePolicy = vi.fn().mockResolvedValue({
    ...initial,
    revision: 1,
    explicit: true,
    allowedCidrs: ['192.0.2.7/32'],
  }),
  queryKey = ['test', 'source-policy'] as const,
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const panel = (key: readonly unknown[], loader: () => Promise<SourcePolicyView>) => (
    <QueryClientProvider client={client}>
      <SourcePolicyPanel
        queryKey={key}
        target="DOMAIN"
        loadPolicy={loader}
        savePolicy={savePolicy}
        loadPreset={vi.fn().mockResolvedValue({
          key: 'CAMPUS', target: 'DOMAIN', allowedCidrs: ['10.0.0.0/8'],
        })}
        canEdit
      />
    </QueryClientProvider>
  )
  const rendered = render(panel(queryKey, loadPolicy))
  return {
    client,
    loadPolicy,
    savePolicy,
    rerenderPolicy: (key: readonly unknown[], loader: () => Promise<SourcePolicyView>) =>
      rendered.rerender(panel(key, loader)),
  }
}

afterEach(() => vi.unstubAllEnvs())

describe('source policy panel', () => {
  test('is absent by default', () => {
    const loadPolicy = vi.fn().mockResolvedValue(initial)
    mount({ loadPolicy })
    expect(screen.queryByLabelText('출발지 정책')).not.toBeInTheDocument()
    expect(loadPolicy).not.toHaveBeenCalled()
  })

  test('saves the currently loaded revision and normalized direct IP', async () => {
    vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', '1')
    const user = userEvent.setup()
    const { savePolicy } = mount()
    await user.type(await screen.findByLabelText('허용할 출발지'), '192.0.2.7')
    await user.click(screen.getByRole('button', { name: '출발지 정책 저장' }))
    await waitFor(() => expect(savePolicy).toHaveBeenCalledWith({
      expectedRevision: 0,
      allowedCidrs: ['192.0.2.7/32'],
    }))
    expect(await screen.findByText('저장된 CIDR 목록만 새 연결을 허용합니다.')).toBeInTheDocument()
  })

  test('keeps local edits and blocks retry after a revision conflict', async () => {
    vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', '1')
    const user = userEvent.setup()
    const loadPolicy = vi.fn()
      .mockResolvedValueOnce({ ...initial, revision: 3, explicit: true, allowedCidrs: ['192.0.2.0/24'] })
      .mockResolvedValue({ ...initial, revision: 4, explicit: true, allowedCidrs: ['198.51.100.0/24'] })
    const savePolicy = vi.fn().mockRejectedValue({
      status: 409,
      code: 'SOURCE_POLICY_REVISION_CONFLICT',
      title: '충돌',
      detail: '최신 정책을 다시 불러오세요.',
    })
    mount({ loadPolicy, savePolicy })
    const textarea = await screen.findByLabelText('허용할 출발지')
    await waitFor(() => expect(textarea).toHaveValue('192.0.2.0/24'))
    await user.clear(textarea)
    await user.type(textarea, '203.0.113.0/24')
    await user.click(screen.getByRole('button', { name: '출발지 정책 저장' }))

    expect(await screen.findByText(/입력은 보존했습니다/)).toBeInTheDocument()
    expect(textarea).toHaveValue('203.0.113.0/24')
    expect(screen.getByRole('button', { name: '출발지 정책 저장' })).toBeDisabled()
    expect(savePolicy).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '최신 정책 불러오기' }))
    await waitFor(() => expect(textarea).toHaveValue('198.51.100.0/24'))
    expect(screen.getByRole('button', { name: '출발지 정책 저장' })).not.toBeDisabled()
    expect(savePolicy).toHaveBeenCalledTimes(1)
  })

  test('blocks a dirty draft when a background refetch advances the revision', async () => {
    vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', '1')
    const user = userEvent.setup()
    const loadPolicy = vi.fn()
      .mockResolvedValueOnce({ ...initial, revision: 1, explicit: true, allowedCidrs: ['192.0.2.0/24'] })
      .mockResolvedValue({ ...initial, revision: 2, explicit: true, allowedCidrs: ['198.51.100.0/24'] })
    const savePolicy = vi.fn()
    const { client } = mount({ loadPolicy, savePolicy })
    const textarea = await screen.findByLabelText('허용할 출발지')
    await waitFor(() => expect(textarea).toHaveValue('192.0.2.0/24'))
    await user.clear(textarea)
    await user.type(textarea, '203.0.113.0/24')

    await client.invalidateQueries({ queryKey: ['test', 'source-policy'] })
    expect(await screen.findByText(/편집 중 다른 변경이 저장되었습니다/)).toBeInTheDocument()
    expect(textarea).toHaveValue('203.0.113.0/24')
    expect(screen.getByRole('button', { name: '출발지 정책 저장' })).toBeDisabled()
    expect(savePolicy).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '최신 정책 불러오기' }))
    await waitFor(() => expect(textarea).toHaveValue('198.51.100.0/24'))
    expect(screen.getByRole('button', { name: '출발지 정책 저장' })).not.toBeDisabled()
  })

  test('discards draft and base revision when the resource key changes', async () => {
    vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', '1')
    const user = userEvent.setup()
    const first = vi.fn().mockResolvedValue({
      ...initial, revision: 7, explicit: true, allowedCidrs: ['192.0.2.0/24'],
    })
    const second = vi.fn().mockResolvedValue({
      ...initial, revision: 11, explicit: true, allowedCidrs: ['198.51.100.0/24'],
    })
    const { rerenderPolicy } = mount({ loadPolicy: first })
    const textarea = await screen.findByLabelText('허용할 출발지')
    await waitFor(() => expect(textarea).toHaveValue('192.0.2.0/24'))
    await user.clear(textarea)
    await user.type(textarea, '203.0.113.0/24')

    rerenderPolicy(['test', 'another-policy'], second)
    await waitFor(() => expect(screen.getByLabelText('허용할 출발지')).toHaveValue('198.51.100.0/24'))
    expect(screen.queryByDisplayValue('203.0.113.0/24')).not.toBeInTheDocument()
  })

  test('does not apply a deferred save result to a different resource', async () => {
    vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', '1')
    const user = userEvent.setup()
    let finishSave: ((value: SourcePolicyView) => void) | undefined
    const savePolicy = vi.fn(() => new Promise<SourcePolicyView>((resolve) => { finishSave = resolve }))
    const firstPolicy = { ...initial, revision: 5, explicit: true, allowedCidrs: ['192.0.2.0/24'] }
    const secondPolicy = { ...initial, revision: 8, explicit: true, allowedCidrs: ['198.51.100.0/24'] }
    const first = vi.fn().mockResolvedValue(firstPolicy)
    const second = vi.fn().mockResolvedValue(secondPolicy)
    const { client, rerenderPolicy } = mount({ loadPolicy: first, savePolicy })
    const textarea = await screen.findByLabelText('허용할 출발지')
    await waitFor(() => expect(textarea).toHaveValue('192.0.2.0/24'))
    await user.clear(textarea)
    await user.type(textarea, '203.0.113.0/24')
    await user.click(screen.getByRole('button', { name: '출발지 정책 저장' }))
    await waitFor(() => expect(savePolicy).toHaveBeenCalledTimes(1))

    rerenderPolicy(['test', 'another-policy'], second)
    await waitFor(() => expect(screen.getByLabelText('허용할 출발지')).toHaveValue('198.51.100.0/24'))
    const saved = { ...firstPolicy, revision: 6, allowedCidrs: ['203.0.113.0/24'] }
    await act(async () => finishSave?.(saved))

    expect(screen.getByLabelText('허용할 출발지')).toHaveValue('198.51.100.0/24')
    expect(client.getQueryData(['test', 'source-policy'])).toEqual(saved)
    expect(client.getQueryData(['test', 'another-policy'])).toEqual(secondPolicy)
  })

  test('does not apply a deferred manual reload to a different resource', async () => {
    vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', '1')
    const user = userEvent.setup()
    let finishReload: ((value: SourcePolicyView) => void) | undefined
    const firstPolicy = { ...initial, revision: 2, explicit: true, allowedCidrs: ['192.0.2.0/24'] }
    const backgroundPolicy = { ...initial, revision: 3, explicit: true, allowedCidrs: ['198.51.100.0/24'] }
    const reloadedPolicy = { ...initial, revision: 4, explicit: true, allowedCidrs: ['203.0.113.0/24'] }
    const secondPolicy = { ...initial, revision: 9, explicit: true, allowedCidrs: ['192.0.2.128/25'] }
    const first = vi.fn()
      .mockResolvedValueOnce(firstPolicy)
      .mockImplementationOnce(() => new Promise<SourcePolicyView>((resolve) => { finishReload = resolve }))
    const second = vi.fn().mockResolvedValue(secondPolicy)
    const { client, rerenderPolicy } = mount({ loadPolicy: first })
    const textarea = await screen.findByLabelText('허용할 출발지')
    await waitFor(() => expect(textarea).toHaveValue('192.0.2.0/24'))
    await user.clear(textarea)
    await user.type(textarea, '203.0.113.128/25')
    act(() => client.setQueryData(['test', 'source-policy'], backgroundPolicy))
    await user.click(await screen.findByRole('button', { name: '최신 정책 불러오기' }))
    await waitFor(() => expect(first).toHaveBeenCalledTimes(2))

    rerenderPolicy(['test', 'another-policy'], second)
    await waitFor(() => expect(screen.getByLabelText('허용할 출발지')).toHaveValue('192.0.2.128/25'))
    await act(async () => finishReload?.(reloadedPolicy))

    expect(screen.getByLabelText('허용할 출발지')).toHaveValue('192.0.2.128/25')
    expect(client.getQueryData(['test', 'source-policy'])).toEqual(reloadedPolicy)
    expect(client.getQueryData(['test', 'another-policy'])).toEqual(secondPolicy)
  })
})
