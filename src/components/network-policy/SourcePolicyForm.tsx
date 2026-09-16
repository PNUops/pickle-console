import { useState, type FormEvent } from 'react'
import { Alert, Button, Checkbox, FormField, PermissionNotice, Textarea } from '../ui'
import { parseSourcePolicy, type SourcePolicyDraft, type SourcePolicyValue } from './model'

export interface SourcePolicyFormProps {
  value: SourcePolicyDraft
  onChange: (value: SourcePolicyDraft) => void
  onSubmit: (value: SourcePolicyValue) => void
  /** Use the resource's server-provided permission, including its organisation scope. */
  canEdit: boolean
  surface?: 'user' | 'admin'
  ipv4Only?: boolean
  campusPresetAvailable: boolean
  busy?: boolean
  error?: string
}

export function SourcePolicyForm({
  value, onChange, onSubmit, canEdit, surface = 'user', ipv4Only = false,
  campusPresetAvailable, busy = false, error,
}: SourcePolicyFormProps) {
  const [validation, setValidation] = useState<string>()
  const denyAll = value.cidrsText.trim() === '' && !value.includeCampusPreset
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canEdit || busy) return
    setValidation(undefined)
    if (value.includeCampusPreset && !campusPresetAvailable) {
      setValidation('교내 주소 목록을 사용할 수 없습니다. 직접 주소를 입력해 주세요.')
      return
    }
    try {
      onSubmit(parseSourcePolicy(value, ipv4Only))
    } catch (failure) {
      setValidation(failure instanceof Error ? failure.message : '주소를 확인해 주세요.')
    }
  }

  if (!canEdit && surface === 'admin') {
    return (
      <div className="space-y-2 text-sm text-foreground-secondary">
        <p className="whitespace-pre-wrap break-all">{value.cidrsText.trim() || (denyAll ? '허용 출발지 없음' : '직접 입력한 출발지 없음')}</p>
        {value.includeCampusPreset && <p>교내 주소 허용</p>}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label="공개 접속 정책">
      {error && <Alert variant="danger">{error}</Alert>}
      <FormField label="허용할 출발지" description="IP 또는 CIDR을 한 줄에 하나씩 입력하세요." error={validation}>
        <Textarea
          value={value.cidrsText}
          onChange={(event) => onChange({ ...value, cidrsText: event.target.value })}
          disabled={!canEdit || busy}
          spellCheck={false}
          autoCapitalize="none"
          placeholder={'192.0.2.7\n198.51.100.0/24'}
          rows={5}
        />
      </FormField>
      <Checkbox
        label="교내 주소 허용"
        description={!campusPresetAvailable ? '교내 주소 목록을 사용할 수 없습니다.' : undefined}
        checked={value.includeCampusPreset}
        onChange={(event) => onChange({ ...value, includeCampusPreset: event.target.checked })}
        disabled={!canEdit || busy || !campusPresetAvailable && !value.includeCampusPreset}
      />
      {denyAll && canEdit && <Alert variant="warning">이대로 저장하면 새 연결을 모두 차단합니다.</Alert>}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy}>출발지 정책 저장</Button>
          <p className="text-xs text-foreground-muted">변경은 새 연결부터 적용됩니다.</p>
        </div>
      ) : (
        <PermissionNotice>소유자와 편집자만 변경할 수 있습니다.</PermissionNotice>
      )}
    </form>
  )
}
