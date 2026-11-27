import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, test, vi } from 'vitest'
import type { UserProfile } from '../../auth/auth-context'
import type { VmPlacementPreview } from '../../api/request-review'
import { previewVmPlacement } from '../../api/request-review'
import { vmRequestView } from './vm-view'
import { submittedAdminRequest } from '../../test/msw/handlers/admin'
import { osImages } from '../../test/msw/handlers/reference'
import { vmPlacementFixture } from '../../test/msw/handlers/vm-placement'
import { uuid } from '../../test/msw/ids'

const session = vi.hoisted(() => ({ user: null as UserProfile | null, activeOrgId: null as string | null }))
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ user: session.user }) }))
vi.mock('../../lib/use-admin-scope', () => ({ useAdminScope: () => ({ activeOrgId: session.activeOrgId }) }))
vi.mock('../../api/request-review', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../api/request-review')>(),
  previewVmPlacement: vi.fn(),
}))

const request = submittedAdminRequest(201)
function Harness({ onValidate }: { onValidate?: (errors: Record<string, string>) => void }) {
  const form = vmRequestView.useApproveForm(request, osImages)
  return <>{form.fields({})}{onValidate && <>
    <button onClick={() => onValidate(form.validate())}>승인 확인</button>
    <button disabled={form.confirmReady === false}>제출하고 승인</button>
  </>}</>
}

beforeEach(() => {
  session.user = { id: uuid(5), role: 'SYS_ADMIN', managedOrgs: [] } as unknown as UserProfile
  session.activeOrgId = uuid(1)
  vi.mocked(previewVmPlacement).mockReset().mockImplementation(async (body) => vmPlacementFixture(body))
})

test('a changed reader cannot see cached placement numbers while its own observation is pending', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = () => <QueryClientProvider client={client}><Harness /></QueryClientProvider>
  const view = render(tree())
  await screen.findByRole('region', { name: 'VM 배치 가능 자원' })
  let settle: (value: VmPlacementPreview) => void = () => undefined
  vi.mocked(previewVmPlacement).mockImplementationOnce(() => new Promise((resolve) => { settle = resolve }))
  session.user = { ...session.user!, institutionAuthority: { state: 'VALID_SOURCES', failure: null, accountRole: 'SYS_ADMIN', catalogueRevision: '4', authorityFingerprint: 'changed-assignment', assignments: [], catalogue: [] } }
  view.rerender(tree())
  expect(screen.queryByRole('region', { name: 'VM 배치 가능 자원' })).not.toBeInTheDocument()
  await waitFor(() => expect(previewVmPlacement).toHaveBeenCalledTimes(2))
  const fresh = vmPlacementFixture()
  fresh.candidates[0].nodeName = '새 권한의 서버'
  await act(async () => settle(fresh))
  expect(await screen.findByText('새 권한의 서버')).toBeInTheDocument()
  expect(screen.queryByText('pve2')).not.toBeInTheDocument()
  client.clear()
})

test('moving the active institution outside the request clears the observation without a new read', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = () => <QueryClientProvider client={client}><Harness /></QueryClientProvider>
  const view = render(tree())
  await screen.findByRole('region', { name: 'VM 배치 가능 자원' })
  session.activeOrgId = uuid(2)
  view.rerender(tree())
  expect(screen.queryByRole('region', { name: 'VM 배치 가능 자원' })).not.toBeInTheDocument()
  expect(previewVmPlacement).toHaveBeenCalledTimes(1)
  client.clear()
})

test('image-incompatible nodes are disabled while another eligible forced-node alternative remains selectable', async () => {
  vi.mocked(previewVmPlacement).mockImplementation(async (body) => {
    const preview = vmPlacementFixture(body)
    const sample = preview.candidates[0]
    preview.candidates.push(
      { ...sample, nodeId: uuid(3), nodeName: '이미지 없는 서버', eligible: false, exclusionReasons: ['IMAGE_UNAVAILABLE'], fitsOneNow: false },
      { ...sample, nodeId: uuid(4), nodeName: '다른 배치 후보', eligible: false, exclusionReasons: ['NODE_NOT_SELECTED'] },
    )
    return preview
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  await screen.findByRole('region', { name: 'VM 배치 가능 자원' })
  expect(screen.getByRole('option', { name: /이미지 없는 서버/ })).toBeDisabled()
  expect(screen.getByRole('option', { name: /다른 배치 후보/ })).toBeEnabled()
  client.clear()
})


test('forcing one node keeps uncalculated alternatives selectable without claiming their capacity', async () => {
  const user = userEvent.setup()
  vi.mocked(previewVmPlacement).mockImplementation(async (body) => {
    const preview = vmPlacementFixture(body)
    const sample = preview.candidates[0]
    preview.candidates = [sample, { ...sample, nodeId: uuid(3), nodeName: 'pve3' }].map((node) =>
      body.nodeId && node.nodeId !== body.nodeId
        ? { ...node, eligible: false, exclusionReasons: ['NODE_NOT_SELECTED'], fitsOneNow: false, placeableCount: 0, plannedCount: 0 }
        : node,
    )
    return preview
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  await screen.findByRole('region', { name: 'VM 배치 가능 자원' })
  await user.selectOptions(screen.getByLabelText('배치 노드'), uuid(2))
  const alternative = await screen.findByRole('option', { name: 'pve3 / 선택 시 다시 계산' })
  expect(alternative).toBeEnabled()
  expect(screen.queryByRole('option', { name: 'pve3 / 현재 1대 배치 조건 미충족' })).not.toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'pve2 / 현재 1대 배치 가능' })).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('배치 노드'), uuid(3))
  expect(await screen.findByRole('option', { name: 'pve2 / 선택 시 다시 계산' })).toBeEnabled()
  expect(screen.getByRole('option', { name: 'pve3 / 현재 1대 배치 가능' })).toBeInTheDocument()
  expect(previewVmPlacement).toHaveBeenLastCalledWith(expect.objectContaining({ nodeId: uuid(3) }))
  client.clear()
})

