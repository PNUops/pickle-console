import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import { toApiError, type Problem } from '../../api/problem'
import type { components } from '../../api/schema'
import { fetchWorkspaceInvitations, type WorkspaceInvitation, type WorkspaceInvitationEntry, type WorkspaceInvitationResult } from '../../api/queries'
import type { AccessConfirmation } from '../../api/resource-access'
import { useAuth } from '../../auth/auth-context'
import { requestReaderKey } from '../../api/request-review'
import { useActiveResult } from '../../lib/use-active-result'
import { Alert, Badge, Button, FormField, Spinner, Textarea, Table, TBody, TD, TH, THead, TR, useToast, type BadgeVariant } from '../ui'
import { formatDateTime } from '../../lib/format'
import { parseRoster, type RosterRow } from '../../lib/roster'
import { RosterInput, ROSTER_PASTE_HINT } from '../roster/RosterInput'
import { WorkspaceTerminationImpactButton } from './WorkspaceTerminationImpact'
import { WorkspaceTerminationDialog } from './WorkspaceTerminationDialog'

type Schemas = components['schemas']

/* ─── invite members (contract: OWNER of a non-personal workspace) ─── */

/** The server takes at most this many entries per call; a longer list goes in consecutive calls. */
const MAX_INVITE_ENTRIES = 200

/**
 * Entries one owner may send in an hour. Every entry counts, an already
 * invited one included. The server refuses a whole call that would pass the
 * budget, so a longer list stops at the first refused call of
 * MAX_INVITE_ENTRIES and that call's lines and the ones after it stay in
 * the field.
 */
const HOURLY_INVITE_ENTRIES = 500

const INVITATION_OUTCOME_LABELS: Record<Schemas['WorkspaceInvitationOutcome'], string> = {
  ADDED: '구성원으로 추가됨',
  INVITED: '초대함, 가입하면 자동으로 구성원이 됩니다',
  ALREADY_MEMBER: '이미 구성원',
  ALREADY_INVITED: '이미 초대함',
  DUPLICATE_IN_REQUEST: '같은 입력이 두 번 있음',
}

const INVITATION_OUTCOME_VARIANTS: Record<Schemas['WorkspaceInvitationOutcome'], BadgeVariant> = {
  ADDED: 'success',
  INVITED: 'info',
  ALREADY_MEMBER: 'neutral',
  ALREADY_INVITED: 'neutral',
  DUPLICATE_IN_REQUEST: 'warning',
}

// An outcome newer than this build renders its raw value rather than a blank badge.
function outcomeLabel(outcome: string): string {
  return INVITATION_OUTCOME_LABELS[outcome as Schemas['WorkspaceInvitationOutcome']] ?? outcome
}

function outcomeVariant(outcome: string): BadgeVariant {
  return INVITATION_OUTCOME_VARIANTS[outcome as Schemas['WorkspaceInvitationOutcome']] ?? 'neutral'
}

/** One pasted line that names a person, by email or by student number. */
interface InviteLine {
  /** 1-based line number in the textarea, counting blank lines. */
  line: number
  text: string
  entry: WorkspaceInvitationEntry
}

function inviteLinesOf(rows: RosterRow[]): InviteLine[] {
  return rows.map((row) => ({
    line: row.line,
    text: row.email ?? row.studentNo ?? row.raw,
    entry: row.email != null ? { email: row.email } : { studentNo: row.studentNo },
  }))
}

/**
 * The server names a bad entry by its index in the request (`entries[3]`,
 * `entries[3].email`). Blank lines are dropped before sending and a long list
 * goes in several calls, so the index is not the line number the owner sees;
 * this maps it back through the lines of the call that failed.
 */
function lineErrorsOf(problem: Problem | null | undefined, lines: InviteLine[]): string[] {
  const messages: string[] = []
  for (const error of problem?.errors ?? []) {
    const match = /^entries\[(\d+)\]/.exec(error.field)
    const target = match ? lines[Number(match[1])] : undefined
    if (target) messages.push(`${target.line}번째 줄 (${target.text}): ${error.message}`)
  }
  return messages
}

/** The text without the given 1-based lines, and where each kept line now sits. */
function withoutLines(text: string, drop: Set<number>): { text: string; lineOf: Map<number, number> } {
  const kept: string[] = []
  const lineOf = new Map<number, number>()
  text.split(/\r?\n/).forEach((source, index) => {
    if (drop.has(index + 1)) return
    kept.push(source)
    lineOf.set(index + 1, kept.length)
  })
  return { text: kept.join('\n'), lineOf }
}

