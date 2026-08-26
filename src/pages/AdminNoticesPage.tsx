import { useState, type ChangeEvent, type FormEvent } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAdminNotice,
  deleteAdminNotice,
  deleteAdminNoticeImage,
  fetchAdminNotices,
  fetchOrgs,
  noticeImageUrl,
  updateAdminNotice,
  uploadAdminNoticeImage,
  type AdminNoticeView,
  type NoticeAudience,
  type NoticeScope,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canManageNotice, isSysTier } from '../auth/permissions'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  FormField,
  Input,
  Modal,
  Pagination,
  PermissionNotice,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
  useToast,
} from '../components/ui'
import { cn } from '../lib/cn'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatDateTime } from '../lib/format'

const PAGE_SIZE = 10

/** 한 공지가 가질 수 있는 첨부 이미지 수. */
const MAX_IMAGES = 5

/** 업로드 전 걸러 내는 파일 크기 상한 — 서버도 같은 선에서 거절한다. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

const SCOPE_LABELS: Record<NoticeScope, string> = {
  PLATFORM: '전역',
  ORG: '기관',
}

const AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  PUBLIC: '익명까지 공개',
  USERS: '로그인 사용자',
}

/** ISO 시각 → `datetime-local` 입력값. 콘솔의 시각 표기는 KST 고정이다. */
function toDateTimeInput(iso: string | null | undefined): string {
  return iso == null ? '' : formatDateTime(iso).replace(' ', 'T')
}

/** `datetime-local` 입력값(KST 벽시계) → 오프셋을 명시한 ISO 문자열. */
function fromDateTimeInput(value: string): string | null {
  return value === '' ? null : `${value}:00+09:00`
}

/**
 * 공지사항 관리 — 목록 + 드로어. 드로어는 관리자 전 역할에게 열리고, 쓰기 권한이
 * 없는 역할에게는 액션이 보이되 비활성으로 남아 사유가 함께 적힌다.
 */
