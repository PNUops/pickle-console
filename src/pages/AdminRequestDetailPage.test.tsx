import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  adminVmRequestStore,
  approveBodies,
  rejectBodies,
} from '../test/msw/handlers/admin'
import { orgAdminUser, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderDetail(requestId: number) {
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
  renderApp(`/admin/requests/${requestId}`)
}

describe('관리자 신청 상세 — 의사결정 지원 패널', () => {
  test('신청 내용과 참고 패널 5종, 안내문을 함께 보여준다', async () => {
    renderDetail(201)

    await screen.findByRole('heading', { name: '신청 #201' })
    expect(screen.getByText('캡스톤 프로젝트 백엔드 서버 운영')).toBeInTheDocument()
    expect(screen.getByText('capstone-team3.pusan.dev')).toBeInTheDocument()
    // OS·사양 프리셋은 각각의 축으로 표시된다.
    const os = screen.getByText('OS').closest('div')!
    expect(await within(os).findByText('Ubuntu 24.04 LTS')).toBeInTheDocument()
    const flavor = screen.getByText('사양 프리셋').closest('div')!
    expect(await within(flavor).findByText('기본형')).toBeInTheDocument()

    const panel = await screen.findByRole('complementary', {
      name: '승인 판단 참고 정보',
    })
    // guidance 안내문
    expect(
      within(panel).getByText('자원에 여유가 있어 승인이 가능합니다.'),
    ).toBeInTheDocument()
    // 1) 신청자
    expect(within(panel).getByText('example@pusan.ac.kr')).toBeInTheDocument()
    expect(within(panel).getByText('승인 2회 · 반려 0회')).toBeInTheDocument()
    // 2) 신청자 보유 자원
    expect(within(panel).getByText('example-dev')).toBeInTheDocument()
    expect(within(panel).getByText('합계 1 vCPU · 1 GiB · 10 GiB')).toBeInTheDocument()
    // 3) 신청 그룹
    expect(within(panel).getByText('캡스톤 3조')).toBeInTheDocument()
    expect(within(panel).getByText('김철수')).toBeInTheDocument()
    // 4) 신청 이력
    expect(within(panel).getByText('신청 #88')).toBeInTheDocument()
    expect(within(panel).getByText('소규모 개발용으로 승인')).toBeInTheDocument()
    // 5) 기관 자원 여유
    expect(within(panel).getByText('34 vCPU / 40 스레드')).toBeInTheDocument()
    expect(within(panel).getByText(/메모리 사용률 64%/)).toBeInTheDocument()
  })

  test('기관 자원 경고가 있으면 경고 배지와 신중 안내문을 보여준다', async () => {
    renderDetail(204)

    const panel = await screen.findByRole('complementary', {
      name: '승인 판단 참고 정보',
    })
    expect(
      within(panel).getByText('메모리 여유가 부족해 신중한 승인이 필요합니다.'),
    ).toBeInTheDocument()
    expect(
      within(panel).getByText('vCPU 오버커밋 비율이 임계값(1.5)을 초과했습니다'),
    ).toBeInTheDocument()
    expect(
      within(panel).getByText('메모리 사용률이 임계값(85%)을 초과했습니다'),
    ).toBeInTheDocument()
  })

  test('참고 정보를 불러오지 못해도 결정 폼은 계속 쓸 수 있다', async () => {
    server.use(
      http.get('*/api/v1/admin/vm-requests/:requestId/context', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '서버 오류',
            status: 500,
            detail: '잠시 후 다시 시도해 주세요.',
            code: 'INTERNAL_ERROR',
          },
          { status: 500 },
        ),
      ),
    )
    renderDetail(201)

    expect(
      await screen.findByText('승인 참고 정보를 불러오지 못했습니다'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '승인하기' })).toBeInTheDocument()
  })
})

