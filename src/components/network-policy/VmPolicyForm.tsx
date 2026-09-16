import { useState, type FormEvent } from 'react'
import { Alert, Button, DescriptionList, FormField, Input, PermissionNotice, Select } from '../ui'
import { NetworkSystemRules } from './NetworkPolicyStatus'
import {
  ACTION_LABELS, DIRECTION_LABELS, MAX_USER_RULES, PROTOCOL_LABELS, parseVmRule,
  type RuleAction, type RuleDirection, type RuleProtocol, type VmRuleDraft, type VmRuleValue,
} from './model'

export interface VmPolicyFormProps {
  value: readonly VmRuleDraft[]
  onChange: (value: VmRuleDraft[]) => void
  onSubmit: (value: VmRuleValue[]) => void
  /** Use the resource's server-provided permission, including its organisation scope. */
  canEdit: boolean
  surface?: 'user' | 'admin'
  ipv4Only?: boolean
  systemRules: readonly string[]
  busy?: boolean
  error?: string
}

export function VmPolicyForm({
  value, onChange, onSubmit, canEdit, surface = 'user', ipv4Only = false,
  systemRules, busy = false, error,
}: VmPolicyFormProps) {
  const [ruleErrors, setRuleErrors] = useState<Record<string, string>>({})
  const [validation, setValidation] = useState<string>()
  const disabled = !canEdit || busy
  const readOnlyAdmin = !canEdit && surface === 'admin'
  const update = (id: string, change: Partial<VmRuleDraft>) => {
    if (disabled) return
    onChange(value.map((rule) => rule.id === id ? { ...rule, ...change } : rule))
  }
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (disabled || target < 0 || target >= value.length) return
    const next = [...value]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (disabled) return
    setValidation(undefined)
    setRuleErrors({})
    if (value.length > MAX_USER_RULES) {
      setValidation(`규칙은 ${MAX_USER_RULES}개까지 추가할 수 있습니다.`)
      return
    }
    const next: VmRuleValue[] = []
    const errors: Record<string, string> = {}
    for (const rule of value) {
      try {
        next.push(parseVmRule(rule, ipv4Only))
      } catch (failure) {
        errors[rule.id] = failure instanceof Error ? failure.message : '규칙을 확인해 주세요.'
      }
    }
    setRuleErrors(errors)
    if (Object.keys(errors).length === 0) onSubmit(next)
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label="VM 통신 정책">
      <DescriptionList items={[
        { term: '기본 수신', description: '차단' },
        { term: '기본 송신', description: '허용' },
      ]} />
      <p className="text-xs text-foreground-muted">같은 워크스페이스의 VM도 수신 허용 규칙이 필요합니다.</p>
      <NetworkSystemRules rules={systemRules} />
      {error && <Alert variant="danger">{error}</Alert>}
      {validation && <Alert variant="danger">{validation}</Alert>}
      {value.length === 0 ? (
        <p className="text-sm text-foreground-muted">추가한 규칙이 없습니다.</p>
      ) : (
        <p className="text-xs text-foreground-muted">위에서부터 먼저 일치하는 규칙을 따릅니다.</p>
      )}
      <div className="space-y-3">
        {value.map((rule, index) => readOnlyAdmin ? (
          <div key={rule.id} className="rounded-control border border-stroke-subtle p-3 text-sm text-foreground-secondary">
            <p>{index + 1}. {DIRECTION_LABELS[rule.direction]} {ACTION_LABELS[rule.action]} · {PROTOCOL_LABELS[rule.protocol]}</p>
            <p className="mt-1 break-all font-mono text-xs">{rule.cidr}{rule.ports ? ` · ${rule.ports}` : ''}</p>
          </div>
        ) : (
          <fieldset key={rule.id} disabled={disabled} className="space-y-3 rounded-control border border-stroke-subtle p-3">
            <legend className="px-1 text-sm font-medium text-foreground-secondary">규칙 {index + 1}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="방향">
                <Select value={rule.direction} onChange={(event) => update(rule.id, { direction: event.target.value as RuleDirection })}>
                  <option value="IN">수신</option>
                  <option value="OUT">송신</option>
                </Select>
              </FormField>
              <FormField label="처리">
                <Select value={rule.action} onChange={(event) => update(rule.id, { action: event.target.value as RuleAction })}>
                  <option value="ACCEPT">허용</option>
                  <option value="DROP">차단</option>
                </Select>
              </FormField>
              <FormField label="프로토콜">
                <Select value={rule.protocol} onChange={(event) => {
                  const protocol = event.target.value as RuleProtocol
                  update(rule.id, { protocol, ports: protocol === 'TCP' || protocol === 'UDP' ? rule.ports : '' })
                }}>
                  <option value="ANY">전체</option>
                  <option value="TCP">TCP</option>
                  <option value="UDP">UDP</option>
                  <option value="ICMP">ICMP</option>
                  {!ipv4Only && <option value="ICMPV6">ICMPv6</option>}
                </Select>
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={rule.direction === 'IN' ? '출발지 IP/CIDR' : '목적지 IP/CIDR'} required>
                <Input value={rule.cidr} onChange={(event) => update(rule.id, { cidr: event.target.value })} spellCheck={false} autoCapitalize="none" placeholder="192.0.2.0/24" />
              </FormField>
              <FormField label="대상 포트" description="비워 두면 모든 포트. 예: 443, 8000-8010">
                <Input value={rule.ports} onChange={(event) => update(rule.id, { ports: event.target.value })} disabled={disabled || rule.protocol !== 'TCP' && rule.protocol !== 'UDP'} />
              </FormField>
            </div>
            {ruleErrors[rule.id] && <p role="alert" className="text-sm text-danger-600">{ruleErrors[rule.id]}</p>}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`규칙 ${index + 1} 위로 이동`}>위로</Button>
                <Button variant="secondary" size="sm" disabled={busy || index === value.length - 1} onClick={() => move(index, 1)} aria-label={`규칙 ${index + 1} 아래로 이동`}>아래로</Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => onChange(value.filter((item) => item.id !== rule.id))} aria-label={`규칙 ${index + 1} 삭제`}>삭제</Button>
              </div>
            )}
          </fieldset>
        ))}
      </div>
      {canEdit ? (
        <div className="space-y-3">
          <Button variant="secondary" disabled={busy || value.length >= MAX_USER_RULES} onClick={() => {
            if (disabled || value.length >= MAX_USER_RULES) return
            onChange([...value, { id: crypto.randomUUID(), direction: 'IN', action: 'ACCEPT', protocol: 'TCP', cidr: '', ports: '' }])
          }}>규칙 추가</Button>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy}>통신 정책 저장</Button>
            <p className="text-xs text-foreground-muted">변경은 새 연결부터 적용됩니다.</p>
          </div>
        </div>
      ) : surface === 'user' ? (
        <PermissionNotice>소유자와 편집자만 변경할 수 있습니다.</PermissionNotice>
      ) : null}
    </form>
  )
}
