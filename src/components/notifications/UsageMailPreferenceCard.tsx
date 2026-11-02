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
    <p className="text-sm text-neutral-600">키 한도를 모두 사용하면 메일로 알려드려요. 꺼도 알림함에서는 확인할 수 있어요.</p>
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
  </Card>
}
