import { useEffect, useState, type FormEvent } from 'react'
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
  Checkbox,
  FormField,
  Input,
  PermissionNotice,
  Textarea,
} from '../ui'

/** 이름·용도·본문 기록을 고치는 폼. */
export function LlmKeySettingsCard({ llmKey }: { llmKey: LlmKeyDetail }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(llmKey.name)
  const [purpose, setPurpose] = useState(llmKey.purpose ?? '')
  const [recordBodies, setRecordBodies] = useState(llmKey.recordBodies)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // 편집은 편집자 등급부터다 (서버와 같은 기준).
  const allowed = llmKey.myResourceRole === 'OWNER' || llmKey.myResourceRole === 'EDITOR'

  // 서버 값이 갱신되면(다른 탭의 변경, 발급 후 재조회) 폼도 그 값을 따라간다.
  useEffect(() => {
    setName(llmKey.name)
    setPurpose(llmKey.purpose ?? '')
    setRecordBodies(llmKey.recordBodies)
  }, [llmKey.name, llmKey.purpose, llmKey.recordBodies])

  // 서버는 두 문자열을 모두 다듬어 저장한다. 화면도 같은 값으로 비교해야
  // "바뀐 것"의 정의가 양쪽에서 같아진다 — 공백만 덧붙인 편집을 변경으로 보면
  // 저장 후 돌아온 값이 그대로라 폼이 영원히 미저장 상태에 갇힌다.
  const trimmedName = name.trim()
  const trimmedPurpose = purpose.trim()

  const save = useMutation({
    // 바뀐 항목만 보낸다 — 생략한 항목을 서버가 그대로 두는 것이 계약이라,
    // 전부 보내면 다른 사람이 방금 바꾼 값을 되돌리게 된다.
    mutationFn: () =>
      updateLlmKey(llmKey.id, {
        ...(trimmedName === llmKey.name ? {} : { name: trimmedName }),
        // 빈 문자열은 용도를 지우는 방법이고, 항목을 빼는 것은 그대로 두는 방법이다.
        ...(trimmedPurpose === (llmKey.purpose ?? '') ? {} : { purpose: trimmedPurpose }),
        ...(recordBodies === llmKey.recordBodies ? {} : { recordBodies }),
      }),
    onSuccess: async () => {
      setError(null)
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: ['llm-keys', llmKey.id] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => {
      setSaved(false)
      setError(toApiError(err, 'LLM API 키를 수정하지 못했습니다.').message)
    },
  })

  const dirty =
    trimmedName !== llmKey.name ||
    trimmedPurpose !== (llmKey.purpose ?? '') ||
    recordBodies !== llmKey.recordBodies
  // 이름은 지울 수 없다 (계약이 1자 이상을 요구한다). 서버가 422로 막기 전에
  // 여기서 말해 준다 — 눌러야만 아는 거절을 만들지 않는다.
  const nameError = trimmedName === '' ? '키 이름은 비워 둘 수 없습니다.' : undefined

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!dirty || nameError) return
    setSaved(false)
    save.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>키 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}
        {saved && !dirty && <Alert variant="success">설정을 저장했습니다.</Alert>}
        <form onSubmit={submit} className="space-y-4">
          <FormField label="이름" className="max-w-md" error={nameError}>
            <Input
              value={name}
              maxLength={100}
              disabled={!allowed}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField
            label="용도"
            className="max-w-md"
            description="목록에서 키를 구별하는 데 쓰입니다."
          >
            <Textarea
              rows={2}
              value={purpose}
              maxLength={2000}
              disabled={!allowed}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </FormField>
          {/* 켜기 전에 셋을 말한다. 무엇이 보관되는지, 접근 권한자 전원이 읽는다는
              것, 30일이라는 것. 가운데가 지시문의 이유이므로 이유가 먼저 온다.
              읽는 단위가 사람이 아니라 키인 것은 편의가 아니라 구조다 —
              게이트웨이는 키를 인증할 뿐 보낸 사람을 모른다. */}
          <Checkbox
            className="max-w-md"
            label="본문 기록"
            description="켜면 이 키로 보낸 프롬프트와 응답을 30일 동안 보관합니다. 이 키에 접근 권한이 있는 사람은 모두 그 내용을 읽을 수 있으므로, 개인정보가 담기는 요청에는 켜지 마세요."
            checked={recordBodies}
            disabled={!allowed}
            onChange={(event) => setRecordBodies(event.target.checked)}
          />
          <Button
            type="submit"
            loading={save.isPending}
            disabled={!allowed || !dirty || Boolean(nameError)}
          >
            저장
          </Button>
        </form>
        {!allowed && (
          <PermissionNotice>
            키 설정 변경은 편집자 이상 등급을 받은 사람만 할 수 있습니다.
          </PermissionNotice>
        )}
      </CardContent>
    </Card>
  )
}