describe('승인 폼', () => {
  test('요청 사양으로 프리필되고, 확인 모달을 거쳐 계약 형식의 본문을 전송한다', async () => {
    const user = userEvent.setup()
    renderDetail(201)

    await screen.findByRole('heading', { name: '신청 #201' })
    // 프리필 검증
    expect(screen.getByLabelText('vCPU')).toHaveValue(2)
    expect(screen.getByLabelText('메모리 (MiB)')).toHaveValue(2048)
    expect(screen.getByLabelText('디스크 (GiB)')).toHaveValue(20)
    expect(screen.getByLabelText('템플릿')).toHaveValue('1')
    expect(screen.getByLabelText('사용 시작일')).toHaveValue('2026-07-15')
    expect(screen.getByLabelText('사용 종료일')).toHaveValue('2026-12-20')
    expect(screen.getByLabelText('배치 노드 ID')).toHaveValue(null)
    // 프리필 락: 희망 호스트명이 그대로 채워져 있어야 승인 시 자동 생성으로
    // 조용히 무시되지 않는다.
    expect(screen.getByLabelText('호스트명(슬러그) 확정')).toHaveValue('capstone-api')
    // 공개 여부·서브도메인은 승인 대상이 아니다 (사용자가 공개할 때 정한다).
    expect(screen.queryByLabelText('HTTP 게시')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('서브도메인 확정')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '승인하기' }))
    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    expect(within(dialog).getByText('자동 배치')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '승인 확정' }))

    expect(
      await screen.findByText('신청을 승인했습니다. VM 생성이 시작되었습니다.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('검토 결과')).toBeInTheDocument()

    expect(approveBodies).toHaveLength(1)
    expect(approveBodies[0].requestId).toBe(201)
    expect(approveBodies[0].body).toEqual({
      grantedVcpu: 2,
      grantedMemoryMb: 2048,
      grantedDiskGb: 20,
      grantedImageId: 1,
      grantedStartDate: '2026-07-15',
      grantedEndDate: '2026-12-20',
      grantedSlug: 'capstone-api',
      nodeId: null,
      comment: null,
    })
  })

  test('이미 처리된 신청이면 409 안내를 보여주고 최신 상태로 새로 고친다', async () => {
    const user = userEvent.setup()
    renderDetail(201)

    await screen.findByRole('heading', { name: '신청 #201' })
    // 상세를 보는 사이 다른 관리자가 먼저 처리한 상황을 재현한다.
    const target = adminVmRequestStore.find((r) => r.id === 201)!
    target.status = 'APPROVED'

    await user.click(screen.getByRole('button', { name: '승인하기' }))
    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    await user.click(within(dialog).getByRole('button', { name: '승인 확정' }))

    expect(await screen.findByText(/이미 처리된 신청입니다/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('검토 결정')).not.toBeInTheDocument())
    expect(approveBodies).toHaveLength(0)
  })
})

describe('결정 폼 — 템플릿 조회 실패', () => {
  test('템플릿 조회가 실패하면 결정 폼이 조용히 사라지지 않고 오류·재시도를 보여준다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/os-images', () => HttpResponse.json(null, { status: 500 }), {
        once: true,
      }),
    )
    renderDetail(201)

    await screen.findByRole('heading', { name: '신청 #201' })
    expect(
      await screen.findByText('템플릿 목록을 불러오지 못했습니다'),
    ).toBeInTheDocument()

    // 재시도하면 기본 핸들러(정상 응답)로 복구되어 결정 폼이 나타난다.
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('button', { name: '승인하기' })).toBeInTheDocument()
  })
})

describe('반려 폼', () => {
  test('반려 사유 없이 제출하면 검증 오류를 보여주고 전송하지 않는다', async () => {
    const user = userEvent.setup()
    renderDetail(201)

    await screen.findByRole('heading', { name: '신청 #201' })
    await user.click(screen.getByRole('button', { name: '반려' }))
    await user.click(screen.getByRole('button', { name: '반려하기' }))

    expect(
      screen.getByText('반려 사유를 입력해 주세요. 사유는 신청자에게 전달됩니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rejectBodies).toHaveLength(0)
  })

  test('사유를 입력하면 확인 모달을 거쳐 반려되고 사유가 전송된다', async () => {
    const user = userEvent.setup()
    renderDetail(201)

    await screen.findByRole('heading', { name: '신청 #201' })
    await user.click(screen.getByRole('button', { name: '반려' }))
    await user.type(
      screen.getByLabelText('반려 사유'),
      '기관 여유 자원을 초과합니다. 2GiB로 재신청해 주세요.',
    )
    await user.click(screen.getByRole('button', { name: '반려하기' }))
    const dialog = await screen.findByRole('dialog', { name: '신청 반려' })
    await user.click(within(dialog).getByRole('button', { name: '반려 확정' }))

    expect(
      await screen.findByText('신청을 반려했습니다. 반려 사유가 신청자에게 전달됩니다.'),
    ).toBeInTheDocument()
    expect(rejectBodies).toEqual([
      {
        requestId: 201,
        body: { comment: '기관 여유 자원을 초과합니다. 2GiB로 재신청해 주세요.' },
      },
    ])
    expect(await screen.findAllByText('반려됨')).not.toHaveLength(0)
  })
})
