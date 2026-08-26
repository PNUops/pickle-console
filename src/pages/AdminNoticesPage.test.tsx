import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  problemResponse,
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('공지사항 관리', () => {
  test('기관 관리자는 전역 범위를 고를 수 없고, 기관 공지에는 익명 공개가 막힌다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '기관 전용 안내' }))

    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    expect(within(drawer).queryByRole('option', { name: '전역' })).not.toBeInTheDocument()
    expect(within(drawer).getByRole('option', { name: '기관' })).toBeInTheDocument()
    expect(within(drawer).getByRole('radio', { name: '익명까지 공개' })).toBeDisabled()
    expect(within(drawer).getByRole('radio', { name: '로그인 사용자' })).toBeChecked()
    // 계약의 수정 요청은 범위를 받지 않는다 — 등록된 공지의 범위는 잠겨 있다.
    expect(within(drawer).getByLabelText(/게시 범위/)).toBeDisabled()
    expect(within(drawer).getByText('등록 후에는 범위를 바꿀 수 없습니다.')).toBeInTheDocument()
  })

  test('운영자에게도 드로어는 열리되 쓰기 액션은 사유와 함께 비활성이다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
    renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '데이터센터 정기 점검 안내' }))

    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    expect(within(drawer).getByRole('button', { name: '저장' })).toBeDisabled()
    expect(within(drawer).getByRole('button', { name: '삭제' })).toBeDisabled()
    expect(
      within(drawer).getByText(
        '공지 등록·수정·삭제는 기관 관리자·시스템 관리자만 수행할 수 있습니다.',
      ),
    ).toBeInTheDocument()
  })

  test('2MB를 넘는 이미지는 보내기 전에 거절한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '데이터센터 정기 점검 안내' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })

    const oversized = new File([new Uint8Array(3 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    })
    await user.upload(within(drawer).getByLabelText('이미지 추가'), oversized)

    expect(
      await screen.findByText('이미지 한 장의 크기는 2MB를 넘을 수 없습니다.'),
    ).toBeInTheDocument()
  })

  test('이미지가 아닌 파일은 보내기 전에 거절한다', async () => {
    // 브라우저의 accept 필터를 끄고, 화면 자체의 확인만 본다.
    const user = userEvent.setup({ applyAccept: false })
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '데이터센터 정기 점검 안내' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })

    const wrongType = new File(['plain'], 'notes.txt', { type: 'text/plain' })
    await user.upload(within(drawer).getByLabelText('이미지 추가'), wrongType)

    expect(
      await screen.findByText('PNG·JPEG·WebP·GIF 이미지만 첨부할 수 있습니다.'),
    ).toBeInTheDocument()
  })

  test('시스템 관리자는 공지를 등록하고 이어서 이미지를 붙일 수 있다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '공지 등록' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 등록' })

    // 등록 전에는 이미지를 붙일 수 없다 — 업로드가 두 번째 호출이기 때문이다.
    expect(
      within(drawer).getByText('공지를 먼저 등록하면 이미지를 첨부할 수 있습니다.'),
    ).toBeInTheDocument()

    await user.type(within(drawer).getByLabelText('제목'), '스토리지 증설 안내')
    await user.type(within(drawer).getByLabelText('본문'), '9월 1일 스토리지를 증설합니다.')
    await user.click(within(drawer).getByRole('button', { name: '등록' }))

    expect(
      await screen.findByText('공지를 등록했습니다. 이어서 이미지를 첨부할 수 있습니다.'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '스토리지 증설 안내' })).toBeInTheDocument()
    expect(await screen.findByLabelText('이미지 추가')).toBeEnabled()
  })

  test('기관 관리자가 등록하면 자기 기관이 대상으로 실린다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '공지 등록' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 등록' })
    await user.type(within(drawer).getByLabelText('제목'), '학부 서버실 이전 안내')
    await user.type(within(drawer).getByLabelText('본문'), '9월 첫째 주에 이전합니다.')
    await user.click(within(drawer).getByRole('button', { name: '등록' }))

    // 대상 기관을 싣지 않았다면 서버가 422로 되돌린다 — 목록에 서면 실려 간 것이다.
    expect(await screen.findByRole('button', { name: '학부 서버실 이전 안내' })).toBeInTheDocument()
    const row = screen.getByRole('button', { name: '학부 서버실 이전 안내' }).closest('tr')!
    expect(within(row).getByText('정보컴퓨터공학부')).toBeInTheDocument()
  })

  test('게시 창 밖 공지의 미리보기도 자격을 실어 받아 온다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/notices')

    // 만료된 공지의 이미지는 공개 경로로는 404다 — 관리자가 보려면 자격이 실려야 한다.
    await user.click(await screen.findByRole('button', { name: '지난 점검 공지' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    const image = await within(drawer).findByRole('img', { name: 'past.png' })
    expect(image.getAttribute('src')).toMatch(/^blob:/)
  })

  test('서버가 크기를 이유로 413으로 거절하면 그 사유를 그대로 보여준다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    // 화면의 사전 확인을 통과한 파일도 서버가 되돌릴 수 있다(멀티파트 상한 등).
    server.use(
      http.post('*/api/v1/admin/notices/:noticeId/images', () =>
        problemResponse({
          type: 'about:blank',
          title: '요청 본문이 너무 큽니다',
          status: 413,
          detail: '이미지 한 장은 2 MiB까지 첨부할 수 있습니다.',
          code: 'NOTICE_IMAGE_TOO_LARGE',
        }),
      ),
    )
    renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '데이터센터 정기 점검 안내' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    const small = new File([new Uint8Array(64)], 'small.png', { type: 'image/png' })
    await user.upload(within(drawer).getByLabelText('이미지 추가'), small)

    expect(
      await screen.findByText('이미지 한 장은 2 MiB까지 첨부할 수 있습니다.'),
    ).toBeInTheDocument()
  })

  test('삭제는 확인을 거친 뒤 목록에서 사라진다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '지난 점검 공지' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    await user.click(within(drawer).getByRole('button', { name: '삭제' }))

    const confirm = await screen.findByRole('dialog', { name: '공지 삭제' })
    await user.click(within(confirm).getByRole('button', { name: '삭제' }))

    expect(await screen.findByText('공지를 삭제했습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지난 점검 공지' })).not.toBeInTheDocument()
  })
})
