import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('관리자 대시보드', () => {
  test('ORG_ADMIN은 기관 요약 타일과 자원 현황을 보고 시스템 요약은 없다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin')

    await screen.findByRole('heading', { name: '관리자 대시보드' })
    // 기관 요약 타일 + 링크 (사이드바 항목과 겹치지 않게 요약 영역으로 한정)
    const tiles = await screen.findByRole('region', { name: '기관 요약' })
    expect(within(tiles).getByRole('link', { name: '승인 대기' })).toHaveAttribute(
      'href',
      '/admin/requests',
    )
    expect(within(tiles).getByRole('link', { name: 'VM 현황' })).toHaveAttribute(
      'href',
      '/admin/vms',
    )
    expect(within(tiles).getByRole('link', { name: '만료 예정 (30일)' })).toHaveAttribute(
      'href',
      '/admin/expiry',
    )
    expect(within(tiles).getByRole('link', { name: '확인 필요' })).toBeInTheDocument()
    // 자원 현황 바 + 안내 문구
    expect(screen.getByRole('progressbar', { name: 'vCPU 할당률' })).toBeInTheDocument()
    expect(screen.getByText(/자원에 여유가 있어 승인이 가능합니다/)).toBeInTheDocument()
    // 시스템 요약 타일은 SYS_ADMIN 전용
    expect(screen.queryByRole('link', { name: '드리프트 미해결' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '알림 발송 실패' })).not.toBeInTheDocument()
    // 사이드바에 시스템 섹션이 없다
    expect(screen.queryByRole('heading', { name: '시스템' })).not.toBeInTheDocument()
  })

  test('SYS_ADMIN은 시스템 요약 타일 줄과 시스템 나눔 메뉴를 함께 본다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin')

    await screen.findByRole('heading', { name: '관리자 대시보드' })
    const systemRow = await screen.findByRole('region', { name: '시스템 요약' })
    expect(within(systemRow).getByRole('link', { name: '노드' })).toHaveAttribute(
      'href',
      '/admin/nodes',
    )
    expect(within(systemRow).getByRole('link', { name: 'IP 여유' })).toHaveAttribute(
      'href',
      '/admin/nodes?tab=ips',
    )
    expect(within(systemRow).getByRole('link', { name: '드리프트 미해결' })).toHaveAttribute(
      'href',
      '/admin/drift',
    )
    expect(within(systemRow).getByRole('link', { name: '알림 발송 실패' })).toHaveAttribute(
      'href',
      '/admin/notification-log',
    )
    expect(within(systemRow).getByRole('link', { name: '작업' })).toHaveAttribute(
      'href',
      '/admin/tasks',
    )
    // 비밀번호 SSH 허용 타일 (SSH 개인 식별 가시성) — 허용 VM 수(2)와 위험 톤.
    const sshTile = within(systemRow).getByRole('link', { name: '비밀번호 SSH 허용' })
    expect(sshTile).toHaveAttribute('href', '/admin/vms')
    expect(within(sshTile).getByText('2대')).toBeInTheDocument()
    expect(within(sshTile).getByText('VM별 설정으로 허용된 VM')).toBeInTheDocument()
    // 사이드바 섹션 소제목
    expect(screen.getByRole('heading', { name: '운영' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '소통' })).toBeInTheDocument()
    // 승인 대기 미리보기 카드는 유지된다
    expect(await screen.findByText(/검토를 기다리는 신청이/)).toBeInTheDocument()
  })
})
