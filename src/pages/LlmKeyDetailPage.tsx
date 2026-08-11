import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchLlmKey,
  invalidateResourceLists,
  issueLlmKeyToken,
  revokeLlmKey,
  updateLlmKey,
  type LlmKeyDetail,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { CopyButton } from '../components/CopyButton'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmNameModal,
  FormField,
  Input,
  LlmKeyStatusBadge,
  Modal,
  PermissionNotice,
  Spinner,
  Textarea,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { consolePaths } from '../lib/paths'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

/**
 * LLM API 키 하나의 상세 — 드로어가 아니라 라우트다.
 *
 * 발급은 되돌릴 수 없는 한 번짜리 작업이고, 그 화면은 공유 가능한 주소를 가져야
 * 한다(알림·북마크가 가리킬 곳). 목록 맥락을 지키는 것보다 그쪽이 무겁다.
 */
export function LlmKeyDetailPage() {
  const params = useParams()
  const keyId = params.keyId ?? ''
  const idValid = isUuid(keyId)
  const key = useQuery({
    queryKey: ['llm-keys', keyId],
    queryFn: () => fetchLlmKey(keyId),
    // 형식부터 틀린 주소는 서버에 물어볼 것이 없다.
    enabled: idValid,
  })

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to={consolePaths.llmKeys(null)} className="text-primary-700 hover:underline">
          ← 내 LLM API 키
        </Link>
      </nav>

      {!idValid ? (
        <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
      ) : key.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner label="LLM API 키 정보 불러오는 중" />
        </div>
      ) : key.isError ? (
        <Alert variant="danger">{key.error.message}</Alert>
      ) : (
        <KeyDetail llmKey={key.data} />
      )}
    </div>
  )
}

function KeyDetail({ llmKey }: { llmKey: LlmKeyDetail }) {
  const revoked = llmKey.status === 'REVOKED'
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-neutral-900">{llmKey.name}</h1>
            <LlmKeyStatusBadge status={llmKey.status} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {llmKey.workspaceName} 소유
            {llmKey.purpose && <> · {llmKey.purpose}</>}
          </p>
        </div>
      </div>

      <StatusNotice llmKey={llmKey} />
      <IssueSection llmKey={llmKey} />

      <Card>
        <CardHeader>
          <CardTitle>키 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label="키 앞부분">
              {/* 두 키를 구별하려고 두는 값이다. 아직 발급 전이면 존재하지 않는다. */}
              {llmKey.tokenPrefix ? (
                <code className="font-mono text-sm">{llmKey.tokenPrefix}…</code>
              ) : (
                '발급 전'
              )}
            </Field>
            <Field label="마지막 사용">
              {llmKey.lastUsedAt ? formatDateTime(llmKey.lastUsedAt) : '사용 기록 없음'}
            </Field>
            <Field label="만료">
              {llmKey.expiresAt ? formatDateTime(llmKey.expiresAt) : '만료 없음'}
            </Field>
            <Field label="본문 기록">
              {llmKey.recordBodies
                ? '켜짐 — 이 키로 보낸 프롬프트와 응답이 수집됩니다'
                : '꺼짐'}
            </Field>
            <Field label="분당 요청 한도">{limitLabel(llmKey.rpm, '회')}</Field>
            <Field label="분당 토큰 한도">{limitLabel(llmKey.tpm, '토큰')}</Field>
            <Field label="동시 요청 한도">{limitLabel(llmKey.concurrency, '건')}</Field>
            <Field label="생성일">{formatDateTime(llmKey.createdAt)}</Field>
            {llmKey.revokedAt && (
              <Field label="폐기 시각">{formatDateTime(llmKey.revokedAt)}</Field>
            )}
          </dl>
          {/* 사용량 화면은 아직 없다 — api에 조회 엔드포인트가 없어서지 빠뜨린 것이
              아니므로, 있는 것(마지막 사용)만 말하고 없는 탭은 만들지 않는다. */}
          <p className="mt-4 text-xs text-neutral-500">
            사용량 통계는 아직 제공하지 않습니다. 지금은 마지막 사용 시각만 확인할 수 있고,
            게이트웨이가 배치로 보고하므로 최근 호출이 늦게 반영될 수 있습니다.
          </p>
        </CardContent>
      </Card>

      <EditSection llmKey={llmKey} />

      <Card>
        <CardHeader>
          <CardTitle>접근 권한</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-neutral-600">
            이 키에는 접근 목록에 있는 사람만 닿을 수 있습니다. 같은 워크스페이스라도
            목록에 없으면 이름과 상태만 보입니다.
          </p>
          {llmKey.accessManageAllowed ? (
            <Link
              to={consolePaths.llmKeyAccess(llmKey.id)}
              className="inline-flex h-9 items-center rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              접근 권한 관리
            </Link>
          ) : (
            <PermissionNotice>
              접근 권한은 이 키의 소유자 또는 워크스페이스 소유자만 관리할 수 있습니다.
            </PermissionNotice>
          )}
        </CardContent>
      </Card>

      {!revoked && <RevokeSection llmKey={llmKey} />}
    </>
  )
}

