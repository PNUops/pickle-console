import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateResourceLists, issueLlmKeyToken, type LlmKeyDetail } from '../../api/queries'
import { toApiError } from '../../api/problem'
import { CopyButton } from '../CopyButton'
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
import { DOCS_PATH } from '../../lib/brand'
import { formatDateTime } from '../../lib/format'
import type { LlmApiKeyStatus } from '../../lib/status'

/**
 * 평문을 만드는 자리.
 *
 * 평문은 뮤테이션 상태에만 존재한다 — 컴포넌트 상태로 옮기지 않고, 결과 모달은
 * `reset()`으로 닫아 그 자리에서 버린다 (릴레이 토큰과 같은 규칙). 서버에는
 * 해시만 남아 다시 조회할 방법이 없으므로, 창을 닫으면 정말로 끝이다.
 *
 * One card on the 개요 tab holds both the first issue of a pending key and
 * the re-issue of an active one: the reason to re-issue is that the value is
 * lost, and the place a reader notices that is where the value should have
 * been. It sits under 연결 정보 rather than in the page header, because a
 * header button is for what a person does routinely and this is neither
 * routine nor reversible.
 *
 * The card stays mounted across the refetch its own success triggers, so the
 * one-time plaintext modal survives it. For a suspended or expired key it
 * draws nothing: issuing there would mint a value that authenticates nothing.
 */
export function LlmKeyIssueAction({
  llmKey,
  status,
}: {
  llmKey: LlmKeyDetail
  status: LlmApiKeyStatus
}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rotation = status !== 'PENDING'
  const actionLabel = rotation ? '키 재발급' : '키 발급'
  // 발급은 부여받은 권한이다 — 이 키의 접근 목록에서 소유자 등급을 받은 사람만
  // 한다. 워크스페이스 소유자의 상시 권한(폐기·목록 관리)은 여기에 닿지 않으므로
  // accessManageAllowed로 판단하면 눌러야만 아는 403이 된다.
  const allowed = llmKey.myResourceRole === 'OWNER'
  // 발급이 뜻을 갖는 상태는 둘뿐이다. 서버의 발급은 '발급 전'만 활성으로 올리므로
  // 정지·만료된 키에 발급을 걸면 쓰던 값만 죽고 새 값도 아무것도 인증하지 못한다 —
  // 다시 볼 수 없다는 경고와 함께 쓸모없는 평문을 쥐여 주는 셈이다. 폐기와 같이 뺀다.
  const visible = status === 'PENDING' || status === 'ACTIVE'

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

  if (!visible && !issue.isSuccess) return null

  const open = () => {
    setError(null)
    setConfirming(true)
  }
  const notice = !allowed && (
    <PermissionNotice>
      키 발급은 이 키의 접근 목록에서 소유자 등급을 받은 사람만 할 수 있습니다.
    </PermissionNotice>
  )

  const modals = (
    <>
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
            평문은 다음 화면에서 한 번만 볼 수 있습니다.
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
            <p className="text-sm text-neutral-600">
              호출 방법은{' '}
              <Link
                to={DOCS_PATH}
                className="font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800"
              >
                사용 가이드
              </Link>
              에 있습니다.
            </p>
          </div>
        )}
      </Modal>
    </>
  )

  if (!visible) return modals

  return (
    <Card>
      <CardHeader>
        <CardTitle>{actionLabel}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert variant="danger">{error}</Alert>}
        <SettingRow
          label={rotation ? '이전 값이 즉시 무효화됩니다' : '평문은 발급 직후 한 번만 보입니다'}
          // 발급 전 갈래에는 설명이 없다. 이 카드 위의 StatusNotice 가 「발급 전에는
          // 이 키로 보낸 요청이 하나도 인증되지 않습니다」를 이미 말하고 있어,
          // 같은 사실이 한 탭에 열다섯 줄 간격으로 두 번 서게 된다.
          description={rotation ? '값을 잃어버렸을 때만 재발급합니다.' : undefined}
          action={
            <Button
              variant={rotation ? 'secondary' : 'primary'}
              size="sm"
              disabled={!allowed}
              onClick={open}
            >
              {actionLabel}
            </Button>
          }
        />
        {notice}
        {modals}
      </CardContent>
    </Card>
  )
}
