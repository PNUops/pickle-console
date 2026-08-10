import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { PopoverPanel } from './Popover'
import { usePopover } from './use-popover'
import { TabPanel, Tabs } from './Tabs'
import { Button } from './Button'
import { ConfirmNameModal } from './ConfirmNameModal'
import { Drawer } from './Drawer'
import { ErrorBoundary } from './ErrorBoundary'
import { FormField } from './FormField'
import { Input } from './Input'
import { Modal } from './Modal'
import { Pagination } from './Pagination'
import { RequestStatusBadge, VmStatusBadge } from './Badge'
import { ToastProvider } from './Toast'
import { useToast } from './toast-context'

describe('Button', () => {
  test('loading state disables the button and marks it busy', () => {
    render(<Button loading>저장</Button>)
    const button = screen.getByRole('button', { name: /저장/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})

describe('FormField + Input', () => {
  test('wires label, description, and error to the input', () => {
    render(
      <FormField label="이메일" description="학교 이메일을 입력하세요" error="필수 항목입니다">
        <Input type="email" />
      </FormField>,
    )
    const input = screen.getByLabelText('이메일')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('필수 항목입니다 학교 이메일을 입력하세요')
    expect(screen.getByRole('alert')).toHaveTextContent('필수 항목입니다')
  })
})

describe('Modal', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          열기
        </button>
        <Modal open={open} onClose={() => setOpen(false)} title="확인">
          <p>내용</p>
          <button type="button">확인 버튼</button>
        </Modal>
      </>
    )
  }

  test('opens with dialog semantics, closes on Escape, restores focus', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: '열기' })
    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '확인' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  test('backdrop click closes the modal', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="확인">
        내용
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.parentElement?.firstElementChild as HTMLElement
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('Drawer', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <MemoryRouter>
        <button type="button" onClick={() => setOpen(true)}>
          상세 열기
        </button>
        <Drawer open={open} onClose={() => setOpen(false)} title="상세" footer={<span>푸터</span>}>
          <p>본문</p>
          <button type="button">본문 버튼</button>
        </Drawer>
      </MemoryRouter>
    )
  }

  test('다이얼로그 시맨틱으로 열리고 Escape로 닫히며 포커스를 복원한다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: '상세 열기' })
    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '상세' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('푸터')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  test('오버레이 클릭으로 닫힌다', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <Drawer open onClose={onClose} title="상세">
          본문
        </Drawer>
      </MemoryRouter>,
    )
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.parentElement?.firstElementChild as HTMLElement
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('stacked dialogs', () => {
  function Harness() {
    const [outerOpen, setOuterOpen] = useState(true)
    const [innerOpen, setInnerOpen] = useState(false)
    return (
      <>
        <Modal open={outerOpen} onClose={() => setOuterOpen(false)} title="바깥">
          <button type="button" onClick={() => setInnerOpen(true)}>
            안쪽 열기
          </button>
        </Modal>
        <Modal open={innerOpen} onClose={() => setInnerOpen(false)} title="안쪽">
          <button type="button">안쪽 버튼</button>
        </Modal>
      </>
    )
  }

  test('키보드 처리가 최상단 다이얼로그에만 적용된다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '안쪽 열기' }))
    const inner = screen.getByRole('dialog', { name: '안쪽' })

    // Tab 순환이 안쪽 다이얼로그를 벗어나지 않는다
    await user.tab()
    expect(inner.contains(document.activeElement)).toBe(true)
    await user.tab()
    expect(inner.contains(document.activeElement)).toBe(true)

    // Escape 한 번에 안쪽만 닫히고, 바깥은 남는다
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '안쪽' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '바깥' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('겹친 채 통째로 언마운트돼도 body 스크롤 락이 남지 않는다', async () => {
    // 라우트 이동 시 부모(드로어)→자식(모달) 순 cleanup이 돌아도 스택이
    // 비는 시점에만 복원해야 한다.
    const user = userEvent.setup()
    const { unmount } = render(<Harness />)
    await user.click(screen.getByRole('button', { name: '안쪽 열기' }))
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('status badges', () => {
  test('renders Korean labels for request and VM states', () => {
    render(
      <>
        <RequestStatusBadge status="SUBMITTED" />
        <VmStatusBadge status="NEEDS_ADMIN" />
      </>,
    )
    expect(screen.getByText('승인 대기')).toBeInTheDocument()
    expect(screen.getByText('관리자 확인 필요')).toBeInTheDocument()
  })
})

describe('ConfirmNameModal', () => {
  test('대상 이름을 정확히 입력해야만 확인 버튼이 활성화된다', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmNameModal
        open
        onClose={() => {}}
        title="삭제 확인"
        expectedName="capstone-team3-api"
        confirmLabel="삭제 접수"
        onConfirm={onConfirm}
      >
        <p>되돌릴 수 없는 작업입니다.</p>
      </ConfirmNameModal>,
    )
    const confirm = screen.getByRole('button', { name: '삭제 접수' })
    expect(confirm).toBeDisabled()

    const input = screen.getByLabelText(/capstone-team3-api/)
    await user.type(input, 'capstone-team3-ap')
    expect(confirm).toBeDisabled()
    // 불일치 상태에서 눌러도 아무 일도 일어나지 않는다.
    await user.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()

    await user.type(input, 'i')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledOnce()
    // 서버 이중 확인(confirmName 정확 일치)이 살아 있으려면 호출부가
    // expectedName이 아니라 "타이핑한 값"을 받아 전송해야 한다.
    expect(onConfirm).toHaveBeenCalledWith('capstone-team3-api')
  })
})

describe('Pagination', () => {
  test('현재 페이지 주변과 양끝만 번호로 보여주고 간극은 생략한다', () => {
    const onPageChange = vi.fn()
    render(<Pagination page={5} totalPages={12} onPageChange={onPageChange} />)

    // 1 … 5 6 7 … 12 (표시는 1-기반)
    for (const label of ['1 페이지', '5 페이지', '6 페이지', '7 페이지', '12 페이지']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: '3 페이지' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '6 페이지' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('번호 클릭은 0-기반 페이지로 콜백하고, 단일 페이지면 렌더하지 않는다', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    const { rerender } = render(
      <Pagination page={0} totalPages={3} onPageChange={onPageChange} />,
    )

    await user.click(screen.getByRole('button', { name: '3 페이지' }))
    expect(onPageChange).toHaveBeenCalledWith(2)

    rerender(<Pagination page={0} totalPages={1} onPageChange={onPageChange} />)
    expect(screen.queryByRole('navigation', { name: '페이지 이동' })).not.toBeInTheDocument()
  })
})

describe('Toast', () => {
  function Demo() {
    const toast = useToast()
    return (
      <>
        <Button onClick={() => toast.success('저장되었습니다')}>성공</Button>
        <Button onClick={() => toast.error('실패했습니다')}>실패</Button>
      </>
    )
  }

  test('성공·실패 토스트를 쌓아 보여주고 닫기 버튼으로 개별 해제한다', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('button', { name: '성공' }))
    await user.click(screen.getByRole('button', { name: '실패' }))
    expect(screen.getByText('저장되었습니다')).toBeInTheDocument()
    expect(screen.getByText('실패했습니다')).toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: '알림 닫기' })[0])
    expect(screen.queryByText('저장되었습니다')).not.toBeInTheDocument()
    expect(screen.getByText('실패했습니다')).toBeInTheDocument()
  })

  test('5초 뒤 자동으로 사라진다', () => {
    vi.useFakeTimers()
    try {
      render(
        <ToastProvider>
          <Demo />
        </ToastProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: '성공' }))
      expect(screen.getByText('저장되었습니다')).toBeInTheDocument()

      act(() => vi.advanceTimersByTime(5000))
      expect(screen.queryByText('저장되었습니다')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Tabs', () => {
  function TabsHarness() {
    const [tab, setTab] = useState('a')
    return (
      <>
        <Tabs
          aria-label="예시 탭"
          tabs={[
            { id: 'a', label: '첫째' },
            { id: 'b', label: '둘째' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <TabPanel id="a" active={tab === 'a'}>
          A 내용
        </TabPanel>
        <TabPanel id="b" active={tab === 'b'}>
          B 내용
        </TabPanel>
      </>
    )
  }

  test('클릭으로 탭을 전환하고 비활성 패널은 렌더하지 않는다', async () => {
    const user = userEvent.setup()
    render(<TabsHarness />)
    expect(screen.getByRole('tab', { name: '첫째' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('A 내용')).toBeInTheDocument()
    expect(screen.queryByText('B 내용')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '둘째' }))
    expect(screen.getByRole('tab', { name: '둘째' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('B 내용')).toBeInTheDocument()
    expect(screen.queryByText('A 내용')).not.toBeInTheDocument()
  })

  test('화살표 키 이동이 즉시 활성화되고 roving tabIndex를 유지한다', async () => {
    const user = userEvent.setup()
    render(<TabsHarness />)
    const first = screen.getByRole('tab', { name: '첫째' })
    first.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '둘째' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '첫째' })).toHaveAttribute('tabindex', '-1')
    await user.keyboard('{ArrowRight}') // 끝에서 순환
    expect(screen.getByRole('tab', { name: '첫째' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Popover', () => {
  // usePopover가 useLocation을 쓰므로 하네스는 Router 안에서 렌더해야 한다.
  function PopoverContent() {
    const { open, toggle, rootRef, triggerRef } = usePopover()
    return (
      <>
        <div ref={rootRef} className="relative">
          <button ref={triggerRef} type="button" onClick={toggle} aria-expanded={open}>
            열기
          </button>
          <PopoverPanel open={open} aria-label="패널">
            패널 내용
          </PopoverPanel>
        </div>
        <button type="button">바깥 버튼</button>
      </>
    )
  }
  function PopoverHarness() {
    return (
      <MemoryRouter>
        <PopoverContent />
      </MemoryRouter>
    )
  }

  test('토글로 열리고 바깥 클릭으로 닫힌다', async () => {
    const user = userEvent.setup()
    render(<PopoverHarness />)
    await user.click(screen.getByRole('button', { name: '열기' }))
    expect(screen.getByRole('dialog', { name: '패널' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '바깥 버튼' }))
    expect(screen.queryByRole('dialog', { name: '패널' })).not.toBeInTheDocument()
  })

  test('Escape로 닫히면 트리거로 포커스가 복귀한다', async () => {
    const user = userEvent.setup()
    render(<PopoverHarness />)
    const trigger = screen.getByRole('button', { name: '열기' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: '패널' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '패널' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

describe('ErrorBoundary', () => {
  function Boom(): never {
    throw new Error('청크를 불러오지 못했습니다')
  }

  test('패널 하나가 무너져도 안내로 바뀌고 화면은 남는다', () => {
    // React와 경계 자신이 원인을 콘솔에 남긴다 — 테스트 출력만 조용히 한다.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <ErrorBoundary label="할당 추이">
          <Boom />
        </ErrorBoundary>
        <p>나머지 화면</p>
      </div>,
    )

    expect(
      screen.getByText(/할당 추이 화면을 불러오지 못했습니다/),
    ).toBeInTheDocument()
    expect(screen.getByText('나머지 화면')).toBeInTheDocument()
    logged.mockRestore()
  })

  test('멀쩡한 자식은 그대로 그린다', () => {
    render(
      <ErrorBoundary label="사용량">
        <p>차트</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('차트')).toBeInTheDocument()
  })
})
