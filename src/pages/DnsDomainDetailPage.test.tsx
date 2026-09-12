import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { dnsDomainStore } from '../test/msw/handlers/dns-domains'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

const DOMAIN_ID = uuid(9101)

function renderDetail(tab?: string) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/domains/${DOMAIN_ID}${tab ? `?tab=${tab}` : ''}`)
}

describe('domain detail', () => {
  beforeEach(() => dnsDomainStore.reset())

  test('says the name is lost without a renewal, and that the notices may not arrive', async () => {
    renderDetail()

    // Deactivating a school account sends all three notices into the void. A
    // reader who is not told that has no way to find out.
    expect(await screen.findByText(/연장하지 않으면 레코드가 삭제되고/)).toBeInTheDocument()
    expect(screen.getByText(/그 알림도 닿지 않습니다/)).toBeInTheDocument()
  })

  test('saving records sends the whole table, so a deleted row leaves the zone', async () => {
    const user = userEvent.setup()
    renderDetail('records')

    await screen.findByDisplayValue('93.184.216.34')
    expect(screen.getByText(/표에서 지운 줄은 존에서도 지워집니다/)).toBeInTheDocument()

    // Add a row to make three, then delete one so two remain. With only one
    // left, "sends everything" and "sends the first row" build the same body.
    await user.click(screen.getByRole('button', { name: '줄 추가' }))
    await user.type(screen.getByRole('textbox', { name: '3번째 줄 값' }), '93.184.216.35')
    await user.click(screen.getByRole('button', { name: '2번째 줄 지우기' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const body = dnsDomainStore.lastReplaceBody as {
        records: { values: string[] }[]
      }
      // Everything that is left goes. A per-row call would let two people
      // editing at once erase each other without a word.
      expect(body.records).toHaveLength(2)
      expect(body.records.map((set) => set.values[0])).toEqual([
        '93.184.216.34',
        '93.184.216.35',
      ])
    })
  })

  test('a set with several values survives a round trip through the editor', async () => {
    const user = userEvent.setup()
    dnsDomainStore.rows[0].records[0].values = ['93.184.216.34', '93.184.216.35']
    renderDetail('records')

    // A single-line input strips the newlines on the way in, so the two values
    // rendered run together and saving wrote that back as one merged value.
    const values = await screen.findByRole('textbox', { name: '1번째 줄 값' })
    expect(values).toHaveValue('93.184.216.34\n93.184.216.35')

    await user.type(await screen.findByRole('textbox', { name: '1번째 줄 이름' }), 'www')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const body = dnsDomainStore.lastReplaceBody as { records: { values: string[] }[] }
      expect(body.records[0].values).toEqual(['93.184.216.34', '93.184.216.35'])
    })
  })

  test('a TTL that is not a number is refused rather than quietly replaced', async () => {
    const user = userEvent.setup()
    renderDetail('records')

    const ttl = await screen.findByRole('textbox', { name: '1번째 줄 TTL' })
    await user.clear(ttl)
    await user.type(ttl, '삼백')

    // It used to fall back to 300 on the way out, so a value the reader never
    // typed was saved with nothing said about it.
    expect(screen.getByText('TTL은 숫자로 적어 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(dnsDomainStore.lastReplaceBody).toBeNull()
  })

  test('a set the provider refused says so, and carries the reason', async () => {
    dnsDomainStore.rows[0].records[1].status = 'FAILED'
    dnsDomainStore.rows[0].records[1].lastError = 'CNAME is not allowed at the apex'
    renderDetail('records')

    // Without this the failed set looks exactly like an applied one, and the
    // owner is left with an address that does not resolve and no reason.
    expect(await screen.findByText(/반영하지 못했습니다/)).toBeInTheDocument()
    expect(screen.getByText(/CNAME is not allowed at the apex/)).toBeInTheDocument()
  })

  test('an unsaved draft survives a look at the overview', async () => {
    const user = userEvent.setup()
    renderDetail('records')

    await screen.findByDisplayValue('93.184.216.34')
    await user.click(screen.getByRole('button', { name: '줄 추가' }))
    await user.type(screen.getByRole('textbox', { name: '3번째 줄 값' }), '93.184.216.99')

    // The tab panel unmounts what it hides. With the draft owned by the editor
    // it died the moment the reader checked the renewal date, silently.
    await user.click(screen.getByRole('tab', { name: '개요' }))
    await user.click(screen.getByRole('tab', { name: '레코드' }))
    expect(screen.getByRole('textbox', { name: '3번째 줄 값' })).toHaveValue('93.184.216.99')
  })

  test('a released name takes no edits and does not claim to be connected', async () => {
    dnsDomainStore.rows[0].domain.releasedAt = '2026-09-12T13:00:00+09:00'
    dnsDomainStore.rows[0].domain.reservedUntil = '2026-10-12T13:00:00+09:00'
    renderDetail('records')

    expect(
      await screen.findByText(/해제한 이름에는 레코드를 넣을 수 없습니다/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    // The row keeps status ACTIVE on the server, so the plain badge would read
    // 연결됨 beside the release notice.
    expect(screen.getByText('예약 중')).toBeInTheDocument()
    expect(screen.queryByText('연결됨')).not.toBeInTheDocument()
  })

  test('releasing takes the name typed back, and then releases', async () => {
    const user = userEvent.setup()
    renderDetail()

    await user.click(await screen.findByRole('button', { name: '도메인 해제' }))
    const dialog = screen.getByRole('dialog')
    // The same confirmation every destructive act uses: the name has to be
    // typed out.
    expect(within(dialog).getByRole('button', { name: '해제' })).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'myblog.pusan.dev')
    await user.click(within(dialog).getByRole('button', { name: '해제' }))

    // Assert the effect and not only the gate: a no-op confirm would pass the
    // gate assertion on its own.
    await waitFor(() => {
      expect(dnsDomainStore.rows[0].domain.releasedAt).not.toBeNull()
      expect(dnsDomainStore.rows[0].records).toHaveLength(0)
    })
    expect(await screen.findByText(/해제한 이름입니다/)).toBeInTheDocument()
  })

  test('a reader below editor is not shown the actions the server would refuse', async () => {
    dnsDomainStore.rows[0].domain.myResourceRole = 'VIEWER'
    dnsDomainStore.rows[0].domain.accessManageAllowed = false
    renderDetail()

    await screen.findByText(/연장하지 않으면 레코드가 삭제되고/)
    expect(screen.queryByRole('button', { name: '사용 연장' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '도메인 해제' })).not.toBeInTheDocument()
    // The access tab follows the grant-management right, as the key detail does.
    expect(screen.queryByRole('tab', { name: '접근' })).not.toBeInTheDocument()
  })

  test('a reader below editor reads the records without an editor', async () => {
    dnsDomainStore.rows[0].domain.myResourceRole = 'VIEWER'
    renderDetail('records')

    expect(await screen.findByText(/93\.184\.216\.34/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '줄 추가' })).not.toBeInTheDocument()
  })
})
