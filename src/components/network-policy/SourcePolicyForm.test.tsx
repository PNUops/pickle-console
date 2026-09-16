import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { SourcePolicyForm, type SourcePolicyFormProps } from './SourcePolicyForm'
import type { SourcePolicyDraft } from './model'

function mount(overrides: Partial<SourcePolicyFormProps> = {}) {
  const save = vi.fn()
  const { value: initial, ...props } = overrides
  function Form() {
    const [value, setValue] = useState<SourcePolicyDraft>(initial ?? { cidrsText: '', includeCampusPreset: false })
    return <SourcePolicyForm value={value} onChange={setValue} onSubmit={save} canEdit campusPresetAvailable {...props} />
  }
  render(<Form />)
  return save
}

describe('source access policy form', () => {
  test('saves an explicit empty policy with a visible consequence', async () => {
    const user = userEvent.setup()
    const save = mount()
    expect(screen.getByText('이대로 저장하면 새 연결을 모두 차단합니다.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '출발지 정책 저장' }))
    expect(save).toHaveBeenCalledWith({ allowedCidrs: [], includeCampusPreset: false })
  })

  test('normalizes host addresses and preserves the campus selection', async () => {
    const user = userEvent.setup()
    const save = mount()
    await user.type(screen.getByLabelText('허용할 출발지'), '192.0.2.7\n2001:DB8::/32')
    await user.click(screen.getByRole('checkbox', { name: '교내 주소 허용' }))
    expect(screen.queryByText('이대로 저장하면 새 연결을 모두 차단합니다.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '출발지 정책 저장' }))
    expect(save).toHaveBeenCalledWith({ allowedCidrs: ['192.0.2.7/32', '2001:db8::/32'], includeCampusPreset: true })
  })

  test('shows validation failures without submitting a broader network', async () => {
    const user = userEvent.setup()
    const save = mount()
    await user.type(screen.getByLabelText('허용할 출발지'), '192.0.2.7/24')
    await user.click(screen.getByRole('button', { name: '출발지 정책 저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('네트워크 시작 주소')
    expect(screen.getByLabelText('허용할 출발지')).toHaveAttribute('aria-invalid', 'true')
    expect(save).not.toHaveBeenCalled()
  })

  test('rejects IPv6 on a relay form', async () => {
    const user = userEvent.setup()
    const save = mount({ ipv4Only: true })
    await user.type(screen.getByLabelText('허용할 출발지'), '2001:db8::/32')
    await user.click(screen.getByRole('button', { name: '출발지 정책 저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('IPv4')
    expect(save).not.toHaveBeenCalled()
  })

  test('does not submit an unavailable campus preset', async () => {
    const user = userEvent.setup()
    const save = mount({ campusPresetAvailable: false, value: { cidrsText: '', includeCampusPreset: true } })
    expect(screen.getByRole('checkbox')).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: '출발지 정책 저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('직접 주소를 입력')
    expect(save).not.toHaveBeenCalled()
  })

  test.each(['user', 'admin'] as const)('prevents submission without resource permission on %s surface', (surface) => {
    const save = mount({ canEdit: false, surface, value: { cidrsText: '192.0.2.7/32', includeCampusPreset: false } })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    if (surface === 'user') {
      expect(screen.getByLabelText('허용할 출발지')).toBeDisabled()
      expect(screen.getByRole('note')).toHaveTextContent('소유자와 편집자')
      fireEvent.submit(screen.getByRole('form'))
    } else {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      expect(screen.getByText('192.0.2.7/32')).toBeInTheDocument()
    }
    expect(save).not.toHaveBeenCalled()
  })

  test('blocks duplicate submissions while saving', () => {
    const save = mount({ busy: true })
    fireEvent.submit(screen.getByRole('form'))
    expect(screen.getByLabelText('허용할 출발지')).toBeDisabled()
    expect(save).not.toHaveBeenCalled()
  })
})
