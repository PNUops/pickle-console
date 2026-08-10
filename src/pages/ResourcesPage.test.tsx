import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import type { components } from '../api/schema'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

type Schemas = components['schemas']

function renderResources(path = '/console/resources') {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(path)
}

describe('전체 리소스', () => {
  test('종류를 가리지 않고 내가 볼 수 있는 리소스를 나열한다', async () => {
    renderResources()

    expect(await screen.findByRole('link', { name: 'algo-judge' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'capstone-team3-api' })).toBeInTheDocument()
    expect(screen.getByText('내가 속한 모든 워크스페이스의 리소스입니다.')).toBeInTheDocument()
    // 구성원이 아닌 워크스페이스의 리소스는 애초에 조회 범위 밖이다.
    expect(screen.queryByText('ai-train')).not.toBeInTheDocument()
  })

  test('워크스페이스 범위 주소는 그 워크스페이스의 리소스만 보여준다', async () => {
    renderResources('/console/15/resources')

    const row = (await screen.findByRole('link', { name: 'algo-judge' })).closest('tr')!
    expect(within(row).getByText('알고리즘 스터디')).toBeInTheDocument()
    expect(screen.getByText('이 워크스페이스의 리소스입니다.')).toBeInTheDocument()
    expect(screen.queryByText('capstone-team3-api')).not.toBeInTheDocument()
  })

  test('접근 권한이 없는 리소스는 VM 목록과 같은 제한 행으로 나온다', async () => {
    renderResources('/console/15/resources')

    const limitedRow = (await screen.findByText('ml-notebook')).closest('tr')!
    expect(screen.queryByRole('link', { name: 'ml-notebook' })).not.toBeInTheDocument()
    expect(
      within(limitedRow).getByText(/접근 권한이 없습니다 — 김철수 님에게 요청하세요/),
    ).toBeInTheDocument()
  })

  test('내 워크스페이스가 아닌 범위는 범위 없는 화면으로 되돌린다', async () => {
    // 나간 워크스페이스로 돌아가는 뒤로가기, 남이 보낸 링크, 오래된 북마크.
    renderResources('/console/999/resources')

    // 주소가 범위 없는 같은 화면으로 바뀐다 — 남은 범위가 목록을 계속 거르지 못하게.
    await waitFor(() => expect(currentPath()).toBe('/console/resources'))
    expect(screen.getByText('내가 속한 모든 워크스페이스의 리소스입니다.')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'capstone-team3-api' })).toBeInTheDocument()
  })

  test('이 빌드가 모르는 종류의 리소스도 행으로 남는다', async () => {
    const row = {
      id: 900,
      // 서버가 먼저 내보낸 종류 — 옛 번들이 받아도 화면이 비면 안 된다.
      type: 'LLM_API_KEY' as Schemas['ResourceType'],
      name: 'gpt-lab-key',
      displayName: null,
      status: 'ACTIVE',
      workspaceId: 12,
      workspaceName: '캡스톤 3조',
      accessLimited: false,
      ownerNames: [],
      accessManageAllowed: false,
      createdAt: '2026-07-08T14:03:05+09:00',
    } satisfies Schemas['ResourceSummaryResponse']
    server.use(
      http.get('*/api/v1/resources', () =>
        HttpResponse.json({
          content: [row],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        } satisfies Schemas['PageResponseResourceSummaryResponse']),
      ),
    )
    renderResources()

    const unknownRow = (await screen.findByText('gpt-lab-key')).closest('tr')!
    // 종류와 상태는 서버가 준 문자열 그대로, 상세로 가는 링크는 없다.
    expect(within(unknownRow).getByText('LLM_API_KEY')).toBeInTheDocument()
    expect(within(unknownRow).getByText('ACTIVE')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'gpt-lab-key' })).not.toBeInTheDocument()
  })
})
