import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { Button } from './Button'
import { ConfirmNameModal } from './ConfirmNameModal'
import { FormField } from './FormField'
import { Input } from './Input'
import { Modal } from './Modal'
import { RequestStatusBadge, VmStatusBadge } from './Badge'

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
  })
})
