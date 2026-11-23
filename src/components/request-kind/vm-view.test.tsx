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
function Harness() {
  const form = vmRequestView.useApproveForm(request, osImages)
  return <>{form.fields({})}</>
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
