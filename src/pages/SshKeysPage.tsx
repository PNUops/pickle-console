import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteMySshKey,
  downloadMySshKeyPrivateKey,
  fetchMySshKeys,
  generateMySshKey,
  registerMySshKey,
  type SshKeyView,
} from '../api/queries'
import { toApiError } from '../api/problem'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Modal,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
} from '../components/ui'
import { CopyButton } from '../components/CopyButton'
import { SshUsageGuide } from '../components/SshUsageGuide'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatDateTime } from '../lib/format'

/** 서버 생성 키의 개인키를 내려받아 파일로 저장한다 (매 다운로드 감사 기록). */
async function savePrivateKey(keyId: number): Promise<void> {
  const res = await downloadMySshKeyPrivateKey(keyId)
  const blob = new Blob([res.privateKey], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = res.fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function SshKeysPage() {
  const keys = useQuery({ queryKey: ['me', 'ssh-keys'], queryFn: fetchMySshKeys })
  const [registerOpen, setRegisterOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SshKeyView | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">SSH 키</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          등록한 SSH 키로{' '}
          <span className="font-mono text-neutral-700">ssh &lt;VM 호스트명&gt;@ssh…</span>{' '}
          형식으로 접속합니다. 키가 하나도 없으면 SSH 접속이 불가합니다(비밀번호
          접속은 VM별로 허용된 경우에만 가능).
        </p>
      </div>

      {keys.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="SSH 키 불러오는 중" />
        </div>
      )}
      {keys.isError && <Alert variant="danger">{keys.error.message}</Alert>}

      {keys.isSuccess && keys.data.length === 0 && (
        <EmptyState
          onGenerate={() => setGenerateOpen(true)}
          onRegister={() => setRegisterOpen(true)}
        />
      )}

      {keys.isSuccess && keys.data.length > 0 && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>등록된 키 ({keys.data.length}/10)</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setGenerateOpen(true)}>
                키 만들기
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRegisterOpen(true)}>
                공개키 등록
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <KeyTable keys={keys.data} onDelete={setDeleteTarget} />
          </CardContent>
        </Card>
      )}

      {keys.isSuccess && (
        <Card>
          <CardHeader>
            <CardTitle>접속 방법</CardTitle>
          </CardHeader>
          <CardContent>
            <SshUsageGuide />
          </CardContent>
        </Card>
      )}

      {registerOpen && <RegisterKeyModal onClose={() => setRegisterOpen(false)} />}
      {generateOpen && <GenerateKeyModal onClose={() => setGenerateOpen(false)} />}
      {deleteTarget && (
        <DeleteKeyModal keyItem={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  )
}

function EmptyState({
  onGenerate,
  onRegister,
}: {
  onGenerate: () => void
  onRegister: () => void
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div>
          <p className="text-base font-semibold text-neutral-900">
            등록된 SSH 키가 없습니다
          </p>
          <p className="mt-1 max-w-md text-sm text-neutral-500">
            SSH 키를 등록해야 VM에 접속할 수 있습니다. 피클에서 새 키를 만들거나,
            이미 가지고 있는 공개키를 등록하세요.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onGenerate}>키 만들기</Button>
          <Button variant="secondary" onClick={onRegister}>
            기존 공개키 등록
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AlgorithmBadge({ algorithm }: { algorithm: SshKeyView['algorithm'] }) {
  return (
    <Badge variant={algorithm === 'ED25519' ? 'primary' : 'neutral'}>{algorithm}</Badge>
  )
}

function KeyTable({
  keys,
  onDelete,
}: {
  keys: SshKeyView[]
  onDelete: (key: SshKeyView) => void
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>이름</TH>
          <TH>알고리즘</TH>
          <TH>지문</TH>
          <TH>등록일</TH>
          <TH>마지막 사용</TH>
          <TH>
            <span className="sr-only">작업</span>
          </TH>
        </TR>
      </THead>
      <TBody>
        {keys.map((key) => (
          <TR key={key.id}>
            <TD className="font-medium text-neutral-900">{key.name}</TD>
            <TD>
              <AlgorithmBadge algorithm={key.algorithm} />
            </TD>
            <TD>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs break-all text-neutral-600">
                  {key.fingerprint}
                </span>
                <CopyButton value={key.fingerprint} label="복사" />
              </div>
            </TD>
            <TD className="whitespace-nowrap text-sm text-neutral-600">
              {formatDateTime(key.createdAt)}
            </TD>
            <TD className="whitespace-nowrap text-sm text-neutral-600">
              {key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '사용 기록 없음'}
            </TD>
            <TD className="text-right whitespace-nowrap">
              <div className="flex justify-end gap-2">
                {key.privateKeyStored && <DownloadKeyButton keyId={key.id} />}
                <Button variant="ghost" size="sm" onClick={() => onDelete(key)}>
                  삭제
                </Button>
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}

/** 목록 행의 개인키 재다운로드 버튼 (서버 생성 키만 노출). */
function DownloadKeyButton({ keyId }: { keyId: number }) {
  const toast = useToast()
  const download = useMutation({
    mutationFn: () => savePrivateKey(keyId),
    onSuccess: () => toast.success('개인키를 내려받았습니다. 다운로드는 감사 기록됩니다.'),
    onError: (err) =>
      toast.error(toApiError(err, '개인키를 다운로드하지 못했습니다.').message),
  })
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={download.isPending}
      onClick={() => download.mutate()}
      title="다운로드는 감사 기록됩니다"
    >
      개인키 다운로드
    </Button>
  )
}

/* ─── 공개키 붙여넣기 등록 ─── */

function RegisterKeyModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const register = useMutation({
    mutationFn: () => registerMySshKey({ name: name.trim(), publicKey: publicKey.trim() }),
    onSuccess: async (key) => {
      await queryClient.invalidateQueries({ queryKey: ['me', 'ssh-keys'] })
      toast.success(`'${key.name}' 키를 등록했습니다.`)
      onClose()
    },
    onError: (err) => {
      const apiError = toApiError(err, 'SSH 키를 등록하지 못했습니다.')
      const fields = fieldErrorsOf(apiError.problem)
      setFieldErrors(fields)
      // 필드 오류(422)가 아니면 상단 Alert로 표시 (409 중복·상한 등).
      setError(Object.keys(fields).length > 0 ? null : apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    register.mutate()
  }

  return (
    <Modal open onClose={onClose} title="공개키 등록">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-neutral-600">
          보유한 SSH <strong>공개키</strong>를 붙여넣어 등록합니다. ed25519 키를
          권장합니다.
        </p>
        {error && <Alert variant="danger">{error}</Alert>}
        <FormField label="이름" required error={fieldErrors.name}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 연구실 노트북"
            maxLength={100}
          />
        </FormField>
        <FormField label="공개키" required error={fieldErrors.publicKey}>
          <Textarea
            rows={4}
            className="font-mono text-xs"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="ssh-ed25519 AAAA… user@host"
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" loading={register.isPending}>
            등록
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ─── 키 만들기 (서버 생성) ─── */

function GenerateKeyModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<SshKeyView | null>(null)

  const generate = useMutation({
    mutationFn: () => generateMySshKey({ name: name.trim() }),
    onSuccess: async (key) => {
      await queryClient.invalidateQueries({ queryKey: ['me', 'ssh-keys'] })
      setCreated(key)
    },
    onError: (err) => {
      const apiError = toApiError(err, 'SSH 키를 만들지 못했습니다.')
      const fields = fieldErrorsOf(apiError.problem)
      setFieldErrors(fields)
      setError(Object.keys(fields).length > 0 ? null : apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    generate.mutate()
  }

  return (
    <Modal open onClose={onClose} title="키 만들기">
      {created ? (
        <GeneratedKeyResult keyItem={created} onClose={onClose} />
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-neutral-600">
            피클이 ed25519 키쌍을 만들어 등록합니다. 개인키는 이 페이지에서 언제든
            다시 내려받을 수 있습니다.
          </p>
          {error && <Alert variant="danger">{error}</Alert>}
          <FormField label="이름" required error={fieldErrors.name}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 피클에서 만든 키"
              maxLength={100}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" loading={generate.isPending}>
              키 만들기
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function GeneratedKeyResult({
  keyItem,
  onClose,
}: {
  keyItem: SshKeyView
  onClose: () => void
}) {
  const toast = useToast()
  const download = useMutation({
    mutationFn: () => savePrivateKey(keyItem.id),
    onSuccess: () => toast.success('개인키를 내려받았습니다. 다운로드는 감사 기록됩니다.'),
    onError: (err) =>
      toast.error(toApiError(err, '개인키를 다운로드하지 못했습니다.').message),
  })

  return (
    <div className="space-y-4">
      <Alert variant="success" title="키를 만들었습니다">
        '{keyItem.name}' 키가 등록되었습니다. 아래에서 개인키를 내려받으세요.
      </Alert>
      <div>
        <p className="text-xs font-medium text-neutral-500">지문</p>
        <p className="mt-0.5 font-mono text-xs break-all text-neutral-800">
          {keyItem.fingerprint}
        </p>
      </div>
      <Button loading={download.isPending} onClick={() => download.mutate()}>
        개인키 다운로드
      </Button>
      <Alert variant="info">
        개인키는 언제든 이 페이지에서 다시 받을 수 있으며, 매 다운로드가 기록됩니다.
      </Alert>
      <div className="border-t border-neutral-100 pt-4">
        <SshUsageGuide />
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>
  )
}

/* ─── 삭제 (일반 확인 모달) ─── */

function DeleteKeyModal({
  keyItem,
  onClose,
}: {
  keyItem: SshKeyView
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)

  const remove = useMutation({
    mutationFn: () => deleteMySshKey(keyItem.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me', 'ssh-keys'] })
      toast.success(`'${keyItem.name}' 키를 삭제했습니다.`)
      onClose()
    },
    onError: (err) => setError(toApiError(err, 'SSH 키를 삭제하지 못했습니다.').message),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="SSH 키 삭제"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            삭제
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert variant="danger">{error}</Alert>}
        <Alert variant="danger">
          삭제 즉시 이 키로는 어떤 VM에도 접속할 수 없습니다.
        </Alert>
        <p className="text-sm text-neutral-600">
          '{keyItem.name}' 키를 삭제하시겠습니까? 서버가 보관 중인 개인키(생성 키)도
          함께 파기됩니다.
        </p>
      </div>
    </Modal>
  )
}
