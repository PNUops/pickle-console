import { useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toApiError } from '../../api/problem'
import { parseRoster } from '../../lib/roster'
import {
  Alert,
  Badge,
  Button,
  DataTable,
  FormField,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from '../ui'
import {
  resolveRosterRows,
  rosterStatusLabel,
  rosterSummary,
  ROSTER_STATUS_VARIANTS,
  type RosterEntry,
} from './roster-entries'

export const ROSTER_PASTE_HINT = '한 줄에 한 명씩, 엑셀에서 복사한 행을 그대로 붙여넣어도 됩니다.'

/**
 * A pasted roster and its per-line preview. The text is the parent's, so the
 * parent can clear it once it has acted; a preview belongs to the exact text
 * it was made from and disappears as soon as the text changes.
 */
export function RosterInput({
  workspaceId,
  orgId,
  value,
  onChange,
  label,
  description = ROSTER_PASTE_HINT,
  placeholder,
  required,
  allowEmail = false,
  children,
}: {
  workspaceId: string
  /** The organisation an approver files for; absent for a workspace owner. */
  orgId?: string | null
  value: string
  onChange: (next: string) => void
  label: string
  description?: string
  placeholder?: string
  required?: boolean
  /** Whether a line holding an email names a person here; otherwise it is listed and left out. */
  allowEmail?: boolean
  /** What to do with a preview, rendered under its table. */
  children?: (entries: RosterEntry[]) => ReactNode
}) {
  const [preview, setPreview] = useState<{ text: string; entries: RosterEntry[] } | null>(null)
  const [failure, setFailure] = useState<{ text: string; message: string } | null>(null)

  const resolve = useMutation({
    mutationFn: (text: string) => resolveRosterRows(workspaceId, parseRoster(text, { allowEmail }), orgId),
    onSuccess: (entries, text) => setPreview({ text, entries }),
    // A 429 carries the server's own wording (which limit, when to retry), so it is shown as is.
    onError: (err, text) =>
      setFailure({ text, message: toApiError(err, '명단을 확인하지 못했습니다.').message }),
  })

  const shown = preview?.text === value ? preview.entries : null
  const error = failure?.text === value ? failure.message : null
  const runPreview = () => {
    setPreview(null)
    setFailure(null)
    if (parseRoster(value, { allowEmail }).length === 0) {
      setFailure({ text: value, message: '명단을 붙여넣어 주세요.' })
      return
    }
    resolve.mutate(value)
  }

  return (
    <div className="space-y-3">
      <FormField label={label} description={description} required={required}>
        <Textarea
          rows={6}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </FormField>
      <div className="flex justify-end">
        <Button type="button" variant="secondary" loading={resolve.isPending} onClick={runPreview}>
          미리보기
        </Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <p role="status" aria-live="polite" className="text-sm text-foreground-secondary">
        {shown ? rosterSummary(shown) : ''}
      </p>
      {shown && (
        <>
          <DataTable caption="명단 미리보기" containerClassName="max-h-96 overflow-y-auto">
            <THead>
              <TR>
                <TH>줄</TH>
                <TH>{allowEmail ? '이메일 또는 학번' : '학번'}</TH>
                <TH>출석부 이름</TH>
                <TH>계정 이름</TH>
                <TH>상태</TH>
              </TR>
            </THead>
            <TBody>
              {shown.map((entry) => (
                <TR key={entry.row.line}>
                  <TD>{entry.row.line}</TD>
                  <TD>
                    {entry.row.studentNo ?? entry.row.email ?? (
                      <span className="text-foreground-muted">{entry.row.raw}</span>
                    )}
                  </TD>
                  <TD>{entry.row.name ?? '—'}</TD>
                  <TD>{entry.resolution?.name ?? '—'}</TD>
                  <TD>
                    <Badge variant={ROSTER_STATUS_VARIANTS[entry.status] ?? 'neutral'}>
                      {rosterStatusLabel(entry.status)}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
          {children?.(shown)}
        </>
      )}
    </div>
  )
}
