import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { requestStore } from '../test/msw/handlers/requests'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

function renderRequests(path = '/console/requests') {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(path)
}

describe('내 신청 목록', () => {
  test('신청을 상태 배지와 함께 나열하고 상태 탭으로 필터링한다', async () => {
    const user = userEvent.setup()
    renderRequests()

    // 전체 탭: 3건 모두 보인다. (탭에도 같은 라벨이 있으므로 표 안에서 확인)
    expect(
      await screen.findByRole('link', { name: '캡스톤 프로젝트 백엔드 서버 운영' }),
    ).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('승인 대기')).toBeInTheDocument()
    expect(within(table).getByText('승인됨')).toBeInTheDocument()
    expect(within(table).getByText('반려됨')).toBeInTheDocument()

    // 반려됨 탭: 반려 건만 남는다.
    await user.click(screen.getByRole('button', { name: '반려됨' }))
    expect(await screen.findByRole('link', { name: '개인 실험용 서버' })).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: '캡스톤 프로젝트 백엔드 서버 운영' }),
      ).not.toBeInTheDocument(),
    )
  })
})

describe('신청 상세', () => {
  test('반려된 신청은 검토 의견을 보여준다', async () => {
    renderRequests(`/console/requests/${uuid(103)}`)

    await screen.findByRole('heading', { name: '신청 상세' })
    expect(screen.getByText('반려')).toBeInTheDocument()
    expect(
      screen.getByText('용도가 불분명합니다. 구체적인 사용 계획을 적어 다시 신청해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '신청 취소' })).not.toBeInTheDocument()
  })

  test('승인된 신청은 부여 사양을 보여준다', async () => {
    renderRequests(`/console/requests/${uuid(102)}`)

    await screen.findByRole('heading', { name: '신청 상세' })
    expect(screen.getByText('검토 결과')).toBeInTheDocument()
    expect(screen.getByText('부여 사양')).toBeInTheDocument()
    expect(screen.getAllByText('2 vCPU · 2 GiB · 20 GiB').length).toBeGreaterThan(0)
  })

  test('OS와 사양 프리셋을 각각 보여준다', async () => {
    renderRequests(`/console/requests/${uuid(101)}`)

    await screen.findByRole('heading', { name: '신청 상세' })
    const os = screen.getByText('OS').closest('div')!
    expect(within(os).getByText('Ubuntu 24.04 LTS')).toBeInTheDocument()
    const flavor = screen.getByText('사양 프리셋').closest('div')!
    expect(await within(flavor).findByText('기본형')).toBeInTheDocument()
  })

  // 은퇴한 프리셋·이미지는 공개 카탈로그에 없다. 예전에는 그 행을 찾지 못해 '알 수 없는
  // 프리셋'이라고만 적었지만, 이제 응답이 이름을 실어 주므로 신청자는 자기가 무엇을
  // 신청했는지 그대로 읽을 수 있다.
  test('카탈로그에서 내려간 프리셋도 응답이 실어 준 이름으로 보여준다', async () => {
    const target = requestStore.find((r) => r.id === uuid(101))!
    target.vm!.flavorId = uuid(9)
    target.vm!.flavorName = '구형 프리셋'
    renderRequests(`/console/requests/${uuid(101)}`)

    await screen.findByRole('heading', { name: '신청 상세' })
    const flavor = screen.getByText('사양 프리셋').closest('div')!
    expect(await within(flavor).findByText('구형 프리셋')).toBeInTheDocument()
    expect(screen.queryByText('알 수 없는 프리셋')).not.toBeInTheDocument()
  })

  test('프리셋 없이 접수된 신청은 사양 프리셋을 —로 보여준다', async () => {
    const target = requestStore.find((r) => r.id === uuid(101))!
    target.vm!.flavorId = null
    target.vm!.flavorName = null
    renderRequests(`/console/requests/${uuid(101)}`)

    await screen.findByRole('heading', { name: '신청 상세' })
    const flavor = screen.getByText('사양 프리셋').closest('div')!
    expect(within(flavor).getByText('—')).toBeInTheDocument()
  })

  test('검토 중 신청은 확인 모달을 거쳐 취소할 수 있다', async () => {
    const user = userEvent.setup()
    renderRequests(`/console/requests/${uuid(101)}`)

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.click(screen.getByRole('button', { name: '신청 취소' }))

    const dialog = await screen.findByRole('dialog', { name: '신청 취소' })
    expect(within(dialog).getByText(/정말 이 신청을 취소하시겠습니까/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '신청 취소' }))

    expect(await screen.findByText('취소됨')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '신청 취소' })).not.toBeInTheDocument()
  })

  test('이미 처리된 신청을 취소하면 409 안내를 보여주고 상태를 새로 고친다', async () => {
    const user = userEvent.setup()
    renderRequests(`/console/requests/${uuid(101)}`)

    await screen.findByRole('heading', { name: '신청 상세' })
    // 상세를 보는 사이 관리자가 승인한 상황을 재현한다.
    const target = requestStore.find((r) => r.id === uuid(101))!
    target.status = 'APPROVED'

    await user.click(screen.getByRole('button', { name: '신청 취소' }))
    const dialog = await screen.findByRole('dialog', { name: '신청 취소' })
    await user.click(within(dialog).getByRole('button', { name: '신청 취소' }))

    expect(
      await screen.findByText('이미 승인 또는 반려된 신청은 취소할 수 없습니다.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('승인됨')).toBeInTheDocument()
  })
})
