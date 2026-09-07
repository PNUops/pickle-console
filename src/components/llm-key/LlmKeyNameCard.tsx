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
  FormField,
  Input,
  PermissionNotice,
} from '../ui'

/**
 * The key's name, on its own.
 *
 * It used to share a 「키 설정」 card with the recording switch. The two have
 * nothing to do with each other, and the card's title named nothing the tab
 * had not already said, so each setting gets its own card and its own save.
 */
export function LlmKeyNameCard({ llmKey }: { llmKey: LlmKeyDetail }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(llmKey.name)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // 편집은 편집자 등급부터다 (서버와 같은 기준).
  const allowed = llmKey.myResourceRole === 'OWNER' || llmKey.myResourceRole === 'EDITOR'

  // 서버 값이 갱신되면(다른 탭의 변경, 발급 후 재조회) 폼도 그 값을 따라간다.
  useEffect(() => {
    setName(llmKey.name)
  }, [llmKey.name])

  // 서버가 다듬어 저장하므로 화면도 같은 값으로 비교한다 — 공백만 덧붙인 편집을
  // 변경으로 보면 저장 후 돌아온 값이 그대로라 폼이 미저장 상태에 갇힌다.
  const trimmed = name.trim()

  const save = useMutation({
    mutationFn: () => updateLlmKey(llmKey.id, { name: trimmed }),
    onSuccess: async () => {
      setError(null)
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: ['llm-keys', llmKey.id] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => {
      setSaved(false)
      setError(toApiError(err, '이름을 바꾸지 못했습니다.').message)
    },
  })

  const dirty = trimmed !== llmKey.name
  // 이름은 지울 수 없다 (계약이 1자 이상을 요구한다). 서버가 422로 막기 전에
  // 여기서 말해 준다 — 눌러야만 아는 거절을 만들지 않는다.
  const nameError = trimmed === '' ? '키 이름은 비워 둘 수 없습니다.' : undefined

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!dirty || nameError) return
    setSaved(false)
    save.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>이름</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}
        {saved && !dirty && <Alert variant="success">이름을 바꿨습니다.</Alert>}
        <form onSubmit={submit} className="space-y-4">
          <FormField label="이름" className="max-w-md" error={nameError}>
            <Input
              value={name}
              maxLength={100}
              disabled={!allowed}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
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
            이름 변경은 편집자 이상 등급을 받은 사람만 할 수 있습니다.
          </PermissionNotice>
        )}
      </CardContent>
    </Card>
  )
}
