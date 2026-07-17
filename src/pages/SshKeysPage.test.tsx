import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { DUPLICATE_PUBLIC_KEY } from '../test/msw/handlers/ssh-keys'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderKeys() {
  server.use(refreshSuccessHandler('access-student'))
  renderApp('/console/ssh-keys')
}

const VALID_PUBLIC_KEY =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINEWKEY000000000000000000000000000000000000 me@laptop'

describe('SSH 키 페이지', () => {
  test('키가 하나도 없으면 빈 상태에서 만들기·등록을 안내한다', async () => {
    server.use(http.get('*/api/v1/me/ssh-keys', () => HttpResponse.json([])))
    renderKeys()

    expect(await screen.findByText('등록된 SSH 키가 없습니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '키 만들기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '기존 공개키 등록' })).toBeInTheDocument()
  })

  test('목록은 지문·알고리즘을 보여주고, 개인키 다운로드는 생성 키에만 노출한다', async () => {
    renderKeys()

    const pasteRow = (await screen.findByText('연구실 노트북')).closest('tr') as HTMLElement
    const genRow = screen.getByText('피클에서 만든 키').closest('tr') as HTMLElement

    // 붙여넣기 키(privateKeyStored=false)는 개인키 다운로드 버튼이 없다.
    expect(
      within(pasteRow).queryByRole('button', { name: '개인키 다운로드' }),
    ).not.toBeInTheDocument()
    // 생성 키(privateKeyStored=true)는 개인키 다운로드 버튼이 있다.
    expect(
      within(genRow).getByRole('button', { name: '개인키 다운로드' }),
    ).toBeInTheDocument()
    // 마지막 사용 이력이 없으면 '사용 기록 없음'.
    expect(within(genRow).getByText('사용 기록 없음')).toBeInTheDocument()
    expect(within(pasteRow).getByText(/SHA256:mVqyNQ/)).toBeInTheDocument()
  })

  test('공개키 등록에서 지원하지 않는 키(422)는 필드 오류로 표시한다', async () => {
    const user = userEvent.setup()
    renderKeys()

    await screen.findByText(/등록된 키/)
    await user.click(screen.getByRole('button', { name: '공개키 등록' }))
    const dialog = await screen.findByRole('dialog', { name: '공개키 등록' })
    await user.type(within(dialog).getByLabelText('이름'), '내 키')
    await user.type(within(dialog).getByLabelText('공개키'), 'ecdsa-sha2-nistp256 AAAA')
    await user.click(within(dialog).getByRole('button', { name: '등록' }))

    expect(
      await within(dialog).findByText(/지원하지 않는 키 형식입니다/),
    ).toBeInTheDocument()
  })

  test('중복 지문(409)은 모달 상단 경고로 표시한다', async () => {
    const user = userEvent.setup()
    renderKeys()

    await screen.findByText(/등록된 키/)
    await user.click(screen.getByRole('button', { name: '공개키 등록' }))
    const dialog = await screen.findByRole('dialog', { name: '공개키 등록' })
    await user.type(within(dialog).getByLabelText('이름'), '중복 키')
    await user.type(within(dialog).getByLabelText('공개키'), DUPLICATE_PUBLIC_KEY)
    await user.click(within(dialog).getByRole('button', { name: '등록' }))

    expect(await within(dialog).findByText(/이미 등록된 키입니다/)).toBeInTheDocument()
  })

  test('공개키를 등록하면 목록에 추가된다', async () => {
    const user = userEvent.setup()
    renderKeys()

    await screen.findByText(/등록된 키/)
    await user.click(screen.getByRole('button', { name: '공개키 등록' }))
    const dialog = await screen.findByRole('dialog', { name: '공개키 등록' })
    await user.type(within(dialog).getByLabelText('이름'), '새 노트북')
    await user.type(within(dialog).getByLabelText('공개키'), VALID_PUBLIC_KEY)
    await user.click(within(dialog).getByRole('button', { name: '등록' }))

    expect(await screen.findByText('새 노트북')).toBeInTheDocument()
  })

  test('키 삭제는 확인 모달의 경고 후 목록에서 제거한다', async () => {
    const user = userEvent.setup()
    renderKeys()

    const pasteRow = (await screen.findByText('연구실 노트북')).closest('tr') as HTMLElement
    await user.click(within(pasteRow).getByRole('button', { name: '삭제' }))

    const dialog = await screen.findByRole('dialog', { name: 'SSH 키 삭제' })
    expect(
      within(dialog).getByText(/삭제 즉시 이 키로는 어떤 VM에도 접속할 수 없습니다/),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '삭제' }))

    await screen.findByText(/등록된 키/)
    expect(screen.queryByText('연구실 노트북')).not.toBeInTheDocument()
  })
})

describe('SSH 키 — 만들기·다운로드', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  test('키 만들기 → 성공 화면에서 지문과 개인키 다운로드를 제공한다', async () => {
    const user = userEvent.setup()
    renderKeys()

    await screen.findByText(/등록된 키/)
    await user.click(screen.getByRole('button', { name: '키 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '키 만들기' })
    await user.type(within(dialog).getByLabelText('이름'), '새로 만든 키')
    await user.click(within(dialog).getByRole('button', { name: '키 만들기' }))

    // 성공 화면: 지문 + 개인키 다운로드 + 재다운로드 안내.
    expect(await within(dialog).findByText('키를 만들었습니다')).toBeInTheDocument()
    expect(
      within(dialog).getByText(/개인키는 언제든 이 페이지에서 다시 받을 수 있으며/),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '개인키 다운로드' }))
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(
      await screen.findByText(/개인키를 내려받았습니다\. 다운로드는 감사 기록됩니다\./),
    ).toBeInTheDocument()
  })

  test('목록의 생성 키에서 개인키를 재다운로드할 수 있다', async () => {
    const user = userEvent.setup()
    renderKeys()

    const genRow = (await screen.findByText('피클에서 만든 키')).closest('tr') as HTMLElement
    await user.click(within(genRow).getByRole('button', { name: '개인키 다운로드' }))

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(
      await screen.findByText(/개인키를 내려받았습니다/),
    ).toBeInTheDocument()
  })
})
