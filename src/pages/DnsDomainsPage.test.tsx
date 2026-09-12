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

  test('a row no grant opens says whom to ask instead of linking', async () => {
    renderDomains()

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

  test('issuing is not requesting: the name exists without waiting for approval', async () => {
    const user = userEvent.setup()
    renderDomains()

    await user.click(await screen.findByRole('button', { name: '도메인 발급' }))
    await user.type(screen.getByRole('textbox', { name: /이름/ }), 'newsite')
    await user.selectOptions(screen.getByRole('combobox', { name: /워크스페이스/ }), [
      screen.getByRole('option', { name: '캡스톤 3조' }),
    ])
    await user.click(screen.getByRole('button', { name: '발급' }))

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'newsite.pusan.dev' })).toBeInTheDocument(),
    )
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

    // Three places on these screens promise this recovery. Nothing tested it,
    // and the mock used to refuse a released name the way it refuses a taken one.
    expect(await screen.findByText(/같은 이름으로 다시 만들 수 있습니다/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '도메인 발급' }))
    await user.type(screen.getByRole('textbox', { name: /이름/ }), 'myblog')
    await user.selectOptions(screen.getByRole('combobox', { name: /워크스페이스/ }), [
      screen.getByRole('option', { name: '캡스톤 3조' }),
    ])
    await user.click(screen.getByRole('button', { name: '발급' }))

    await waitFor(() => expect(dnsDomainStore.rows[0].domain.releasedAt).toBeNull())
  })
})
