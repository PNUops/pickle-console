import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  orgViewerUser,
  problemResponse,
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
  sysViewerUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

describe('공지사항 관리', () => {
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

  test('기관 관리자가 올린 팝업 공지를 익명 방문자가 본다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    const admin = renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '공지 등록' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 등록' })
    await user.type(within(drawer).getByLabelText('제목'), '학부 서버실 이전 안내')
    await user.type(within(drawer).getByLabelText('본문'), '9월 첫째 주에 이전합니다.')
    await user.click(within(drawer).getByRole('checkbox', { name: /팝업으로 표시/ }))
    await user.click(within(drawer).getByRole('button', { name: '등록' }))

    expect(await screen.findByRole('button', { name: '학부 서버실 이전 안내' })).toBeInTheDocument()
    admin.unmount()

    // **세션을 실제로 끊는다.** 앞의 refresh 핸들러는 테스트가 끝날 때까지 살아
    // 있으므로, 그대로 두면 두 번째 렌더가 다시 기관 관리자로 복원된다 — 팝업이
    // 뜨는 것은 맞지만 그것은 익명이라서가 아니라 로그인해서다. 그러면 이름이
    // 말하는 것을 재지 않는 테스트가 된다.
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        problemResponse({
          type: 'about:blank',
          title: '세션이 만료되었습니다',
          status: 401,
          detail: '다시 로그인해 주세요.',
          code: 'AUTH_REFRESH_TOKEN_INVALID',
        }),
      ),
    )

    // 종전에는 기관 관리자가 익명에게 닿는 글을 올릴 방법이 없었다 — 기관 공지의
    // 익명 공개는 422였고 전역 공지는 403이었다. 축이 하나로 합쳐지면서 체크박스
    // 하나가 그 문을 연다. 이 테스트는 그 사실을 기록해 둔다.
    renderApp('/login')
    expect(await screen.findByRole('dialog', { name: '학부 서버실 이전 안내' })).toBeInTheDocument()
    // 여전히 로그인 화면이라는 것이 곧 세션이 없다는 뜻이다. 세션이 복원됐다면
    // LoginPage가 역할별 홈으로 즉시 보내므로 경로가 /admin이 된다. 로그인 제목만
    // 재면 그 리다이렉트 직전의 한 프레임에 걸려 통과한다.
    expect(currentPath()).toBe('/login')
  })

  test('기관 관리자의 공지가 기관 관계가 전혀 없는 사용자에게 닿는다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    const admin = renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '공지 등록' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 등록' })
    await user.type(within(drawer).getByLabelText('제목'), '실습실 이용 안내')
    await user.type(within(drawer).getByLabelText('본문'), '기관과 무관하게 모두에게 갑니다.')
    await user.click(within(drawer).getByRole('button', { name: '등록' }))

    expect(await screen.findByRole('button', { name: '실습실 이용 안내' })).toBeInTheDocument()
    admin.unmount()

    // 읽는이는 `managedOrgs`가 비어 있고 어느 기관에도 걸리지 않은 계정이다.
    // 종전 모델이라면 이 글은 작성자의 기관 사람에게만 갔다. 남은 경계가 인증
    // 하나뿐이고 기관 모양이 아니라는 것을 이 테스트가 고정한다.
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/notices')

    expect(await screen.findByRole('link', { name: /실습실 이용 안내/ })).toBeInTheDocument()
  })

  test('폼이 슬롯을 두지 않은 필드의 거절도 눈에 보인다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    // 이 폼이 서버 필드 오류를 붙여 주는 자리는 제목·본문·기간뿐이다. 체크박스로
    // 그리는 필드를 서버가 지적하면 붙을 곳이 없으므로, 필드에만 맡기면 거절이
    // 아무 데도 남지 않는다 — 등록 버튼이 조용히 죽은 것처럼 보인다.
    server.use(
      http.post('*/api/v1/admin/notices', () =>
        problemResponse({
          type: 'about:blank',
          title: '입력값이 올바르지 않습니다',
          status: 422,
          detail: '요청 값을 확인해 주세요.',
          code: 'VALIDATION_FAILED',
          errors: [{ field: 'popup', message: '팝업 공지는 게시 기간이 필요합니다.' }],
        }),
      ),
    )
    renderApp('/admin/notices')

    await user.click(await screen.findByRole('button', { name: '공지 등록' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 등록' })
    await user.type(within(drawer).getByLabelText('제목'), '슬롯 없는 거절')
    await user.type(within(drawer).getByLabelText('본문'), '거절이 보여야 한다.')
    await user.click(within(drawer).getByRole('button', { name: '등록' }))

    expect(await within(drawer).findByText('팝업 공지는 게시 기간이 필요합니다.')).toBeInTheDocument()
  })

  test('기관 열람자는 관리 목록에 닿고, 쓰기는 사유와 함께 막힌다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp('/admin/notices')

    // 관리 목록이 게시판과 다른 점은 이제 범위가 아니라 창이다 — 아직 시작하지
    // 않은 공지가 여기에는 선다. 메뉴도 함께 서야 닿을 방법이 있다.
    expect(await screen.findByRole('link', { name: '공지사항 관리' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '서비스 점검 팝업' }))

    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    expect(within(drawer).getByRole('button', { name: '저장' })).toBeDisabled()
    expect(within(drawer).getByRole('button', { name: '삭제' })).toBeDisabled()
    // 비활성만으로는 부족하다 — 왜 못 하는지가 함께 있어야 한다.
    expect(
      within(drawer).getByText(
        '공지 등록·수정·삭제는 기관 관리자·시스템 관리자만 수행할 수 있습니다.',
      ),
    ).toBeInTheDocument()
  })

  test('시스템 열람자도 관리 목록을 전부 읽고 쓰지는 못한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser))
    renderApp('/admin/notices')

    // 관리 목록에는 걸러 낼 것이 없다 — 게이트를 통과한 역할은 모든 행을 읽는다.
    expect(await screen.findByRole('button', { name: '서비스 점검 팝업' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '데이터센터 정기 점검 안내' }))

    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    expect(within(drawer).getByRole('button', { name: '저장' })).toBeDisabled()
    expect(
      within(drawer).getByText(
        '공지 등록·수정·삭제는 기관 관리자·시스템 관리자만 수행할 수 있습니다.',
      ),
    ).toBeInTheDocument()
  })

  test('게시 창 밖 공지의 미리보기도 자격을 실어 받아 온다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/notices')

    // 만료된 공지의 이미지는 공개 경로로는 404다 — 관리자가 보려면 자격이 실려야 한다.
    await user.click(await screen.findByRole('button', { name: '지난 점검 공지' }))
    const expired = await screen.findByRole('dialog', { name: '공지 상세' })
    expect(
      (await within(expired).findByRole('img', { name: 'past.png' })).getAttribute('src'),
    ).toMatch(/^blob:/)
    await user.click(within(expired).getByRole('button', { name: '닫기' }))

    // 창 밖은 양쪽이다. 아직 시작하지 않은 공지가 더 중요한 쪽인데, 게시 직전에
    // 무엇을 내보내는지 확인할 방법이 그 미리보기뿐이기 때문이다. 팝업이라
    // 게시되면 익명에게도 보일 글이라는 점이 확인을 더 값지게 만든다.
    await user.click(await screen.findByRole('button', { name: '서비스 점검 팝업' }))
    const scheduled = await screen.findByRole('dialog', { name: '공지 상세' })
    expect(
      (await within(scheduled).findByRole('img', { name: 'scheduled.png' })).getAttribute('src'),
    ).toMatch(/^blob:/)
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

  test('기관 관리자가 시스템 관리자의 공지를 고친다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/notices')

    // 픽스처의 공지는 전부 '이시스템'이 쓴 것이다. 공지가 어느 기관에도 속하지
    // 않으므로 작성자와 고치는 사람의 역할을 맞춰 볼 것이 없다 — 게이트를 통과한
    // 사람은 모든 행에 쓴다. 종전에는 이것이 403이었다.
    await user.click(await screen.findByRole('button', { name: '데이터센터 정기 점검 안내' }))
    const drawer = await screen.findByRole('dialog', { name: '공지 상세' })
    await user.clear(within(drawer).getByLabelText('제목'))
    await user.type(within(drawer).getByLabelText('제목'), '점검 일정이 바뀌었습니다')
    await user.click(within(drawer).getByRole('button', { name: '저장' }))

    expect(await screen.findByRole('button', { name: '점검 일정이 바뀌었습니다' })).toBeInTheDocument()
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
