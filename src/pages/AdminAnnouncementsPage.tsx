import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAnnouncement,
  fetchAdminGroups,
  fetchAnnouncements,
  fetchOrgs,
  type AnnouncementCreateRequest,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import {
  Alert,
  AnnouncementScopeBadge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
} from '../components/ui'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatDateTime } from '../lib/format'

/** 대상 선택 옵션 — 역할에 따라 노출이 다르다. */
type TargetKind = 'ALL' | 'ORG_ALL' | 'ORG_PICK' | 'GROUP'

/** 공지 보내기 — 범위(전체/기관/그룹)를 골라 발송하고 최근 공지를 확인한다. */
export function AdminAnnouncementsPage() {
  const { user } = useAuth()
  const isSysAdmin = user?.role === 'SYS_ADMIN'
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [target, setTarget] = useState<TargetKind>(isSysAdmin ? 'ALL' : 'ORG_ALL')
  const [orgId, setOrgId] = useState<number | undefined>(undefined)
  const [groupId, setGroupId] = useState<number | undefined>(undefined)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: isSysAdmin })
  // SYS_ADMIN 그룹 대상: 기관을 먼저 고른 뒤 그 기관 그룹을 불러온다.
  const groupsEnabled = target === 'GROUP' && (!isSysAdmin || orgId != null)
  const groups = useQuery({
    queryKey: ['admin', 'groups', { orgId: (isSysAdmin ? orgId : null) ?? null }],
    queryFn: () => fetchAdminGroups(isSysAdmin ? { orgId } : {}),
    enabled: groupsEnabled,
  })
  const recent = useQuery({
    queryKey: ['admin', 'announcements', { page: 0 }],
    queryFn: () => fetchAnnouncements({ page: 0, size: 10 }),
  })

  const send = useMutation({
    mutationFn: (request: AnnouncementCreateRequest) => createAnnouncement(request),
    onSuccess: async (created) => {
      setConfirming(false)
      setSuccess(
        `공지를 발송했습니다. ${created.recipientCount}명에게 인앱 알림이 전달되고 이메일은 순차 발송됩니다.`,
      )
      setTitle('')
      setBody('')
      setTarget(isSysAdmin ? 'ALL' : 'ORG_ALL')
      setOrgId(undefined)
      setGroupId(undefined)
      setFieldErrors({})
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] })
    },
    onError: (err) => {
      setConfirming(false)
      const apiError = toApiError(err, '공지를 발송하지 못했습니다.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setError(apiError.message)
    },
  })

  function requestOf(): AnnouncementCreateRequest {
    if (target === 'ALL') return { title, body, scope: 'ALL' }
    if (target === 'ORG_ALL') return { title, body, scope: 'ORG' }
    if (target === 'ORG_PICK') return { title, body, scope: 'ORG', orgId }
    return { title, body, scope: 'GROUP', groupId }
  }

  /** 확인 모달에 다시 보여줄 대상 설명. */
  function targetLabel(): string {
    if (target === 'ALL') return '전체 사용자'
    if (target === 'ORG_ALL') return '우리 기관 전체 사용자'
    if (target === 'ORG_PICK') {
      const org = (orgs.data ?? []).find((o) => o.id === orgId)
      return `기관 '${org?.name ?? ''}' 소속 사용자`
    }
    const group = (groups.data ?? []).find((g) => g.id === groupId)
    return `그룹 '${group?.name ?? ''}' 구성원`
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    const errors: Record<string, string> = {}
    if (!title.trim()) errors.title = '제목을 입력해 주세요.'
    if (!body.trim()) errors.body = '내용을 입력해 주세요.'
    if (target === 'ORG_PICK' && orgId == null) errors.orgId = '대상 기관을 선택해 주세요.'
    if (target === 'GROUP' && groupId == null) errors.groupId = '대상 그룹을 선택해 주세요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setConfirming(true)
  }

  const targetOptions: { kind: TargetKind; label: string }[] = isSysAdmin
    ? [
        { kind: 'ALL', label: '전체' },
        { kind: 'ORG_PICK', label: '특정 기관' },
        { kind: 'GROUP', label: '특정 그룹' },
      ]
    : [
        { kind: 'ORG_ALL', label: '우리 기관 전체' },
        { kind: 'GROUP', label: '특정 그룹' },
      ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">공지 보내기</h1>
        <p className="mt-1 text-sm text-neutral-500">
          공지는 대상 사용자에게 인앱 알림으로 즉시 전달되고, 이메일로도 발송됩니다.
        </p>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && Object.keys(fieldErrors).length === 0 && (
        <Alert variant="danger">{error}</Alert>
      )}

      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <FormField label="제목" required error={fieldErrors.title}>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="예: 7월 정기 점검 안내"
              />
            </FormField>
            <FormField label="내용" required error={fieldErrors.body}>
              <Textarea
                rows={5}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="알림·이메일 본문에 그대로 포함됩니다."
              />
            </FormField>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-neutral-700">대상</legend>
              <div className="flex flex-wrap gap-4">
                {targetOptions.map((option) => (
                  <label
                    key={option.kind}
                    className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700"
                  >
                    <input
                      type="radio"
                      name="announcement-target"
                      className="size-4 accent-primary-600"
                      checked={target === option.kind}
                      onChange={() => {
                        setTarget(option.kind)
                        setGroupId(undefined)
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {target === 'ORG_PICK' && (
              <FormField label="대상 기관" required error={fieldErrors.orgId}>
                <Select
                  className="w-72"
                  value={orgId ?? ''}
                  onChange={(event) => {
                    setOrgId(event.target.value ? Number(event.target.value) : undefined)
                  }}
                >
                  <option value="">기관 선택</option>
                  {(orgs.data ?? []).map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}

            {target === 'GROUP' && (
              <div className="flex flex-wrap gap-4">
                {isSysAdmin && (
                  <FormField label="그룹의 기관" required>
                    <Select
                      className="w-64"
                      value={orgId ?? ''}
                      onChange={(event) => {
                        setOrgId(event.target.value ? Number(event.target.value) : undefined)
                        setGroupId(undefined)
                      }}
                    >
                      <option value="">기관 선택</option>
                      {(orgs.data ?? []).map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                )}
                <FormField label="대상 그룹" required error={fieldErrors.groupId}>
                  <Select
                    className="w-64"
                    value={groupId ?? ''}
                    disabled={!groupsEnabled || groups.isPending}
                    onChange={(event) => {
                      setGroupId(event.target.value ? Number(event.target.value) : undefined)
                    }}
                  >
                    <option value="">그룹 선택</option>
                    {(groups.data ?? []).map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.memberCount}명)
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit">공지 발송</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>최근 공지</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.isPending && (
            <div className="flex justify-center py-6">
              <Spinner label="최근 공지 불러오는 중" />
            </div>
          )}
          {recent.isError && <Alert variant="danger">{recent.error.message}</Alert>}
          {recent.isSuccess && recent.data.content.length === 0 && (
            <p className="py-4 text-center text-sm text-neutral-500">
              발송한 공지가 없습니다.
            </p>
          )}
          {recent.isSuccess && recent.data.content.length > 0 && (
            <ul className="divide-y divide-neutral-100">
              {recent.data.content.map((announcement) => (
                <li
                  key={announcement.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {announcement.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                      <AnnouncementScopeBadge scope={announcement.scope} />
                      수신 {announcement.recipientCount}명
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-400">
                    {formatDateTime(announcement.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="공지 발송 확인"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              취소
            </Button>
            <Button loading={send.isPending} onClick={() => send.mutate(requestOf())}>
              발송
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-700">
          <strong>{targetLabel()}</strong>에게 공지 <strong>{title}</strong>을(를)
          발송합니다. 발송 후에는 취소할 수 없습니다. 계속할까요?
        </p>
      </Modal>
    </div>
  )
}