/** null 한도는 "무제한"이 아니라 "게이트웨이 기본값"이다 — 계약이 그렇게 말한다. */
function limitLabel(value: number | null | undefined, unit: string): string {
  return value == null ? '게이트웨이 기본값' : `${value}${unit}`
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{children}</dd>
    </div>
  )
}

/**
 * 상태가 지금 무엇을 뜻하는지 한 문장.
 *
 * 발급 전과 폐기는 서로 다른 이야기다 — 하나는 남은 한 걸음, 다른 하나는 끝.
 */
function StatusNotice({ llmKey }: { llmKey: LlmKeyDetail }) {
  if (llmKey.status === 'PENDING') {
    return (
      <Alert variant="info" title="아직 발급되지 않은 키입니다">
        신청은 승인됐지만 비밀은 아직 만들어지지 않았습니다. 발급 전에는 이 키로 보낸 요청이
        하나도 인증되지 않습니다. 아래에서 발급하면 평문이 한 번만 표시됩니다.
      </Alert>
    )
  }
  if (llmKey.status === 'REVOKED') {
    return (
      <Alert variant="warning" title="폐기된 키입니다">
        이 키로 보낸 요청은 게이트웨이에서 거부됩니다. 폐기된 키는 다시 발급할 수 없으니
        필요하면 새로 신청해 주세요. 지금까지의 사용 기록은 남아 있습니다.
      </Alert>
    )
  }
  if (llmKey.status === 'SUSPENDED') {
    return (
      <Alert variant="warning" title="정지된 키입니다">
        관리자가 이 키의 사용을 멈춰 두었습니다. 해제 전까지는 요청이 거부됩니다.
      </Alert>
    )
  }
  if (llmKey.status === 'EXPIRED') {
    return (
      <Alert variant="warning" title="만료된 키입니다">
        사용 기간이 끝나 더 이상 요청을 인증하지 않습니다. 계속 쓰려면 새로 신청해 주세요.
      </Alert>
    )
  }
  return null
}

/* ─── 발급·재발급 ─── */

/**
 * 평문을 만드는 자리.
 *
 * 평문은 뮤테이션 상태에만 존재한다 — 컴포넌트 상태로 옮기지 않고, 결과 모달은
 * `reset()`으로 닫아 그 자리에서 버린다 (릴레이 토큰과 같은 규칙). 서버에는
 * 해시만 남아 다시 조회할 방법이 없으므로, 창을 닫으면 정말로 끝이다.
 */
