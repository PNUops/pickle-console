import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateResourceLists, updateLlmKey, type LlmKeyDetail } from '../../api/queries'
import { toApiError } from '../../api/problem'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  PermissionNotice,
  SettingRow,
} from '../ui'

/**
 * The recording switch, on its own card and with its own decision point.
 *
 * Turning it on is asked for before it happens, the way a VM asks before
 * password SSH goes on: what gets kept, that everyone with access to the key
 * reads it, and for how long.
 *
 * **Those two facts live in the confirm modal and nowhere else on this tab.**
 * The row states neither, because the row is read by anyone who opens 설정 —
 * including an editor who never turned it on — and the register of where a
 * user is told the readership scope has exactly two entries: this modal and
 * the standing line under the records list. A third carrier here would make
 * that register wrong, which matters while there is no privacy policy.
 *
 * Turning it off needs no question, but the row says what it does and does not
 * do while recording is still on, which is when a reader is deciding. In the
 * off state that line is gone: the 개요 property row is what then points at
 * the records already kept, and the two states cannot be on screen together.
 */
export function LlmKeyBodyRecordCard({ llmKey }: { llmKey: LlmKeyDetail }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 편집은 편집자 등급부터다 (서버와 같은 기준).
  const allowed = llmKey.myResourceRole === 'OWNER' || llmKey.myResourceRole === 'EDITOR'

  const save = useMutation({
    mutationFn: (recordBodies: boolean) => updateLlmKey(llmKey.id, { recordBodies }),
    onSuccess: async () => {
      setConfirming(false)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['llm-keys', llmKey.id] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => {
      setConfirming(false)
      setError(toApiError(err, '본문 기록 설정을 바꾸지 못했습니다.').message)
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>본문 기록</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert variant="danger">{error}</Alert>}
        <SettingRow
          label={llmKey.recordBodies ? '켜짐' : '꺼짐'}
          description={
            llmKey.recordBodies
              ? '이 키로 보낸 프롬프트와 응답을 보관합니다.'
              : '새 요청은 기록되지 않습니다.'
          }
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={!allowed}
              loading={save.isPending && !confirming}
              onClick={() => {
                setError(null)
                if (llmKey.recordBodies) {
                  save.mutate(false)
                  return
                }
                setConfirming(true)
              }}
            >
              {llmKey.recordBodies ? '끄기' : '켜기'}
            </Button>
          }
          note={
            llmKey.recordBodies
              ? '끄면 새 요청만 기록되지 않고, 이미 기록된 본문은 보관 기간까지 남습니다.'
              : undefined
          }
        />
        {!allowed && (
          <PermissionNotice>
            본문 기록은 편집자 이상 등급을 받은 사람만 켜고 끌 수 있습니다.
          </PermissionNotice>
        )}

        {/* 켜기 전에 셋을 말한다. 무엇이 보관되는지, 접근 권한자 전원이 읽는다는
            것, 30일이라는 것. 가운데가 지시문의 이유이므로 이유가 먼저 온다.
            읽는 단위가 사람이 아니라 키인 것은 편의가 아니라 구조다 —
            게이트웨이는 키를 인증할 뿐 보낸 사람을 모른다. */}
        <Modal
          open={confirming}
          onClose={() => setConfirming(false)}
          title="본문 기록 켜기"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                돌아가기
              </Button>
              <Button loading={save.isPending} onClick={() => save.mutate(true)}>
                켜기
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Alert variant="warning">
              이 키에 접근 권한이 있는 사람은 모두 기록된 프롬프트와 응답을 읽을 수
              있습니다. 개인정보가 담기는 요청에는 켜지 마세요.
            </Alert>
            <p className="text-sm text-neutral-600">
              켜면 이 키로 보낸 프롬프트와 응답을 30일 동안 보관합니다.
            </p>
          </div>
        </Modal>
      </CardContent>
    </Card>
  )
}
