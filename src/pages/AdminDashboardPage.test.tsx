import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { systemSummaryFixture } from '../test/msw/handlers/admin-ops'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('관리자 대시보드', () => {
  test('ORG_ADMIN은 기관 요약 타일과 리소스 현황을 보고 시스템 요약은 없다', async () => {
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
    // 리소스 현황 바 + 안내 문구
    expect(screen.getByRole('progressbar', { name: 'vCPU 할당률' })).toBeInTheDocument()
    expect(screen.getByText(/리소스에 여유가 있어 승인이 가능합니다/)).toBeInTheDocument()
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

describe('관리자 대시보드 — 하이퍼바이저 실측', () => {
  test('SYS_ADMIN은 노드 연결·물리 메모리·스토리지 실측 타일을 본다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin')

    const systemRow = await screen.findByRole('region', { name: '시스템 요약' })
    // pve1은 응답, pve2는 끊김 — 하나라도 끊기면 위험 톤이다.
    const connection = within(systemRow).getByText('Proxmox 연결').parentElement!
    expect(within(connection).getByText('정상 1 / 끊김 1')).toBeInTheDocument()
    expect(within(connection).getByText('정상 1 / 끊김 1')).toHaveClass('text-danger-600')
    // 실측 사용량은 할당률이 아니라 사용률로 읽힌다.
    expect(
      within(systemRow).getByRole('progressbar', { name: '물리 메모리 사용률' }),
    ).toBeInTheDocument()
    expect(
      within(systemRow).getByRole('progressbar', { name: '스토리지 사용률' }),
    ).toBeInTheDocument()
    expect(within(systemRow).getByText('24.0 GiB / 78.0 GiB (31%)')).toBeInTheDocument()
    expect(within(systemRow).getByText('320 GiB / 900 GiB (36%)')).toBeInTheDocument()
  })

  test('모든 노드가 끊기면 수치 대신 연결 끊김을 표시한다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    systemSummaryFixture.nodesLive = systemSummaryFixture.nodesLive.map((node) => ({
      ...node,
      reachable: false,
      memTotalBytes: null,
      memUsedBytes: null,
      storageTotalBytes: null,
      storageUsedBytes: null,
      checkedAt: null,
    }))
    renderApp('/admin')

    const systemRow = await screen.findByRole('region', { name: '시스템 요약' })
    expect(within(systemRow).getByText('정상 0 / 끊김 2')).toBeInTheDocument()
    expect(within(systemRow).getAllByText('연결 끊김')).toHaveLength(2)
    expect(
      within(systemRow).queryByRole('progressbar', { name: '물리 메모리 사용률' }),
    ).not.toBeInTheDocument()
  })
})

describe('관리자 대시보드 — 할당 추이', () => {
  test('기관 관리자는 평문 요약 문장과 자원별 차트를 본다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin')

    expect(
      await screen.findByText(
        '최근 90일 동안 할당 vCPU가 12개에서 20개로 늘었습니다. 메모리는 32 GiB에서 48 GiB로 늘었습니다.',
      ),
    ).toBeInTheDocument()
    const trend = screen.getByRole('heading', { name: '할당 추이 (최근 90일)' })
      .parentElement!.parentElement as HTMLElement
    expect(within(trend).getByRole('heading', { name: 'vCPU 할당' })).toBeInTheDocument()
    expect(within(trend).getByRole('heading', { name: '메모리 할당' })).toBeInTheDocument()
  })

  test('기관 리소스 카드는 디스크 할당도 용량과 함께 보여준다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin')

    expect(
      await screen.findByRole('progressbar', { name: '디스크 할당률' }),
    ).toBeInTheDocument()
    expect(screen.getByText('460 GiB / 900 GiB (51%)')).toBeInTheDocument()
  })
})

describe('관리자 대시보드 — 실측값이 비어 있을 때', () => {
  test('노드는 응답했지만 수치를 못 읽으면 연결 끊김이 아니라 측정값 없음이다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    systemSummaryFixture.nodesLive = [
      {
        nodeId: 1,
        name: 'pve1',
        reachable: true,
        cpu: 0.2,
        memTotalBytes: null,
        memUsedBytes: null,
        storageTotalBytes: null,
        storageUsedBytes: null,
        checkedAt: '2026-08-10T12:00:00+09:00',
      },
    ]
    renderApp('/admin')

    const systemRow = await screen.findByRole('region', { name: '시스템 요약' })
    expect(within(systemRow).getByText('정상 1 / 끊김 0')).toBeInTheDocument()
    expect(within(systemRow).getAllByText('측정값 없음')).toHaveLength(2)
    expect(within(systemRow).queryByText('연결 끊김')).not.toBeInTheDocument()
  })
})