function IssueSection({ llmKey }: { llmKey: LlmKeyDetail }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rotation = llmKey.status !== 'PENDING'
  const actionLabel = rotation ? '키 재발급' : '키 발급'
  // 발급은 부여받은 권한이다 — 이 키의 접근 목록에서 소유자 등급을 받은 사람만
  // 한다. 워크스페이스 소유자의 상시 권한(폐기·목록 관리)은 여기에 닿지 않으므로
  // accessManageAllowed로 판단하면 눌러야만 아는 403이 된다.
  const allowed = llmKey.myResourceRole === 'OWNER'
  const revoked = llmKey.status === 'REVOKED'

  const issue = useMutation({
    // 평문이 캐시에 남지 않도록 모달을 닫는 즉시 GC 대상이 되게 한다.
    gcTime: 0,
    mutationFn: () => issueLlmKeyToken(llmKey.id),
    onSuccess: async () => {
      setConfirming(false)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['llm-keys', llmKey.id] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => {
      setConfirming(false)
      setError(toApiError(err, 'LLM API 키를 발급하지 못했습니다.').message)
    },
  })

  if (revoked) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{actionLabel}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-neutral-600">
          {rotation
            ? '키 평문은 발급할 때 한 번만 보입니다. 값을 잃어버렸다면 재발급해야 하고, 재발급하는 순간 이전 값은 곧바로 쓸 수 없게 됩니다.'
            : '발급하면 키 평문이 한 번만 표시됩니다. 서버에는 해시만 남아 다시 조회할 수 없습니다.'}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={rotation ? 'secondary' : 'primary'}
            disabled={!allowed}
            onClick={() => {
              setError(null)
              setConfirming(true)
            }}
          >
            {actionLabel}
          </Button>
        </div>
        {!allowed && (
          <PermissionNotice>
            키 발급은 이 키의 접근 목록에서 소유자 등급을 받은 사람만 할 수 있습니다.
          </PermissionNotice>
        )}
        {error && <Alert variant="danger">{error}</Alert>}

        {/* 발급 확인 — 재발급이 무엇을 끊는지는 누르기 전에 말한다. */}
        <Modal
          open={confirming}
          onClose={() => setConfirming(false)}
          title={actionLabel}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                돌아가기
              </Button>
              <Button
                variant={rotation ? 'danger' : 'primary'}
                loading={issue.isPending}
                onClick={() => issue.mutate()}
              >
                {actionLabel}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {rotation && (
              <Alert variant="danger">
                재발급 즉시 이전 키 값이 무효화됩니다. 그 값을 쓰고 있는 코드·배포 설정을
                새 값으로 바꾸기 전까지 요청이 거부됩니다.
              </Alert>
            )}
            <p className="text-sm text-neutral-600">
              새 키의 평문은 이 다음 화면에서 단 한 번만 확인할 수 있으며, 서버에는 해시로만
              저장됩니다.
            </p>
          </div>
        </Modal>

        {/* 발급 결과 — 평문이 존재하는 유일한 화면 */}
        <Modal
          open={issue.isSuccess}
          onClose={() => issue.reset()}
          title="LLM API 키 발급 완료"
          footer={
            <Button variant="secondary" onClick={() => issue.reset()}>
              확인했습니다
            </Button>
          }
        >
          {issue.data && (
            <div className="space-y-3">
              <Alert variant="warning" title="이 키는 다시 볼 수 없습니다">
                창을 닫으면 평문을 다시 확인할 수 없습니다. 서버에는 해시만 저장되므로
                지금 복사해 안전한 곳에 보관해 주세요.
              </Alert>
              <div className="flex items-center justify-between gap-3">
                <code className="overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 font-mono text-xs break-all text-neutral-100">
                  {issue.data.token}
                </code>
                <CopyButton value={issue.data.token} label="복사" />
              </div>
              {issue.data.expiresAt && (
                <p className="text-sm text-neutral-600">
                  만료: {formatDateTime(issue.data.expiresAt)}
                </p>
              )}
            </div>
          )}
        </Modal>
      </CardContent>
    </Card>
  )
}

