import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { llmKeyDetailAs } from '../test/msw/handlers/llm-keys'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

const ISSUED_KEY = uuid(70)
const REVOKED_KEY = uuid(73)
const MEMBER_KEY = uuid(74)

function renderKey(keyId: string, tab?: string) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/llm-keys/${keyId}${tab ? `?tab=${tab}` : ''}`)
}

async function tabNames(): Promise<string[]> {
  const list = await screen.findByRole('tablist', { name: 'LLM API 키 상세 영역' })
  return within(list)
    .getAllByRole('tab')
    .map((tab) => tab.textContent ?? '')
}

describe('LLM API key detail tabs', () => {
  test('gives an owner of an active key the five tabs in order', async () => {
    renderKey(ISSUED_KEY)

    expect(await tabNames()).toEqual(['개요', '사용량', '접근', '설정', '기록된 본문'])
  })

  test('shows the access tab to whoever manages the grants, whatever the status', async () => {
    // A revoked key's grants still decide who reads the bodies it left.
    renderKey(REVOKED_KEY)

    expect(await tabNames()).toEqual(['개요', '사용량', '접근', '기록된 본문'])
  })

  test('hides access and settings from a role that can act on neither', async () => {
    renderKey(MEMBER_KEY)

    expect(await tabNames()).toEqual(['개요', '사용량', '기록된 본문'])
  })

  test('has no settings tab for a revoked key', async () => {
    renderKey(REVOKED_KEY, 'settings')

    expect(await tabNames()).not.toContain('설정')
    expect(screen.getByRole('tab', { name: '개요', selected: true })).toBeInTheDocument()
  })

  test('opens the settings tab on the workspace owner standing right alone', async () => {
    // Revoke lives on that tab, so a workspace owner counted as a viewer on
    // the list still gets it; the settings form stays locked and says why.
    server.use(llmKeyDetailAs(ISSUED_KEY, 'VIEWER', { accessManageAllowed: true }))
    renderKey(ISSUED_KEY, 'settings')

    expect(await screen.findByRole('tab', { name: '설정', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '키 폐기' })).toBeEnabled()
  })

  test('renders the grant list from the access tab address', async () => {
    renderKey(ISSUED_KEY, 'access')

    expect(await screen.findByRole('tab', { name: '접근', selected: true })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /^접근 권한 \(/ })).toBeInTheDocument()
    // The owner's name is also in the account menu, so look for the member.
    expect(screen.getByText('김철수')).toBeInTheDocument()
  })
})
