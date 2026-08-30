import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { orgAdminUser, sysAdminUser } from '../test/msw/handlers/auth'
import {
  adminRequestStore,
  submittedAdminRequest,
} from '../test/msw/handlers/admin'
import { renderApp } from '../test/render'
import { server } from '../test/msw/server'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { uuid } from '../test/msw/ids'

function renderAsOrgAdmin(path: string) {
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
  renderApp(path)
}

function renderAsSysAdmin(path: string) {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(path)
}

describe('관리자 대시보드 요약', () => {
  test('승인 대기 건수와 최근 신청 링크를 보여준다', async () => {
    renderAsOrgAdmin('/admin')

    await screen.findByRole('heading', { name: '관리자 대시보드' })
    // 요약 타일에도 '2건'이 있어 미리보기 문구로 특정한다.
    expect(await screen.findByText(/검토를 기다리는 신청이/)).toBeInTheDocument()
    expect((await screen.findAllByText('2건')).length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByRole('link', { name: /캡스톤 프로젝트 백엔드 서버 운영/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '전체 보기 →' })).toHaveAttribute(
      'href',
      `/admin/requests?org=${uuid(1)}`,
    )
  })
})

describe('승인 대기 큐', () => {
  test('기본 탭은 승인 대기이고 SUBMITTED 신청만 보여준다', async () => {
    // 전 기관이 보이는 시스템 계층으로 확인한다 — 기관 계층은 보유 기관 것만 본다.
    renderAsSysAdmin('/admin/requests')

    await screen.findByRole('heading', { name: '승인 대기' })
    expect(await screen.findByText('관리자 신청 목록')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '승인 대기' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await screen.findByRole('link', { name: '홍길동' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '박영희' })).toBeInTheDocument()
    // 승인/반려된 건은 기본 탭에 없다.
    expect(screen.queryByRole('link', { name: '김철수' })).not.toBeInTheDocument()
    // OS 이미지/사양 요약이 표시된다.
    expect(screen.getByText('4 vCPU · 4 GiB · 40 GiB')).toBeInTheDocument()
  })

  test('상태 탭을 바꾸면 해당 상태만 나열한다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin('/admin/requests')

    await screen.findByRole('link', { name: '홍길동' })
    await user.click(screen.getByRole('button', { name: '승인됨' }))

    expect(await screen.findByRole('link', { name: '김철수' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: '박영희' })).not.toBeInTheDocument(),
    )
  })

  test('전체 탭은 모든 상태의 신청을 보여준다 (status 미지정)', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin('/admin/requests')

    await screen.findByRole('link', { name: '홍길동' })
    await user.click(screen.getByRole('button', { name: '전체' }))

    // 승인 대기(201·204) + 승인됨(202) + 반려됨(203)이 모두 나온다.
    expect(await screen.findByRole('link', { name: '김철수' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '박영희' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '홍길동' }).length).toBeGreaterThan(1)
  })

  test('ORG_ADMIN에게는 기관 필터가 보이지 않고 타 기관 신청도 없다', async () => {
    renderAsOrgAdmin('/admin/requests')

    await screen.findByRole('link', { name: '홍길동' })
    // 계약 v0.46.0: 조회는 역할을 보유한 기관 안이다. 보유 기관이 하나뿐이면
    // 고를 것이 없으므로 기관 필터를 보이지 않는다.
    expect(screen.queryByLabelText('기관 필터')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '박영희' })).not.toBeInTheDocument()
  })

  test('SYS_ADMIN은 전역 관리 범위로 특정 기관의 신청만 볼 수 있다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin('/admin/requests')

    await screen.findByRole('link', { name: '홍길동' })
    await user.selectOptions(await screen.findByLabelText('관리 기관 선택'), uuid(2))

    expect(await screen.findByRole('link', { name: '박영희' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: '홍길동' })).not.toBeInTheDocument(),
    )
  })

  test('리소스 종류 필터로 LLM API 키 신청만 좁힌다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin('/admin/requests')

    await user.click(await screen.findByRole('button', { name: '승인됨' }))
    await user.selectOptions(screen.getByLabelText('리소스 종류 필터'), 'LLM_API_KEY')
    expect(await screen.findByText('캡스톤 챗봇 LLM API 호출')).toBeInTheDocument()
    expect(screen.queryByText('알고리즘 스터디 채점 서버')).not.toBeInTheDocument()
  })

  test('10건이 넘으면 페이지네이션으로 나눠 보여준다', async () => {
    // 시딩분은 전부 org1이라 보유 기관 스코프 안에서도 그대로 보인다.
    for (let id = 300; id < 310; id++) {
      adminRequestStore.push(submittedAdminRequest(id))
    }
    const user = userEvent.setup()
    renderAsOrgAdmin('/admin/requests')

    expect(await screen.findByRole('button', { name: '1 페이지' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    // 1페이지: 최신 순 → 시딩분. 201은 2페이지로 밀린다.
    expect(screen.getByText('추가 실습 서버 309')).toBeInTheDocument()
    expect(screen.queryByText('캡스톤 프로젝트 백엔드 서버 운영')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('캡스톤 프로젝트 백엔드 서버 운영')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2 페이지' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