test('keyboard refresh keeps the button focused through a failed request and its retry', async () => {
  const user = userEvent.setup()
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  const refresh = await screen.findByRole('button', { name: '자원 다시 조회' })
  let fail!: (error: Error) => void
  vi.mocked(previewVmPlacement).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  refresh.focus()
  await user.keyboard(' ')
  expect(screen.getByText('이전 조회 결과예요. 새로 확인하고 있어요.')).toBeInTheDocument()
  expect(refresh).toHaveFocus()
  await user.keyboard(' ')
  expect(previewVmPlacement).toHaveBeenCalledTimes(2)
  await act(async () => fail(new Error('서버에 연결하지 못했어요.')))
  expect(await screen.findByText('서버에 연결하지 못했어요.')).toBeInTheDocument()
  expect(screen.queryByText('남은 CPU')).not.toBeInTheDocument()
  expect(refresh).toHaveFocus()
  await user.keyboard(' ')
  expect(await screen.findByText('확인된 서버 기준으로 1대 모두 배치 가능한 용량이 있어요.')).toBeInTheDocument()
  expect(refresh).toHaveFocus()
  client.clear()
})

test('retrying a first-load error keeps keyboard focus once numbers appear', async () => {
  const user = userEvent.setup()
  vi.mocked(previewVmPlacement).mockRejectedValueOnce(new Error('배치 조회 오류'))
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  await screen.findByText('배치 조회 오류')
  const refresh = screen.getByRole('button', { name: '자원 다시 조회' })
  refresh.focus()
  await user.keyboard(' ')
  expect(await screen.findByText('확인된 서버 기준으로 1대 모두 배치 가능한 용량이 있어요.')).toBeInTheDocument()
  expect(refresh).toHaveFocus()
  client.clear()
})

test('blocks automatic approval with a malformed candidate but allows an explicitly selected healthy node', async () => {
  const user = userEvent.setup()
  const validate = vi.fn()
  vi.mocked(previewVmPlacement).mockImplementation(async (body) => {
    const preview = vmPlacementFixture(body)
    preview.candidates.push({ ...preview.candidates[0], nodeId: uuid(3), nodeName: 'pve3',
      eligible: false, capacityMode: 'INVALID', budget: null, fitsOneNow: false,
      exclusionReasons: body.nodeId ? ['INVALID_CAPACITY', 'NODE_NOT_SELECTED'] : ['INVALID_CAPACITY'],
    })
    return preview
  })
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><Harness onValidate={validate} /></QueryClientProvider>)
  expect(await screen.findByText('자동 배치를 진행할 수 없어요')).toBeInTheDocument()
  expect(screen.queryByText(/1대 모두 배치 가능한 용량/)).not.toBeInTheDocument()
  const confirm = screen.getByRole('button', { name: '제출하고 승인' })
  expect(confirm).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '승인 확인' }))
  expect(validate).toHaveBeenLastCalledWith({ 'vm.nodeId': expect.stringContaining('정상 서버를 선택') })

  await user.selectOptions(screen.getByLabelText('배치 노드'), uuid(2))
  expect(await screen.findByText(/1대 모두 배치 가능한 용량/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '승인 확인' }))
  expect(validate).toHaveBeenLastCalledWith({})
  expect(confirm).toBeEnabled()
  vi.mocked(previewVmPlacement).mockRejectedValueOnce(new Error('서버 상태를 확인하지 못했어요.'))
  const refresh = screen.getByRole('button', { name: '자원 다시 조회' })
  await user.click(refresh)
  await screen.findByText('서버 상태를 확인하지 못했어요.')
  expect(confirm).toBeDisabled()
  await user.click(refresh)
  await waitFor(() => expect(confirm).toBeEnabled())
  client.clear()
})
