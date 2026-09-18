import { useState, type FormEvent } from 'react'
import { Alert, Button, FormField, PermissionNotice, Textarea } from '../ui'
import {
  appendCampusPreset,
  parseSourcePolicy,
  type SourcePolicyDraft,
  type SourcePolicyValue,
} from './model'

export interface SourcePolicyFormProps {
  value: SourcePolicyDraft
  onChange: (value: SourcePolicyDraft) => void
  onSubmit: (value: SourcePolicyValue) => void
  /** Use the resource's server-provided permission, including its organisation scope. */
  canEdit: boolean
  surface?: 'user' | 'admin'
  ipv4Only?: boolean
  /** Null means the server has no confirmed campus preset. */
  campusPresetCidrs: readonly string[] | null
  busy?: boolean
  submitBlocked?: boolean
  error?: string
}

export function SourcePolicyForm({
  value, onChange, onSubmit, canEdit, surface = 'user', ipv4Only = false,
  campusPresetCidrs, busy = false, submitBlocked = false, error,
}: SourcePolicyFormProps) {
  const [validation, setValidation] = useState<string>()
  const denyAll = value.cidrsText.trim() === ''
  const permitsPublicSources = value.cidrsText.split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === '0.0.0.0/0' || line === '::/0')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canEdit || busy || submitBlocked) return
    setValidation(undefined)
    try {
      onSubmit(parseSourcePolicy(value, ipv4Only))
    } catch (failure) {
      setValidation(failure instanceof Error ? failure.message : '주소를 확인해 주세요.')
    }
  }

  if (!canEdit && surface === 'admin') {
    return (
      <div className="space-y-2 text-sm text-foreground-secondary">
        <p className="whitespace-pre-wrap break-all">{value.cidrsText.trim() || '허용 출발지 없음'}</p>
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
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!canEdit || busy || campusPresetCidrs == null}
          onClick={() => {
            if (campusPresetCidrs == null) return
            setValidation(undefined)
            try {
              onChange(appendCampusPreset(value, campusPresetCidrs, ipv4Only))
            } catch (failure) {
              setValidation(failure instanceof Error ? failure.message : '교내 주소 목록을 확인해 주세요.')
            }
          }}
        >
          교내 주소 목록 추가
        </Button>
        <p className="text-xs text-foreground-muted">
          {campusPresetCidrs == null
            ? '확인된 교내 주소 목록이 없어 선택할 수 없습니다.'
            : '현재 교내 주소를 입력 목록에 복사합니다. 이후 변경은 자동 반영되지 않습니다.'}
        </p>
      </div>
      {denyAll && canEdit && <Alert variant="warning">이대로 저장하면 새 연결을 모두 차단합니다.</Alert>}
      {permitsPublicSources && canEdit && (
        <Alert variant="warning">
          0.0.0.0/0 또는 ::/0은 해당 주소 종류의 모든 출발지를 허용합니다.
        </Alert>
      )}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy} disabled={submitBlocked}>출발지 정책 저장</Button>
          <p className="text-xs text-foreground-muted">변경은 새 연결부터 적용됩니다.</p>
        </div>
      ) : (
        <PermissionNotice>소유자와 편집자만 변경할 수 있습니다.</PermissionNotice>
      )}
    </form>
  )
}