export function InviteMembersForm({ workspaceId, onInvited, beforeSend, sendEntries, showRosterPreview = true }: {
  workspaceId: string
  onInvited: () => void
  showRosterPreview?: boolean
  beforeSend?: (entries: WorkspaceInvitationEntry[]) => Promise<AccessConfirmation | undefined | null>
  sendEntries?: (entries: WorkspaceInvitationEntry[], confirmation?: AccessConfirmation) => Promise<Schemas['InviteWorkspaceMembersResponse']>
}) {
  const active = useActiveResult()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lineErrors, setLineErrors] = useState<string[]>([])
  const [results, setResults] = useState<WorkspaceInvitationResult[] | null>(null)

  const invite = useMutation({
    // Consecutive calls of at most MAX_INVITE_ENTRIES. The first failure (a 429
    // among them) stops the run; what the earlier calls did has already happened.
    mutationFn: async ({ lines }: { text: string; lines: InviteLine[] }) => {
      const done: WorkspaceInvitationResult[] = []
      for (let start = 0; start < lines.length; start += MAX_INVITE_ENTRIES) {
        const chunk = lines.slice(start, start + MAX_INVITE_ENTRIES)
        const fail = (err: unknown) => ({
          results: done,
          failure: { error: toApiError(err, '구성원을 초대하지 못했습니다.'), sent: start, lines: chunk },
        })
        try {
          if (!active.current) return fail(new Error('변경 대상이 바뀌어 초대를 중단했습니다.'))
          const entries = chunk.map((line) => line.entry)
          const confirmation = beforeSend ? await beforeSend(entries) : undefined
          if (confirmation === null) return fail(new Error('권한 증가 확인을 취소했습니다. 나머지 초대는 보내지 않았습니다.'))
          if (!active.current) return fail(new Error('변경 대상이 바뀌어 초대를 중단했습니다.'))
          if (sendEntries) {
            const data = await sendEntries(entries, confirmation)
            done.push(...data.results)
            continue
          }
          const { data, error: err } = await api.POST('/workspaces/{workspaceId}/invitations', {
            params: { path: { workspaceId } },
            body: { entries, ...(confirmation ? { confirmation } : {}) },
          })
          if (!data) return fail(err)
          done.push(...data.results)
        } catch (err) {
          return fail(err)
        }
      }
      return { results: done, failure: null }
    },
    onSuccess: ({ results: done, failure }, { text: sentText, lines }) => {
      if (done.length > 0) onInvited()
      if (!active.current) return
      if (done.length > 0) setResults(done)
      // Text the owner changed while the run was out is theirs, and stays.
      const edited = text !== sentText
      if (!failure) {
        if (!edited) setText('')
        return
      }
      // A 429 carries the server's own wording (which limit, when to retry), so it is shown as is.
      setError(failure.error.message)
      if (edited) {
        setLineErrors(lineErrorsOf(failure.error.problem, failure.lines))
        return
      }
      // The lines already sent leave the field, so sending again starts where
      // this run stopped instead of spending the hourly budget twice.
      const remaining = withoutLines(sentText, new Set(lines.slice(0, failure.sent).map((line) => line.line)))
      setText(remaining.text)
      setLineErrors(
        lineErrorsOf(
          failure.error.problem,
          failure.lines.map((line) => ({ ...line, line: remaining.lineOf.get(line.line) ?? line.line })),
        ),
      )
    },
    onError: (err) => { if (active.current) setError(toApiError(err, '구성원을 초대하지 못했습니다.').message) },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLineErrors([])
    const rows = parseRoster(text, { allowEmail: true })
    if (rows.length === 0) {
      setError('초대할 사람의 이메일이나 학번을 입력해 주세요.')
      return
    }
    const unreadable = rows.filter((row) => row.error)
    if (unreadable.length > 0) {
      setError('읽지 못한 줄이 있습니다.')
      setLineErrors(
        unreadable.map((row) => `${row.line}번째 줄 (${row.raw.replace(/\s+/g, ' ')}): ${row.error}`),
      )
      return
    }
    setResults(null)
    invite.mutate({ text, lines: inviteLinesOf(rows) })
  }

  const overBudget =
    parseRoster(text, { allowEmail: true }).filter((row) => !row.error).length > HOURLY_INVITE_ENTRIES

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg bg-neutral-50 p-4" noValidate>
      <h3 className="text-sm font-semibold text-neutral-800">구성원 초대</h3>
      {error && (
        <Alert variant="danger">
          {error}
          {lineErrors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {lineErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {showRosterPreview ? <RosterInput
        workspaceId={workspaceId}
        value={text}
        onChange={setText}
        label="이메일 또는 학번"
        required
        allowEmail
        placeholder={'cheolsu.kim@pusan.ac.kr\n202312345'}
      /> : <FormField label="이메일 또는 학번" description={ROSTER_PASTE_HINT} required>
        <Textarea rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder={'cheolsu.kim@pusan.ac.kr\n202312345'} />
      </FormField>}
      {overBudget && (
        <Alert variant="info">
          한 시간에 {HOURLY_INVITE_ENTRIES}명까지 초대할 수 있습니다. 나머지는 한 시간 뒤에 보내 주세요.
        </Alert>
      )}
      <p className="text-xs text-foreground-muted">
        학번은 학생 직책 계정에만 등록되므로 교수, 연구원, 직원은 이메일로 초대해 주세요.
      </p>
      <div className="flex justify-end">
        <Button type="submit" loading={invite.isPending}>
          초대
        </Button>
      </div>
      {results && (
        <section aria-label="초대 결과" className="space-y-2">
          <h4 className="text-sm font-semibold text-neutral-800">초대 결과</h4>
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-surface-card">
            {results.map((result, index) => (
              <li
                key={`${index}-${result.email ?? result.studentNo ?? ''}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="font-medium text-neutral-900">
                  {result.email ?? result.studentNo}
                </span>
                <Badge variant={outcomeVariant(result.outcome)}>{outcomeLabel(result.outcome)}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </form>
  )
}

/* ─── pending invitations (contract: OWNER of a non-personal workspace) ─── */

function invitationTarget(invitation: WorkspaceInvitation): string {
  return invitation.email ?? invitation.studentNo ?? ''
}

export function PendingInvitationsSection({ workspaceId, onChanged, loadInvitations, cancelInvitation, canManage = true, support = false }: {
  workspaceId: string
  onChanged: () => void
  loadInvitations?: () => Promise<WorkspaceInvitation[]>
  cancelInvitation?: (invitationId: string, fingerprint: string) => Promise<void>
  canManage?: boolean
  support?: boolean
}) {
  const { user } = useAuth()
  const active = useActiveResult()
  const toast = useToast()
  const [cancelTarget, setCancelTarget] = useState<WorkspaceInvitation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const invitations = useQuery({
    queryKey: [support ? 'admin-workspace-invitations' : 'workspaces', workspaceId, 'invitations', requestReaderKey(user)],
    queryFn: loadInvitations ?? (() => fetchWorkspaceInvitations(workspaceId)),
  })

  const cancel = useMutation({
    mutationFn: async ({ invitation, fingerprint }: { invitation: WorkspaceInvitation; fingerprint: string }) => {
      if (cancelInvitation) { await cancelInvitation(invitation.id, fingerprint); return invitation }
      const { error: err, response } = await api.DELETE(
        '/workspaces/{workspaceId}/invitations/{invitationId}',
        { params: { path: { workspaceId, invitationId: invitation.id } }, body: { confirmation: { fingerprint, confirmed: true } } },
      )
      if (!response.ok) throw toApiError(err, '초대를 취소하지 못했습니다.')
      return invitation
    },
    onSuccess: (invitation) => {
      onChanged()
      if (!active.current) return
      setCancelTarget(null)
      toast.success(`${invitationTarget(invitation)} 초대를 취소했습니다.`)
    },

  })

  return (
    <section aria-labelledby="pending-invitations-heading" className="space-y-3">
      <h3 id="pending-invitations-heading" className="text-sm font-semibold text-neutral-800">
        대기 중인 초대{invitations.data ? ` (${invitations.data.length}건)` : ''}
      </h3>
      {error && <Alert variant="danger">{error}</Alert>}
      {invitations.isPending && (
        <div className="flex justify-center py-4">
          <Spinner label="대기 중인 초대 불러오는 중" />
        </div>
      )}
      {invitations.isError && <Alert variant="danger">{invitations.error.message}</Alert>}
      {invitations.data && invitations.data.length === 0 && (
        <p className="text-sm text-foreground-muted">대기 중인 초대가 없습니다.</p>
      )}
      {invitations.data && invitations.data.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>이메일 또는 학번</TH>
              <TH>초대한 날</TH>
              <TH>초대한 사람</TH>
              {canManage && <TH>관리</TH>}
            </TR>
          </THead>
          <TBody>
            {invitations.data.map((invitation) => (
              <TR key={invitation.id}>
                <TD className="font-medium text-neutral-900">{invitationTarget(invitation)}</TD>
                <TD>{formatDateTime(invitation.invitedAt)}</TD>
                <TD>{invitation.invitedBy.name}</TD>
                {canManage && <TD>
                  <WorkspaceTerminationImpactButton workspaceId={workspaceId} invitationId={invitation.id} admin={support} targetLabel={invitationTarget(invitation)} />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${invitationTarget(invitation)} 초대 취소`}
                    className="text-danger-600 hover:bg-danger-50 hover:text-danger-700"
                    onClick={() => {
                      setError(null)
                      setCancelTarget(invitation)
                    }}
                  >
                    취소
                  </Button>
                </TD>}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {cancelTarget && <WorkspaceTerminationDialog workspaceId={workspaceId} invitationId={cancelTarget.id} targetLabel={invitationTarget(cancelTarget)} admin={support}
        onClose={() => setCancelTarget(null)} onConfirm={async (fingerprint) => { await cancel.mutateAsync({ invitation: cancelTarget, fingerprint }) }} />}

    </section>
  )
}