/* ─── 이름·용도·본문 기록 ─── */

function EditSection({ llmKey }: { llmKey: LlmKeyDetail }) {
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

  const save = useMutation({
    // 바뀐 항목만 보낸다 — 생략한 항목을 서버가 그대로 두는 것이 계약이라,
    // 전부 보내면 다른 사람이 방금 바꾼 값을 되돌리게 된다.
    mutationFn: () =>
      updateLlmKey(llmKey.id, {
        ...(name.trim() === llmKey.name ? {} : { name: name.trim() }),
        ...(purpose === (llmKey.purpose ?? '') ? {} : { purpose }),
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
    name.trim() !== llmKey.name ||
    purpose !== (llmKey.purpose ?? '') ||
    recordBodies !== llmKey.recordBodies

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!dirty) return
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
          <FormField label="이름" className="max-w-md">
            <Input
              value={name}
              disabled={!allowed}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField
            label="용도"
            className="max-w-md"
            description="이 키를 무엇에 쓰는지 — 목록에서 두 키를 구별하는 데 쓰입니다."
          >
            <Textarea
              rows={2}
              value={purpose}
              disabled={!allowed}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </FormField>
          <Checkbox
            className="max-w-md"
            label="프롬프트·응답 본문 기록"
            description="켜면 이 키로 보낸 프롬프트와 응답이 수집됩니다. 개인정보가 담기는 요청에는 켜지 마세요."
            checked={recordBodies}
            disabled={!allowed}
            onChange={(event) => setRecordBodies(event.target.checked)}
          />
          <Button type="submit" loading={save.isPending} disabled={!allowed || !dirty}>
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

/* ─── 폐기 ─── */

/**
 * 폐기 권한은 발급 권한과 다르다 — 워크스페이스 소유자와 관리자도 폐기할 수
 * 있어야 유출된 키를 죽일 수 있다. 그래서 여기서는 등급이 아니라 서버가 계산해
 * 준 accessManageAllowed를 그대로 읽는다.
 */
function RevokeSection({ llmKey }: { llmKey: LlmKeyDetail }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const allowed = llmKey.accessManageAllowed

  const revoke = useMutation({
    mutationFn: () => revokeLlmKey(llmKey.id),
    onSuccess: async () => {
      setConfirming(false)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['llm-keys', llmKey.id] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => {
      setConfirming(false)
      setError(toApiError(err, 'LLM API 키를 폐기하지 못했습니다.').message)
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>키 폐기</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-neutral-600">
          키를 폐기하면 이후 이 키로 보낸 요청이 거부됩니다. 되돌릴 수 없고, 폐기한 키는 다시
          발급할 수 없습니다.
        </p>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button variant="danger" disabled={!allowed} onClick={() => setConfirming(true)}>
          키 폐기
        </Button>
        {!allowed && (
          <PermissionNotice>
            키 폐기는 이 키의 소유자 또는 워크스페이스 소유자만 할 수 있습니다.
          </PermissionNotice>
        )}

        <ConfirmNameModal
          open={confirming}
          onClose={() => setConfirming(false)}
          title="LLM API 키 폐기"
          expectedName={llmKey.name}
          confirmLabel="폐기"
          loading={revoke.isPending}
          onConfirm={() => revoke.mutate()}
        >
          <div className="space-y-3 text-sm text-neutral-600">
            <Alert variant="danger" title="되돌릴 수 없습니다">
              폐기한 키는 다시 발급할 수 없습니다. 계속 쓰려면 새로 신청해야 합니다.
            </Alert>
            <p>
              게이트웨이에는 폴링 주기 안에 반영되며, 이후 이 키로 보낸 요청은 폐기된 키로
              거부됩니다. 지금까지의 사용 기록은 남습니다.
            </p>
          </div>
        </ConfirmNameModal>
      </CardContent>
    </Card>
  )
}
