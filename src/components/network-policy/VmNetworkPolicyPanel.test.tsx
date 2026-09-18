import { StrictMode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { UpdateVmNetworkPolicyRequest, VmNetworkPolicyView } from '../../api/queries'
import { uuid } from '../../test/msw/ids'
import { VmNetworkPolicyPanel } from './VmNetworkPolicyPanel'

const vmOne = uuid(56)
const vmTwo = uuid(57)

const base: VmNetworkPolicyView = {
  revision: 3,
  rules: [{
    direction: 'IN', action: 'ACCEPT', protocol: 'TCP',
    peer: '192.0.2.0/24', portStart: 443, portEnd: 443,
  }],
  systemRules: [{ key: 'SSH_GATEWAY', description: '플랫폼 SSH 접속' }],
  applyState: 'APPLIED',
  desiredGeneration: 8,
  appliedGeneration: 8,
  lastError: null,
  updatedAt: '2026-09-18T12:00:00+09:00',
}

interface MountOptions {
  vmId?: string
  canEdit?: boolean
  surface?: 'user' | 'admin'
  strictMode?: boolean
  loadPolicy?: (vmId: string) => Promise<VmNetworkPolicyView>
  savePolicy?: (vmId: string, body: UpdateVmNetworkPolicyRequest) => Promise<VmNetworkPolicyView>
}

function mount(options: MountOptions = {}) {
  const { vmId = vmOne, canEdit = true, surface = 'user' } = options
  const loadPolicy = options.loadPolicy ?? vi.fn().mockResolvedValue(base)
  const savePolicy = options.savePolicy ?? vi.fn().mockResolvedValue({
    ...base, revision: base.revision + 1, applyState: 'PENDING',
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const panel = (id: string) => (
    <QueryClientProvider client={client}>
      <VmNetworkPolicyPanel
        vmId={id}
        canEdit={canEdit}
        surface={surface}
        loadPolicy={() => loadPolicy(id)}
        savePolicy={(body) => savePolicy(id, body)}
      />
    </QueryClientProvider>
  )
  const view = (id: string) => options.strictMode
    ? <StrictMode>{panel(id)}</StrictMode>
    : panel(id)
  const rendered = render(view(vmId))
  return { client, loadPolicy, savePolicy, rerenderVm: (id: string) => rendered.rerender(view(id)) }
}

afterEach(() => vi.unstubAllEnvs())

describe('VM network policy panel', () => {
  test('does not query or render while the consumer flag is off', async () => {
    const loadPolicy = vi.fn().mockResolvedValue(base)
    mount({ loadPolicy })
    await act(async () => {})
    expect(screen.queryByLabelText('VM 통신 정책')).not.toBeInTheDocument()
    expect(loadPolicy).not.toHaveBeenCalled()
  })

  test('saves the frozen revision with normalized IPv4 and ordered rules', async () => {
    vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', '1')
    let finishSave: ((value: VmNetworkPolicyView) => void) | undefined
    const savePolicy = vi.fn(() => new Promise<VmNetworkPolicyView>((resolve) => { finishSave = resolve }))
    const user = userEvent.setup()
    mount({ savePolicy, strictMode: true })
    const peer = await screen.findByLabelText('출발지 IP/CIDR')
    await user.clear(peer)
    await user.type(peer, '198.51.100.7')
    await user.click(screen.getByRole('button', { name: '규칙 추가' }))
    const peers = screen.getAllByLabelText('출발지 IP/CIDR')
    await user.type(peers[1], '203.0.113.0/24')
    await user.click(screen.getByRole('button', { name: '통신 정책 저장' }))
    await waitFor(() => expect(savePolicy).toHaveBeenCalledWith(vmOne, {
      expectedRevision: 3, rules: [
        { direction: 'IN', action: 'ACCEPT', protocol: 'TCP', peer: '198.51.100.7/32', portStart: 443, portEnd: 443 },
        { direction: 'IN', action: 'ACCEPT', protocol: 'TCP', peer: '203.0.113.0/24', portStart: null, portEnd: null },
      ],
    }))
    await act(async () => finishSave?.({ ...base, revision: 4, applyState: 'PENDING' }))
    expect(await screen.findByText('반영 대기')).toBeInTheDocument()
  })

  test('preserves a dirty draft on 409 until explicit reload', async () => {
    vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', '1')
    const latest = { ...base, revision: 4, rules: [{ ...base.rules[0], peer: '203.0.113.0/24' }] }
    let finishReload: ((value: VmNetworkPolicyView) => void) | undefined
    const loadPolicy = vi.fn().mockResolvedValueOnce(base).mockImplementation(
      () => new Promise<VmNetworkPolicyView>((resolve) => { finishReload = resolve }),
    )
    const savePolicy = vi.fn().mockRejectedValue({
      status: 409, title: '충돌', detail: '최신 정책을 다시 불러오세요.',
      code: 'VM_NETWORK_POLICY_REVISION_CONFLICT',
    })
    const user = userEvent.setup()
    mount({ loadPolicy, savePolicy, strictMode: true })
    const peer = await screen.findByLabelText('출발지 IP/CIDR')
    await user.clear(peer)
    await user.type(peer, '198.51.100.0/24')
    await user.click(screen.getByRole('button', { name: '통신 정책 저장' }))
    expect(await screen.findByText(/작성 중인 규칙은 보존했습니다/)).toBeInTheDocument()
    expect(peer).toHaveValue('198.51.100.0/24')
    expect(screen.getByRole('button', { name: '통신 정책 저장' })).toBeDisabled()
    await user.clear(peer)
    await user.type(peer, '198.51.100.128/25')
    fireEvent.submit(screen.getByRole('form', { name: 'VM 통신 정책 규칙' }))
    expect(savePolicy).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '최신 정책 불러오기' }))
    await waitFor(() => expect(finishReload).toBeTypeOf('function'))
    await act(async () => finishReload?.(latest))
    await waitFor(() => expect(screen.getByLabelText('출발지 IP/CIDR')).toHaveValue('203.0.113.0/24'))
  })

  test('does not apply a deferred save response after switching VMs', async () => {
    vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', '1')
    let finish: ((value: VmNetworkPolicyView) => void) | undefined
    const loadPolicy = vi.fn((id: string) => Promise.resolve(id === vmOne
      ? base
      : { ...base, revision: 9, rules: [{ ...base.rules[0], peer: '198.51.100.0/24' }] }))
    const savePolicy = vi.fn(() => new Promise<VmNetworkPolicyView>((resolve) => { finish = resolve }))
    const user = userEvent.setup()
    const { rerenderVm } = mount({ loadPolicy, savePolicy })
    await screen.findByDisplayValue('192.0.2.0/24')
    await user.click(screen.getByRole('button', { name: '통신 정책 저장' }))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    rerenderVm(vmTwo)
    await screen.findByDisplayValue('198.51.100.0/24')
    await act(async () => finish?.({ ...base, revision: 4 }))
    expect(screen.getByLabelText('출발지 IP/CIDR')).toHaveValue('198.51.100.0/24')
  })

  test('does not let an old A response overwrite a newer A revision after A-B-A navigation', async () => {
    vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', '1')
    let finish: ((value: VmNetworkPolicyView) => void) | undefined
    let vmOneLoads = 0
    const latest = {
      ...base, revision: 9,
      rules: [{ ...base.rules[0], peer: '203.0.113.0/24' }],
    }
    const loadPolicy = vi.fn((id: string) => {
      if (id !== vmOne) return Promise.resolve({ ...base, revision: 6 })
      vmOneLoads += 1
      return Promise.resolve(vmOneLoads === 1 ? base : latest)
    })
    const savePolicy = vi.fn(() => new Promise<VmNetworkPolicyView>((resolve) => { finish = resolve }))
    const user = userEvent.setup()
    const { client, rerenderVm } = mount({ loadPolicy, savePolicy, strictMode: true })
    await screen.findByDisplayValue('192.0.2.0/24')
    await user.click(screen.getByRole('button', { name: '통신 정책 저장' }))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    rerenderVm(vmTwo)
    await screen.findByDisplayValue('192.0.2.0/24')
    rerenderVm(vmOne)
    await waitFor(() => expect(screen.getByLabelText('출발지 IP/CIDR')).toHaveValue('203.0.113.0/24'))
    await act(async () => finish?.({ ...base, revision: 4 }))
    expect(client.getQueryData<VmNetworkPolicyView>(['vm-network-policy', 'user', vmOne])?.revision).toBe(9)
    expect(screen.getByLabelText('출발지 IP/CIDR')).toHaveValue('203.0.113.0/24')
  })

  test('hides inactive and unavailable policies instead of preparing an editor', async () => {
    vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', '1')
    const loadPolicy = vi.fn((id: string) => id === vmTwo
      ? Promise.resolve({
        ...base, revision: 0, rules: [], applyState: 'INACTIVE' as const,
        desiredGeneration: null, appliedGeneration: null, updatedAt: null,
      })
      : Promise.reject({ status: 409, code: 'VM_NETWORK_POLICY_UNAVAILABLE', detail: '사용할 수 없습니다.' }))
    const { rerenderVm } = mount({ loadPolicy })
    rerenderVm(vmTwo)
    await waitFor(() => expect(screen.queryByLabelText('VM 통신 정책')).not.toBeInTheDocument())
    rerenderVm(uuid(58))
    await waitFor(() => expect(screen.queryByText('VM 통신 정책을 불러오지 못했습니다')).not.toBeInTheDocument())
  })

  test('shows read-only rules and distinguishes failed-closed readback from packet success', async () => {
    vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', '1')
    const loadPolicy = vi.fn().mockResolvedValue({
      ...base, applyState: 'FAILED_CLOSED', lastError: 'mutable rule 적용 실패',
    })
    mount({ canEdit: false, surface: 'admin', loadPolicy })
    expect(await screen.findByText('실패(차단 설정 확인)')).toBeInTheDocument()
    expect(screen.getByText(/차단 설정 반영을 확인했습니다. 실제 연결은 별도로 확인해 주세요/)).toBeInTheDocument()
    expect(screen.getByText('mutable rule 적용 실패')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '통신 정책 저장' })).not.toBeInTheDocument()
    expect(screen.getByText('플랫폼 SSH 접속')).toBeInTheDocument()
  })
})
