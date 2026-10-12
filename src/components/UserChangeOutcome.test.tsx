import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fetchUserSupport, type ProfileImpact, type UserSupport } from '../api/admin-user-support'
import { supportFixture } from '../test/msw/handlers/user-support'
import { uuid } from '../test/msw/ids'
import { UserChangeOutcome } from './UserSupport'

vi.mock('../api/admin-user-support', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/admin-user-support')>(),
  fetchUserSupport: vi.fn(),
}))

let queryClient: QueryClient

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-12T12:00:00Z'))
  vi.mocked(fetchUserSupport).mockReset()
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  vi.useRealTimers()
})

function queuedSupport(status: 'SUBMITTED' | 'APPROVED'): UserSupport {
  const data = supportFixture(uuid(42))
  return { ...data, resources: [], requests: data.requests.map((request) => ({
    ...request, status, recipientStatus: 'QUEUED', resourceId: null,
  })) }
}

function renderOutcome(data: UserSupport) {
  const impact: ProfileImpact = {
    action: 'PROFILE', userId: data.userId, observedAt: data.observedAt,
    candidateStatus: 'ACTIVE', claimsPossible: true, studentNoWillChange: true,
    invitations: [{
      id: uuid(501), workspaceId: uuid(11), workspaceName: '연구팀', workspaceKind: 'LAB',
      role: 'MEMBER', status: 'PENDING', matchedBy: 'EMAIL', acceptedAt: null, alreadyMember: false,
      recipients: [{ requestId: uuid(201), orgId: uuid(1), type: 'VM', requestStatus: data.requests[0].status,
        status: 'PENDING_JOIN', projectedStatus: 'QUEUED', grantedEndDate: null }],
    }],
  }
  render(<MemoryRouter><QueryClientProvider client={queryClient}>
    <UserChangeOutcome impact={impact} actualStatus="ACTIVE" />
  </QueryClientProvider></MemoryRouter>)
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

test('an approval-waiting recipient is read once without automatic polling', async () => {
  const data = queuedSupport('SUBMITTED')
  vi.mocked(fetchUserSupport).mockResolvedValue(data)
  renderOutcome(data)
  await advance(100)
  expect(screen.getByText('승인 대기')).toBeInTheDocument()
  await advance(60_000)
  expect(fetchUserSupport).toHaveBeenCalledTimes(1)
})

test('creation polling stops at its time limit and manual refresh still works', async () => {
  const data = queuedSupport('APPROVED')
  vi.mocked(fetchUserSupport).mockResolvedValue(data)
  renderOutcome(data)
  await advance(100)
  expect(fetchUserSupport).toHaveBeenCalledTimes(1)
  await advance(15_000)
  expect(fetchUserSupport).toHaveBeenCalledTimes(2)
  await advance(8 * 60_000 + 45_000)
  const callsBeforeLimit = vi.mocked(fetchUserSupport).mock.calls.length
  expect(callsBeforeLimit).toBeGreaterThan(30)
  await advance(15_000)
  expect(fetchUserSupport).toHaveBeenCalledTimes(callsBeforeLimit + 1)
  await advance(45_000)
  const callsAtLimit = vi.mocked(fetchUserSupport).mock.calls.length
  expect(callsAtLimit).toBeLessThanOrEqual(41)
  await advance(60_000)
  expect(fetchUserSupport).toHaveBeenCalledTimes(callsAtLimit)
  fireEvent.click(screen.getByRole('button', { name: '변경 후 결과 새로고침' }))
  await advance(100)
  expect(fetchUserSupport).toHaveBeenCalledTimes(callsAtLimit + 1)
})

test('a completed recipient stops creation polling before the time limit', async () => {
  const data = queuedSupport('APPROVED')
  vi.mocked(fetchUserSupport).mockResolvedValueOnce(data).mockResolvedValue({
    ...data, requests: data.requests.map((request) => ({ ...request, recipientStatus: 'CREATED' })),
  })
  renderOutcome(data)
  await advance(100)
  await advance(15_000)
  expect(screen.getByText('자원 등록됨')).toBeInTheDocument()
  await advance(60_000)
  expect(fetchUserSupport).toHaveBeenCalledTimes(2)
})
