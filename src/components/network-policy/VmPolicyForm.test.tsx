import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { VmPolicyForm, type VmPolicyFormProps } from './VmPolicyForm'
import { MAX_USER_RULES, type VmRuleDraft } from './model'

const first: VmRuleDraft = { id: 'first', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', cidr: '192.0.2.7', ports: '443' }
const second: VmRuleDraft = { id: 'second', direction: 'OUT', action: 'DROP', protocol: 'UDP', cidr: '198.51.100.0/24', ports: '8000-8010' }

function mount(overrides: Partial<VmPolicyFormProps> = {}) {
  const save = vi.fn()
  const { value: initial, ...props } = overrides
  function Form() {
    const [value, setValue] = useState<readonly VmRuleDraft[]>(initial ?? [])
    return <VmPolicyForm value={value} onChange={setValue} onSubmit={save} canEdit systemRules={[
      { key: 'SSH_GATEWAY', description: 'SSH와 웹 터미널 접속 허용' },
    ]} {...props} />
  }
  render(<Form />)
  return save
}

describe('VM communication policy form', () => {
  test('keeps default policies and mandatory access visible with no user rules', async () => {
    const user = userEvent.setup()
    const save = mount()
    expect(screen.getByText('기본 수신').nextElementSibling).toHaveTextContent('차단')
    expect(screen.getByText('기본 송신').nextElementSibling).toHaveTextContent('허용')
    expect(screen.getByText('같은 워크스페이스의 VM도 수신 허용 규칙이 필요합니다.')).toBeInTheDocument()
    const system = screen.getByRole('region', { name: '필수 규칙' })
    expect(within(system).getByText('변경 불가')).toBeInTheDocument()
    expect(within(system).getByText('SSH와 웹 터미널 접속 허용')).toBeInTheDocument()
    expect(within(system).queryByRole('button')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '통신 정책 저장' }))
    expect(save).toHaveBeenCalledWith([])
  })

  test('adds a rule and submits normalized direction, action and port bounds', async () => {
    const user = userEvent.setup()
    const save = mount()
    await user.click(screen.getByRole('button', { name: '규칙 추가' }))
    await user.selectOptions(screen.getByLabelText('방향'), 'OUT')
    expect(screen.queryByLabelText('출발지 IP/CIDR')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('목적지 IP/CIDR'), '192.0.2.7')
    await user.selectOptions(screen.getByLabelText('처리'), 'DROP')
    await user.type(screen.getByLabelText('대상 포트'), '8000-8010')
    await user.click(screen.getByRole('button', { name: '통신 정책 저장' }))
    expect(save).toHaveBeenCalledWith([{ direction: 'OUT', action: 'DROP', protocol: 'TCP', peer: '192.0.2.7/32', portStart: 8000, portEnd: 8010 }])
  })

  test('preserves explicit rule ordering through moves and deletion', async () => {
    const user = userEvent.setup()
    const save = mount({ value: [first, second] })
    expect(screen.getByRole('button', { name: '규칙 1 위로 이동' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '규칙 2 아래로 이동' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '규칙 2 위로 이동' }))
    await user.click(screen.getByRole('button', { name: '통신 정책 저장' }))
    expect(save.mock.calls[0][0].map((rule: { peer: string }) => rule.peer)).toEqual(['198.51.100.0/24', '192.0.2.7/32'])
    await user.click(screen.getByRole('button', { name: '규칙 1 삭제' }))
    await user.click(screen.getByRole('button', { name: '통신 정책 저장' }))
    expect(save.mock.calls[1][0]).toHaveLength(1)
    expect(save.mock.calls[1][0][0].peer).toBe('192.0.2.7/32')
  })

  test('clears transport ports when choosing a protocol without ports', async () => {
    const user = userEvent.setup()
    const save = mount({ value: [first] })
    await user.selectOptions(screen.getByLabelText('프로토콜'), 'ICMP')
    expect(screen.getByLabelText('대상 포트')).toHaveValue('')
    expect(screen.getByLabelText('대상 포트')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '통신 정책 저장' }))
    expect(save).toHaveBeenCalledWith([expect.objectContaining({ protocol: 'ICMP', portStart: null, portEnd: null })])
  })

  test('rejects an invalid rule without submitting the valid subset', async () => {
    const user = userEvent.setup()
    const save = mount({ value: [first, { ...second, ports: '99999' }] })
    await user.click(screen.getByRole('button', { name: '통신 정책 저장' }))
    expect(within(screen.getByRole('group', { name: '규칙 2' })).getByRole('alert')).toHaveTextContent('2번째 규칙: 포트 범위는 1–65535')
    expect(save).not.toHaveBeenCalled()
  })

  test.each(['user', 'admin'] as const)('cannot edit or submit without permission on %s surface', (surface) => {
    const save = mount({ value: [first], canEdit: false, surface })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    if (surface === 'user') {
      expect(screen.getByLabelText('출발지 IP/CIDR')).toBeDisabled()
      expect(screen.getByRole('note')).toHaveTextContent('소유자와 편집자')
    } else {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(screen.getByText('192.0.2.7 · 443')).toBeInTheDocument()
    }
    fireEvent.submit(screen.getByRole('form'))
    expect(save).not.toHaveBeenCalled()
  })

  test('bounds user rules independently of immutable system rules', async () => {
    const user = userEvent.setup()
    const value = Array.from({ length: MAX_USER_RULES }, (_, index) => ({ ...first, id: `rule-${index}` }))
    const save = mount({ value, systemRules: [
      { key: 'SSH_GATEWAY', description: 'SSH와 웹 터미널 접속 허용' },
      { key: 'ANTI_SPOOF', description: '주소 위조 차단' },
    ] })
    expect(screen.getByRole('button', { name: '규칙 추가' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '통신 정책 저장' }))
    expect(save.mock.calls[0][0]).toHaveLength(MAX_USER_RULES)
  })

  test('exposes only the protocols accepted by the IPv4 API', () => {
    mount({ value: [first], ipv4Only: true })
    expect(screen.queryByRole('option', { name: 'ICMPv6' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(
      expect.arrayContaining(['전체', 'TCP', 'UDP', 'ICMP']),
    )
  })

  test('blocks submissions while the parent mutation is pending', () => {
    const save = mount({ value: [first], busy: true })
    expect(screen.getByLabelText('출발지 IP/CIDR')).toBeDisabled()
    fireEvent.submit(screen.getByRole('form'))
    expect(save).not.toHaveBeenCalled()
  })

  test('keeps the draft editable but blocks form submission during a conflict', async () => {
    const user = userEvent.setup()
    const save = mount({ value: [first], submitBlocked: true })
    const peer = screen.getByLabelText('출발지 IP/CIDR')
    await user.clear(peer)
    await user.type(peer, '198.51.100.0/24')
    expect(peer).toHaveValue('198.51.100.0/24')
    fireEvent.submit(screen.getByRole('form'))
    expect(save).not.toHaveBeenCalled()
  })
})
