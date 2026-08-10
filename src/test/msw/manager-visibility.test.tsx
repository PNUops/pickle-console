import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { orgManagerUser, refreshSuccessHandler, sysManagerUser } from './handlers/auth'
import { server } from './server'
import { renderApp } from '../render'

type FixtureUser = typeof orgManagerUser

/**
 * 운영자 계층(ORG_MANAGER·SYS_MANAGER)의 관리 콘솔 접근 — 라우팅 가드와
 * 내비게이션 노출이 운영자 권한 정책과 일치하는지 확인한다.
 */
function renderAs(token: string, user: FixtureUser, path: string) {
  server.use(refreshSuccessHandler(token, user))
  renderApp(path)
}

describe('운영자 계층 화면 접근', () => {
  test('ORG_MANAGER는 관리 화면을 보되 시스템 섹션·기관 관리는 숨긴다', async () => {
    renderAs('access-org-manager', orgManagerUser, '/admin')
    expect(await screen.findByRole('heading', { name: '관리자 대시보드' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '승인 대기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'VM 관리' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '사용자 관리' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '워크스페이스 관리' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '기관 관리' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '노드/IP' })).not.toBeInTheDocument()
  })

  test('ORG_MANAGER가 시스템 전용 경로(/admin/settings)에 가면 대시보드로 돌아간다', async () => {
    renderAs('access-org-manager', orgManagerUser, '/admin/settings')
    expect(await screen.findByRole('heading', { name: '관리자 대시보드' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '플랫폼 설정' })).not.toBeInTheDocument()
  })

  test('SYS_MANAGER는 시스템 조회 섹션을 보되 기관 관리는 숨긴다', async () => {
    renderAs('access-sys-manager', sysManagerUser, '/admin')
    expect(await screen.findByRole('heading', { name: '관리자 대시보드' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '노드/IP' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '작업' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '플랫폼 설정' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '기관 관리' })).not.toBeInTheDocument()
  })

  test('SYS_MANAGER는 시스템 조회 페이지(플랫폼 설정)에 접근할 수 있다', async () => {
    renderAs('access-sys-manager', sysManagerUser, '/admin/settings')
    expect(await screen.findByRole('heading', { name: '플랫폼 설정' })).toBeInTheDocument()
  })

  test('SYS_MANAGER가 기관 관리(/admin/orgs)에 가면 대시보드로 돌아간다', async () => {
    renderAs('access-sys-manager', sysManagerUser, '/admin/orgs')
    expect(await screen.findByRole('heading', { name: '관리자 대시보드' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '기관 관리' })).not.toBeInTheDocument()
  })
})
