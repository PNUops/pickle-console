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

describe('LLM API 키 상세 탭', () => {
  test('소유자의 활성 키는 VM과 같은 자리에 다섯 탭을 순서대로 둔다', async () => {
    renderKey(ISSUED_KEY)

    expect(await tabNames()).toEqual(['개요', '사용량', '접근', '설정', '기록된 본문'])
  })

  test('접근 탭은 목록을 관리할 수 있는 사람에게만 있다', async () => {
    // 상태와는 무관하다 — 폐기된 키의 부여도 남은 기록을 누가 읽는지 정한다.
    renderKey(REVOKED_KEY)

    expect(await tabNames()).toEqual(['개요', '사용량', '접근', '기록된 본문'])
  })

  test('할 수 있는 것이 없는 등급에는 접근도 설정도 없다', async () => {
    renderKey(MEMBER_KEY)

    expect(await tabNames()).toEqual(['개요', '사용량', '기록된 본문'])
  })

  test('폐기된 키에는 설정 탭이 없다', async () => {
    renderKey(REVOKED_KEY, 'settings')

    expect(await tabNames()).not.toContain('설정')
    expect(screen.getByRole('tab', { name: '개요', selected: true })).toBeInTheDocument()
  })

  test('워크스페이스 소유자의 상시권만으로도 설정 탭은 열린다', async () => {
    // 폐기가 그 탭에 있으므로, 목록에서 열람자로만 셈해지는 워크스페이스 소유자도
    // 탭을 본다. 설정 폼은 잠긴 채 이유를 말한다.
    server.use(llmKeyDetailAs(ISSUED_KEY, 'VIEWER', { accessManageAllowed: true }))
    renderKey(ISSUED_KEY, 'settings')

    expect(await screen.findByRole('tab', { name: '설정', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '키 폐기' })).toBeEnabled()
  })

  test('접근 탭 주소로 열면 부여 목록이 보인다', async () => {
    renderKey(ISSUED_KEY, 'access')

    expect(await screen.findByRole('tab', { name: '접근', selected: true })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /^접근 권한 \(/ })).toBeInTheDocument()
    // 소유자 이름은 계정 메뉴에도 있으므로 참여자 쪽을 찾는다.
    expect(screen.getByText('김철수')).toBeInTheDocument()
  })
})
