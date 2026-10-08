import { useId, useState } from 'react'
import { Alert, Button } from '../ui'
import { RosterInput } from '../roster/RosterInput'
import { rosterCandidates, type RecipientCandidate } from './recipients'

/**
 * A pasted roster turned into recipients: the people it names join the
 * picker already chosen, so inviting them and reserving their resources is
 * one request.
 */
export function RosterRecipients({
  workspaceId,
  orgId,
  onAdd,
}: {
  workspaceId: string
  /** The organisation an approver files for; absent for a workspace owner. */
  orgId: string | null
  /** Returns why the roster was not added, or null once it was. */
  onAdd: (candidates: RecipientCandidate[]) => string | null
}) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  // Tied to the text it was raised for, like the preview it sits under.
  const [refusal, setRefusal] = useState<{ text: string; message: string } | null>(null)

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
      >
        명단 붙여넣기
      </Button>
      {open && (
        <div id={panelId} className="rounded-lg bg-neutral-50 p-4">
          <RosterInput
            workspaceId={workspaceId}
            orgId={orgId}
            value={text}
            onChange={setText}
            label="명단"
            placeholder={'1\t정보컴퓨터공학부\t202312345\t김철수\t3'}
          >
            {(entries) => {
              const { candidates, excluded } = rosterCandidates(entries)
              return (
                <div className="space-y-3">
                  {refusal?.text === text && <Alert variant="danger">{refusal.message}</Alert>}
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {excluded > 0 && (
                      <span className="text-sm text-foreground-muted">{excluded}줄 제외</span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      disabled={candidates.length === 0}
                      onClick={() => {
                        const message = onAdd(candidates)
                        if (message) {
                          setRefusal({ text, message })
                          return
                        }
                        setRefusal(null)
                        setText('')
                        setOpen(false)
                      }}
                    >
                      대상자에 추가 ({candidates.length}명)
                    </Button>
                  </div>
                </div>
              )
            }}
          </RosterInput>
        </div>
      )}
    </div>
  )
}
