import { useState, type ChangeEvent, type FormEvent } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAdminNotice,
  deleteAdminNotice,
  deleteAdminNoticeImage,
  fetchAdminNotices,
  updateAdminNotice,
  uploadAdminNoticeImage,
  type AdminNoticeView,
  type NoticeCreateRequest,
  type NoticeUpdateRequest,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canManageNotice } from '../auth/permissions'
import { NoticeImage } from '../components/NoticeImage'
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
import { useAdminScope } from '../lib/use-admin-scope'

const PAGE_SIZE = 10

/** 한 공지가 가질 수 있는 첨부 이미지 수. */
const MAX_IMAGES = 5

/** 업로드 전 걸러 내는 파일 크기 상한 — 서버도 같은 선에서 거절한다. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

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
 * 없는 역할에게는 읽을 정보만 제공한다.
 */
export function AdminNoticesPage() {
  const { user } = useAuth()
  const scope = useAdminScope()
  const role = scope.tier === 'org' ? scope.activeOrgRole : user?.role
  const canManage = !!role && canManageNotice(role)
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
            콘솔 공지사항에 게시되는 공지를 등록하고 게시 기간을 관리합니다.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setSelectedId(null)
              setCreating(true)
            }}
          >
            공지 등록
          </Button>
        )}
      </div>

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
  onCreated,
  onDeleted,
}: {
  /** null이면 등록 모드. */
  notice: AdminNoticeView | null
  canManage: boolean
  /** 보고 있는 사람이 관리자인 기관들 — 기관 공지를 쓸 수 있는 곳 전부. */
  onCreated: (created: AdminNoticeView) => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [title, setTitle] = useState(notice?.title ?? '')
  const [body, setBody] = useState(notice?.body ?? '')
  const [pinned, setPinned] = useState(notice?.pinned ?? false)
  const [popup, setPopup] = useState(notice?.popup ?? false)
  const [startsAt, setStartsAt] = useState(
    toDateTimeInput(notice?.startsAt ?? new Date().toISOString()),
  )
  const [endsAt, setEndsAt] = useState(toDateTimeInput(notice?.endsAt))
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState(false)


  /** 등록과 수정이 함께 보내는 부분 — 계약의 수정 요청이 받는 필드 전부다. */
  const editableBody = () => ({
    title: title.trim(),
    body,
    pinned,
    popup,
    startsAt: fromDateTimeInput(startsAt)!,
    endsAt: fromDateTimeInput(endsAt),
  })

  const updateBody = (): NoticeUpdateRequest => editableBody()

  /** 등록 본문. 등록에만 있는 필드는 남아 있지 않다 — 수정과 같은 몸이다. */
  const createBody = (): NoticeCreateRequest => editableBody()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'notices'] })

  /** 서버가 지적한 필드 중 이 폼이 실제로 그리는 것. */
  const shownFields = ['title', 'body', 'startsAt', 'endsAt']

  const onMutationError = (fallback: string) => (err: unknown) => {
    const apiError = toApiError(err, fallback)
    const mapped = fieldErrorsOf(apiError.problem)
    setFieldErrors(mapped)
    // 그려지지 않는 필드의 오류를 필드에 맡기면 아무 데도 남지 않는다 — 등록 버튼이
    // 조용히 죽은 것처럼 보인다. 그때는 알림으로 올리되 problem의 detail이 아니라
    // 그 필드의 메시지를 싣는다: '요청 값을 확인해 주세요'는 어느 값인지 말해 주지
    // 않고, 여기서 알아야 하는 것이 바로 그것이다.
    const stranded = Object.entries(mapped)
      .filter(([field]) => !shownFields.includes(field))
      .map(([, message]) => message)
    if (stranded.length > 0) setError(stranded.join(' '))
    else setError(Object.keys(mapped).length > 0 ? null : apiError.message)
  }

  const create = useMutation({
    mutationFn: () => createAdminNotice(createBody()),
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
    mutationFn: () => updateAdminNotice(notice!.id, updateBody()),
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
    if (!startsAt) errors.startsAt = '게시 시작 시각을 입력해 주세요.'
    if (startsAt && endsAt && endsAt <= startsAt) {
      errors.endsAt = '게시 종료는 시작보다 뒤여야 합니다.'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    if (notice) update.mutate()
    else create.mutate()
  }

  if (!canManage && notice) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-neutral-900">{notice.title}</h3>
            {notice.pinned && <Badge variant="warning">고정</Badge>}
            {notice.popup && <Badge variant="info">팝업</Badge>}
            <Badge variant={notice.active ? 'success' : 'neutral'}>
              {notice.active ? '게시 중' : '게시 안 함'}
            </Badge>
          </div>
          <p className="text-sm text-neutral-500">
            작성자 {notice.createdByName} · 등록 {formatDateTime(notice.createdAt)}
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-neutral-500">게시 시작</dt>
            <dd className="font-medium text-neutral-900">{formatDateTime(notice.startsAt)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">게시 종료</dt>
            <dd className="font-medium text-neutral-900">
              {notice.endsAt ? formatDateTime(notice.endsAt) : '계속 게시'}
            </dd>
          </div>
        </dl>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{notice.body}</p>
        <NoticeImageSection notice={notice} canManage={false} onChanged={invalidate} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {notice && (
        <p className="text-sm text-neutral-500">
          작성자 {notice.createdByName} · 등록 {formatDateTime(notice.createdAt)}
        </p>
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

        <div className="grid gap-3 sm:grid-cols-2">
          <Checkbox
            label="목록 상단 고정"
            description="공지사항 목록과 대시보드에서 먼저 보입니다."
            checked={pinned}
            disabled={!canManage}
            onChange={(event) => setPinned(event.target.checked)}
          />
          <Checkbox
            label="팝업으로 표시"
            description="콘솔·랜딩·로그인 화면에 모달로 한 번 띄웁니다. 로그인하지 않은 방문자에게도 보입니다."
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
                  <NoticeImage
                    image={image}
                    className="h-24 w-32 rounded border border-neutral-200 object-cover"
                  />
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={remove.isPending}
                      onClick={() => remove.mutate(image.id)}
                    >
                      이미지 삭제
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-neutral-700">이미지 추가</span>
              <input
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                disabled={full || upload.isPending}
                onChange={pick}
                className="text-sm text-neutral-700 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium disabled:cursor-not-allowed disabled:text-neutral-400"
              />
            </label>
          )}
          {canManage && full && (
            <p className="text-xs text-neutral-500">
              이미지는 최대 {MAX_IMAGES}장까지 첨부할 수 있습니다.
            </p>
          )}
        </>
      )}
    </section>
  )
}