export function AdminNoticesPage() {
  const { user } = useAuth()
  const role = user?.role
  const canManage = !!role && canManageNotice(role)
  // 전역 공지는 시스템 계층의 것 — 기관 관리자는 자기 기관 공지만 쓴다.
  const canChoosePlatform = !!role && isSysTier(role)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const notices = useQuery({
    queryKey: ['admin', 'notices', page],
    queryFn: () => fetchAdminNotices({ page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  // 드로어 본문은 목록 캐시에서 다시 찾는다 — 이미지 업로드처럼 드로어 안에서
  // 일어난 변화가 목록 무효화만으로 그대로 비친다.
  const selected = notices.data?.content.find((notice) => notice.id === selectedId) ?? null
  const drawerOpen = creating || selectedId !== null

  const closeDrawer = () => {
    setCreating(false)
    setSelectedId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">공지사항 관리</h1>
          <p className="mt-1 text-sm text-neutral-500">
            콘솔과 랜딩에 게시되는 공지를 등록하고 게시 기간을 관리합니다.
          </p>
        </div>
        <Button
          disabled={!canManage}
          onClick={() => {
            setSelectedId(null)
            setCreating(true)
          }}
        >
          공지 등록
        </Button>
      </div>

      {!canManage && (
        <PermissionNotice>
          공지 등록·수정·삭제는 기관 관리자·시스템 관리자만 수행할 수 있습니다.
        </PermissionNotice>
      )}

      {notices.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="공지사항 목록 불러오는 중" />
        </div>
      )}
      {notices.isError && <Alert variant="danger">{notices.error.message}</Alert>}
      {notices.isSuccess && notices.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">등록된 공지가 없습니다.</Card>
      )}
      {notices.isSuccess && notices.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>제목</TH>
                  <TH>범위</TH>
                  <TH>대상</TH>
                  <TH>게시 상태</TH>
                  <TH>게시 시작</TH>
                </TR>
              </THead>
              <TBody>
                {notices.data.content.map((notice) => (
                  <TR
                    key={notice.id}
                    className={cn(
                      'cursor-pointer',
                      notice.id === selectedId && 'bg-primary-50 hover:bg-primary-50',
                    )}
                    onClick={() => {
                      setCreating(false)
                      setSelectedId(notice.id)
                    }}
                  >
                    <TD>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setCreating(false)
                          setSelectedId(notice.id)
                        }}
                        className="cursor-pointer font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
                      >
                        {notice.title}
                      </button>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {notice.pinned && <Badge variant="warning">고정</Badge>}
                        {notice.popup && <Badge variant="info">팝업</Badge>}
                      </span>
                    </TD>
                    <TD>{SCOPE_LABELS[notice.scope]}</TD>
                    <TD>{AUDIENCE_LABELS[notice.audience]}</TD>
                    <TD>
                      <Badge variant={notice.active ? 'success' : 'neutral'}>
                        {notice.active ? '게시 중' : '게시 안 함'}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap">{formatDateTime(notice.startsAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={notices.data.page}
            totalPages={notices.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={creating ? '공지 등록' : '공지 상세'}
      >
        {drawerOpen && (
          <NoticeDetailBody
            key={selectedId ?? 'new'}
            notice={selected}
            canManage={canManage}
            canChoosePlatform={canChoosePlatform}
            onCreated={(created) => {
              setCreating(false)
              setSelectedId(created.id)
            }}
            onDeleted={closeDrawer}
          />
        )}
      </Drawer>
    </div>
  )
}

/* ─── 드로어 본문 — 등록 폼이자 상세 편집 폼 ─── */

function NoticeDetailBody({
  notice,
  canManage,
  canChoosePlatform,
  onCreated,
  onDeleted,
}: {
  /** null이면 등록 모드. */
  notice: AdminNoticeView | null
  canManage: boolean
  canChoosePlatform: boolean
  onCreated: (created: AdminNoticeView) => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [title, setTitle] = useState(notice?.title ?? '')
  const [body, setBody] = useState(notice?.body ?? '')
  const [scope, setScope] = useState<NoticeScope>(
    notice?.scope ?? (canChoosePlatform ? 'PLATFORM' : 'ORG'),
  )
  const [orgId, setOrgId] = useState(notice?.org?.id ?? '')
  const [audience, setAudience] = useState<NoticeAudience>(notice?.audience ?? 'USERS')
  const [pinned, setPinned] = useState(notice?.pinned ?? false)
  const [popup, setPopup] = useState(notice?.popup ?? false)
  const [startsAt, setStartsAt] = useState(
    toDateTimeInput(notice?.startsAt ?? new Date().toISOString()),
  )
  const [endsAt, setEndsAt] = useState(toDateTimeInput(notice?.endsAt))
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState(false)

  // 기관 공지는 서버가 익명 공개를 거절한다 — 화면에서 같은 규칙을 먼저 세워
  // 사용자가 422를 맞고 나서야 알게 되는 일이 없게 한다.
  const orgScoped = scope === 'ORG'
  const effectiveAudience: NoticeAudience = orgScoped ? 'USERS' : audience

  // 시스템 계층이 기관 공지를 쓸 때만 대상 기관을 고른다 — 기관 관리자는 자기 기관 고정.
  const needsOrgPick = canChoosePlatform && orgScoped
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: needsOrgPick })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'notices'] })

  const onMutationError = (fallback: string) => (err: unknown) => {
    const apiError = toApiError(err, fallback)
    const mapped = fieldErrorsOf(apiError.problem)
    setFieldErrors(mapped)
    setError(Object.keys(mapped).length > 0 ? null : apiError.message)
  }

  const create = useMutation({
    mutationFn: () =>
      createAdminNotice({
        title: title.trim(),
        body,
        scope,
        orgId: needsOrgPick ? orgId : undefined,
        audience: effectiveAudience,
        pinned,
        popup,
        startsAt: fromDateTimeInput(startsAt)!,
        endsAt: fromDateTimeInput(endsAt),
      }),
    onSuccess: async (created) => {
      setError(null)
      setFieldErrors({})
      toast.success('공지를 등록했습니다. 이어서 이미지를 첨부할 수 있습니다.')
      await invalidate()
      onCreated(created)
    },
    onError: onMutationError('공지를 등록하지 못했습니다.'),
  })

  const update = useMutation({
    mutationFn: () =>
      updateAdminNotice(notice!.id, {
        title: title.trim(),
        body,
        scope,
        orgId: needsOrgPick ? orgId : undefined,
        audience: effectiveAudience,
        pinned,
        popup,
        startsAt: fromDateTimeInput(startsAt)!,
        endsAt: fromDateTimeInput(endsAt),
      }),
    onSuccess: async () => {
      setError(null)
      setFieldErrors({})
      toast.success('공지를 수정했습니다.')
      await invalidate()
    },
    onError: onMutationError('공지를 수정하지 못했습니다.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteAdminNotice(notice!.id),
    onSuccess: async () => {
      setDeleting(false)
      toast.success('공지를 삭제했습니다.')
      await invalidate()
      onDeleted()
    },
    onError: (err) => {
      setDeleting(false)
      setError(toApiError(err, '공지를 삭제하지 못했습니다.').message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const errors: Record<string, string> = {}
    if (!title.trim()) errors.title = '제목을 입력해 주세요.'
    if (!body.trim()) errors.body = '본문을 입력해 주세요.'
    if (needsOrgPick && !orgId) errors.orgId = '대상 기관을 선택해 주세요.'
    if (!startsAt) errors.startsAt = '게시 시작 시각을 입력해 주세요.'
    if (startsAt && endsAt && endsAt <= startsAt) {
      errors.endsAt = '게시 종료는 시작보다 뒤여야 합니다.'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    if (notice) update.mutate()
    else create.mutate()
  }

  return (
    <div className="space-y-6">
      {!canManage && (
        <PermissionNotice>
          공지 등록·수정·삭제는 기관 관리자·시스템 관리자만 수행할 수 있습니다.
        </PermissionNotice>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormField label="제목" required error={fieldErrors.title}>
          <Input
            value={title}
            disabled={!canManage}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 8월 정기 점검 안내"
          />
        </FormField>

        <FormField
          label="본문"
          required
          error={fieldErrors.body}
          description="서식 없는 평문입니다. 줄바꿈은 그대로 보입니다."
        >
          <Textarea
            rows={8}
            value={body}
            disabled={!canManage}
            onChange={(event) => setBody(event.target.value)}
          />
        </FormField>

        <FormField label="게시 범위" required error={fieldErrors.scope}>
          <Select
            className="w-40"
            value={scope}
            disabled={!canManage || !canChoosePlatform}
            onChange={(event) => {
              const next = event.target.value as NoticeScope
              setScope(next)
              // 기관 공지는 언제나 로그인 사용자 대상이다.
              if (next === 'ORG') setAudience('USERS')
            }}
          >
            {canChoosePlatform && <option value="PLATFORM">{SCOPE_LABELS.PLATFORM}</option>}
            <option value="ORG">{SCOPE_LABELS.ORG}</option>
          </Select>
        </FormField>

        {needsOrgPick && (
          <FormField label="대상 기관" required error={fieldErrors.orgId}>
            <Select
              className="w-56"
              value={orgId}
              disabled={!canManage}
              onChange={(event) => setOrgId(event.target.value)}
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
        {!canChoosePlatform && (
          <p className="text-sm text-neutral-500">
            기관 관리자는 자기 기관 공지만 등록할 수 있습니다.
          </p>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-700">노출 대상</legend>
          <div className="flex flex-wrap gap-4">
            {(Object.keys(AUDIENCE_LABELS) as NoticeAudience[]).map((value) => (
              <label
                key={value}
                className={cn(
                  'flex items-center gap-2 text-sm text-neutral-700',
                  orgScoped && value === 'PUBLIC'
                    ? 'cursor-not-allowed text-neutral-400'
                    : 'cursor-pointer',
                )}
              >
                <input
                  type="radio"
                  name="notice-audience"
                  className="size-4 accent-primary-600"
                  checked={effectiveAudience === value}
                  disabled={!canManage || (orgScoped && value === 'PUBLIC')}
                  onChange={() => setAudience(value)}
                />
                {AUDIENCE_LABELS[value]}
              </label>
            ))}
          </div>
          {orgScoped && (
            <p className="text-xs text-neutral-500">
              기관 공지는 해당 기관 사용자만 볼 수 있어 익명 공개를 고를 수 없습니다.
            </p>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Checkbox
            label="목록 상단 고정"
            description="공지사항 목록과 랜딩 한 줄에서 먼저 보입니다."
            checked={pinned}
            disabled={!canManage}
            onChange={(event) => setPinned(event.target.checked)}
          />
          <Checkbox
            label="로그인 후 팝업"
            description="콘솔에 들어온 사용자에게 모달로 한 번 띄웁니다."
            checked={popup}
            disabled={!canManage}
            onChange={(event) => setPopup(event.target.checked)}
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <FormField label="게시 시작" required error={fieldErrors.startsAt}>
            <Input
              type="datetime-local"
              className="w-56"
              value={startsAt}
              disabled={!canManage}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </FormField>
          <FormField
            label="게시 종료"
            error={fieldErrors.endsAt}
            description="비워 두면 계속 게시합니다."
          >
            <Input
              type="datetime-local"
              className="w-56"
              value={endsAt}
              disabled={!canManage}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-2">
          {notice && (
            <Button variant="danger" disabled={!canManage} onClick={() => setDeleting(true)}>
              삭제
            </Button>
          )}
          <Button
            type="submit"
            disabled={!canManage}
            loading={create.isPending || update.isPending}
          >
            {notice ? '저장' : '등록'}
          </Button>
        </div>
      </form>

      <NoticeImageSection notice={notice} canManage={canManage} onChanged={invalidate} />

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="공지 삭제"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              돌아가기
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              삭제
            </Button>
          </>
        }
      >
        <Alert variant="warning">
          공지 <strong>{notice?.title}</strong>와 첨부 이미지를 함께 삭제합니다. 되돌릴 수
          없습니다.
        </Alert>
      </Modal>
    </div>
  )
}

/* ─── 첨부 이미지 (공지가 만들어진 뒤부터) ─── */

function NoticeImageSection({
  notice,
  canManage,
  onChanged,
}: {
  notice: AdminNoticeView | null
  canManage: boolean
  onChanged: () => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)

  const upload = useMutation({
    mutationFn: (file: File) => uploadAdminNoticeImage(notice!.id, file),
    onSuccess: async () => {
      setError(null)
      await onChanged()
    },
    onError: (err) => setError(toApiError(err, '이미지를 업로드하지 못했습니다.').message),
  })

  const remove = useMutation({
    mutationFn: (imageId: string) => deleteAdminNoticeImage(notice!.id, imageId),
    onSuccess: async () => {
      setError(null)
      await onChanged()
    },
    onError: (err) => setError(toApiError(err, '이미지를 삭제하지 못했습니다.').message),
  })

  const images = notice?.images ?? []
  const full = images.length >= MAX_IMAGES

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // 같은 파일을 연달아 고를 수 있도록 입력값을 비운다.
    event.target.value = ''
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('PNG·JPEG·WebP·GIF 이미지만 첨부할 수 있습니다.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('이미지 한 장의 크기는 2MB를 넘을 수 없습니다.')
      return
    }
    setError(null)
    upload.mutate(file)
  }

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">첨부 이미지</h3>
      {notice == null ? (
        <p className="text-sm text-neutral-500">
          공지를 먼저 등록하면 이미지를 첨부할 수 있습니다.
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-500">
            PNG·JPEG·WebP·GIF, 한 장당 2MB까지, 최대 {MAX_IMAGES}장 첨부할 수 있습니다.
          </p>
          {error && <Alert variant="danger">{error}</Alert>}
          {images.length > 0 && (
            <ul className="flex flex-wrap gap-3">
              {images.map((image) => (
                <li key={image.id} className="w-32 space-y-1">
                  <img
                    src={noticeImageUrl(notice.id, image.id)}
                    alt={image.fileName}
                    loading="lazy"
                    className="h-24 w-32 rounded border border-neutral-200 object-cover"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canManage}
                    loading={remove.isPending}
                    onClick={() => remove.mutate(image.id)}
                  >
                    이미지 삭제
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700">이미지 추가</span>
            <input
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              disabled={!canManage || full || upload.isPending}
              onChange={pick}
              className="text-sm text-neutral-700 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium disabled:cursor-not-allowed disabled:text-neutral-400"
            />
          </label>
          {full && (
            <p className="text-xs text-neutral-500">
              이미지는 최대 {MAX_IMAGES}장까지 첨부할 수 있습니다.
            </p>
          )}
        </>
      )}
    </section>
  )
}
