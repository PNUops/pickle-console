import { useEffect, useState } from 'react'
import { Alert, Button, Card, Spinner } from '../ui'

interface Props {
  enabled: boolean | undefined
  loading: boolean
  saving: boolean
  error?: string | null
  message?: string | null
  onSave: (enabled: boolean) => void
  onRetry: () => void
  onEdited?: () => void
}

export function UsageMailPreferenceCard({ enabled, loading, saving, error, message, onSave, onRetry, onEdited }: Props) {
  const [draft, setDraft] = useState(enabled)
  useEffect(() => { setDraft(enabled) }, [enabled])
  return <Card className="space-y-3 p-4">
    <h2 className="font-semibold text-neutral-900">사용량 알림 메일</h2>
    <p className="text-sm text-neutral-600">기본은 켬입니다. 끄면 이 계정의 새 사용량 도달 메일만 받지 않습니다. 콘솔 알림과 신청, 승인, 보안 메일은 유지됩니다.</p>
    {loading && enabled == null && <Spinner label="메일 설정 불러오는 중" />}
    {error && <Alert variant="danger">{error}</Alert>}
    {error && <Button variant="secondary" onClick={onRetry}>메일 설정 다시 조회</Button>}
    {enabled != null && <form className="flex flex-wrap items-center justify-between gap-3" onSubmit={(event) => {
      event.preventDefault()
      if (draft != null && draft !== enabled && !saving) onSave(draft)
    }}>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-900">
        <input type="checkbox" checked={draft ?? enabled} disabled={saving}
          onChange={(event) => { setDraft(event.target.checked); onEdited?.() }} className="size-4 accent-primary-600" />
        사용량 알림 메일 받기
      </label>
      <Button type="submit" loading={saving} disabled={draft == null || draft === enabled}>메일 설정 저장</Button>
    </form>}
    {message && <Alert variant="success">{message}</Alert>}
    <p className="text-xs text-neutral-500">서버 관측에 따라 80% 도달은 콘솔로 안내합니다. 100% 도달은 이 설정이 켜져 있을 때 메일도 보냅니다. 관측과 메일 대기로 늦어질 수 있습니다.</p>
  </Card>
}
