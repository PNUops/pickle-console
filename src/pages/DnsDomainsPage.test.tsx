import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { dnsDomainStore } from '../test/msw/handlers/dns-domains'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

function renderDomains(path = '/console/domains') {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(path)
}

describe('domain list', () => {
  beforeEach(() => dnsDomainStore.reset())

  test('lists the name with its record count and owning workspace', async () => {
    renderDomains()

    const row = (await screen.findByRole('link', { name: 'myblog.pusan.dev' })).closest('tr')!
    expect(within(row).getByText('2개')).toBeInTheDocument()
    expect(within(row).getByText('캡스톤 3조')).toBeInTheDocument()
  })

  test('an unscoped list carries only the names a grant opens', async () => {
    renderDomains()

    await screen.findByRole('link', { name: 'myblog.pusan.dev' })
    expect(screen.queryByText('someone-else.pusan.dev')).not.toBeInTheDocument()
  })

  test('a row no grant opens says whom to ask instead of linking', async () => {
    // Read on the workspace's own listing: an unscoped list carries only the
    // names a grant opens, so a closed row has no place to stand there.
    renderDomains(`/console/${uuid(12)}/domains`)

    await screen.findByRole('link', { name: 'myblog.pusan.dev' })
    expect(
      screen.queryByRole('link', { name: 'someone-else.pusan.dev' }),
    ).not.toBeInTheDocument()
    // Hiding the row would leave no way to learn whom to ask: it stands, closed.
    expect(screen.getByText(/김철수 님에게 요청하세요/)).toBeInTheDocument()
    // A workspace owner who cannot open it may still decide who can, and the
    // list is their only way in — so the link has to point at this row.
    expect(screen.getByRole('link', { name: '접근 권한 관리' })).toHaveAttribute(
      'href',
      `/console/domains/${uuid(9102)}/access`,
    )
  })

  test('the way to a name is the request wizard, not a form of its own', async () => {
    renderDomains()

    // The screen carried its own issue modal for four days. A person looking
    // for how to get a name goes to where requests are made, found no domain
    // there, and concluded the platform did not offer one.
    const links = await screen.findAllByRole('link', { name: '도메인 신청' })
    expect(links[0]).toHaveAttribute('href', '/console/requests/new?kind=DOMAIN')
    expect(screen.queryByRole('button', { name: '도메인 발급' })).not.toBeInTheDocument()
  })

  test('a released row does not claim to be connected', async () => {
    dnsDomainStore.rows[0].domain.releasedAt = '2026-09-12T13:00:00+09:00'
    dnsDomainStore.rows[0].domain.reservedUntil = '2026-10-12T13:00:00+09:00'
    renderDomains()

    // Release leaves `status` ACTIVE on the server, so the plain badge read
    // 연결됨 directly above 해제됨. The detail header had been fixed and this
    // screen had not, because only the detail was under test.
    const row = (await screen.findByText('myblog.pusan.dev')).closest('tr')!
    expect(within(row).getByText('예약 중')).toBeInTheDocument()
    expect(within(row).queryByText('연결됨')).not.toBeInTheDocument()
  })

  test('a name this workspace is holding in reserve comes back to it', async () => {
    const user = userEvent.setup()
    dnsDomainStore.rows[0].domain.releasedAt = '2026-09-12T13:00:00+09:00'
    dnsDomainStore.rows[0].domain.reservedUntil = '2026-10-12T13:00:00+09:00'
    renderDomains()

    // Three places on these screens promise this recovery. Reviving is the one
    // action the list carries, and it is not a request: the workspace holds the
    // name and its slot against the cap already, and the 30-day reservation can
    // run out inside an approval queue.
    const row = (await screen.findByText('myblog.pusan.dev')).closest('tr')!
    expect(within(row).getByText(/되살릴 수 있습니다/)).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: '되살리기' }))

    await waitFor(() => expect(dnsDomainStore.rows[0].domain.releasedAt).toBeNull())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '되살리기' })).not.toBeInTheDocument(),
    )
  })
})
