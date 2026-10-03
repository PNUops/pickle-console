import { useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  createAdminNotice,
  deleteAdminNotice,
  deleteAdminNoticeImage,
  fetchAdminNotices,
  fetchAdminNotice,
  updateAdminNotice,
  uploadAdminNoticeImage,
  type AdminNoticeView,
  type NoticeCreateRequest,
  type NoticeUpdateRequest,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canManageNotice, isSysTier } from '../auth/permissions'
import { NoticeImage } from '../components/NoticeImage'
import { NoticeContent } from '../components/NoticeContent'
import { NoticePopupCard } from '../components/NoticePopupCard'
import { OperationResult } from '../components/OperationResult'
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
import { useListUrl } from '../lib/use-list-url'
import { listPage } from '../lib/list-url'
import { useActiveResult } from '../lib/use-active-result'
import { isUuid } from '../lib/validation'
import { NOTICE_WINDOW_LABELS, noticeWindowState } from '../lib/notice-window'
import { useAdminScope } from '../lib/use-admin-scope'
import { adminPaths } from '../lib/paths'
import { noticeListReturn, noticeListWithoutSelection, noticeListWithSelection } from '../lib/notice-paths'

const PAGE_SIZE = 10

/** 한 공지가 가질 수 있는 첨부 이미지 수. */
const MAX_IMAGES = 5

/** 업로드 전 걸러 내는 파일 크기 상한 — 서버도 같은 선에서 거절한다. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
function sameSavedNotice(a: AdminNoticeView, b: AdminNoticeView): boolean {
  return (['title', 'body', 'pinned', 'popup', 'startsAt', 'endsAt'] as const).every((key) => (a[key] ?? null) === (b[key] ?? null))
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
 * 없는 역할에게는 읽을 정보만 제공한다.
 */
export function AdminNoticesPage() {
  const { user } = useAuth()
  const canManage = !!user && canManageNotice(user.role)
  const scope = useAdminScope()
  const navigate = useNavigate()
  const [params, change, normalize] = useListUrl()
  const page = listPage(params.get('page'))
  const rawSelected = params.get('selected')
  const selectedId = rawSelected && isUuid(rawSelected) ? rawSelected.toLowerCase() : null
  const legacyCreate = !selectedId && params.get('create') === '1'
  const invalidSelected = !!rawSelected && !isUuid(rawSelected)
  const listRef = useRef<HTMLDivElement>(null)
  const createRef = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const next = new URLSearchParams(params)
    if (page === 0) next.delete('page')
    else next.set('page', String(page))
    if (selectedId) { next.set('selected', selectedId); next.delete('create') }
    else if (!legacyCreate) next.delete('create')
    normalize(next.toString())
  }, [legacyCreate, normalize, page, params, selectedId])
  const notices = useQuery({ queryKey: ['admin', 'notices', 'list', page], queryFn: () => fetchAdminNotices({ page, size: PAGE_SIZE }) })
  const closeDrawer = () => {
    const former = selectedId
    change({ selected: undefined, create: undefined })
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLButtonElement>(`[data-notice-id="${former}"]`)
      ;(row ?? createRef.current)?.focus()
    })
  }
  const listPath = adminPaths.notices(scope.activeOrgId, page, selectedId ?? undefined)
  if (legacyCreate) return <Navigate replace to={adminPaths.newNotice(scope.activeOrgId, noticeListWithoutSelection(listPath))} />
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <h1 className="text-2xl font-bold text-neutral-900">공지사항 관리</h1>
      <p className="mt-1 text-sm text-neutral-500">플랫폼 전체의 공지 본문과 이미지, 게시 기간을 관리합니다. 팝업 설정은 로그인하지 않은 방문자에게도 공개되는 비차단 카드입니다.</p>
    </div>{canManage && <Button ref={createRef} onClick={() => void navigate(adminPaths.newNotice(scope.activeOrgId, noticeListWithoutSelection(listPath)))}>공지 등록</Button>}</div>
    {invalidSelected && <Alert variant="danger">공지 ID가 올바르지 않습니다.<Button variant="secondary" onClick={closeDrawer}>상세 선택 지우기</Button></Alert>}
    {notices.isPending && <Spinner label="공지사항 목록 불러오는 중" />}
    {notices.isError && <Alert variant="danger">{notices.error.message}<Button variant="secondary" onClick={() => void notices.refetch()}>목록 다시 조회</Button></Alert>}
    {notices.isSuccess && <><div ref={listRef}><Card><Table><THead><TR><TH>제목</TH><TH>게시 상태</TH><TH>게시 시작</TH><TH>게시 종료</TH></TR></THead><TBody>
      {notices.data.content.map((notice) => <TR key={notice.id} className={cn('cursor-pointer', notice.id === selectedId && 'bg-primary-50')} onClick={() => change({ selected: notice.id, create: undefined })}>
        <TD><button type="button" data-notice-id={notice.id} onClick={(event) => { event.stopPropagation(); change({ selected: notice.id, create: undefined }) }} className="cursor-pointer font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600">{notice.title}</button>
          <span className="mt-1 flex flex-wrap gap-1.5">{notice.pinned && <Badge variant="warning">고정</Badge>}{notice.popup && <Badge variant="info">팝업</Badge>}</span>
        </TD><TD><NoticeWindowBadge notice={notice} /></TD><TD className="whitespace-nowrap">{formatDateTime(notice.startsAt)}</TD><TD className="whitespace-nowrap">{notice.endsAt ? formatDateTime(notice.endsAt) : '계속 게시'}</TD>
      </TR>)}
    </TBody></Table>{notices.data.content.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">등록된 공지가 없습니다.</p>}</Card></div>
    <Pagination page={notices.data.page} totalPages={notices.data.totalPages} onPageChange={(nextPage) => change({ page: nextPage, selected: undefined, create: undefined })} /></>}
    <Drawer open={!!selectedId} onClose={closeDrawer} title="공지 상세">
      {selectedId && <ExistingNotice key={selectedId} noticeId={selectedId} canManage={canManage} editPath={adminPaths.editNotice(selectedId, scope.activeOrgId, listPath)} />}
    </Drawer>
  </div>
}

function NoticeWindowBadge({ notice }: { notice: Pick<AdminNoticeView, 'startsAt' | 'endsAt'> }) {
  const state = noticeWindowState(notice.startsAt, notice.endsAt)
  return <Badge variant={state === 'published' ? 'success' : state === 'scheduled' ? 'info' : 'neutral'}>{NOTICE_WINDOW_LABELS[state]}</Badge>
}

function ExistingNotice({ noticeId, canManage, editPath }: { noticeId: string; canManage: boolean; editPath: string }) {
  const detail = useQuery({ queryKey: ['admin', 'notices', 'detail', noticeId], queryFn: () => fetchAdminNotice(noticeId) })
  if (detail.isPending) return <Spinner label="공지 상세 불러오는 중" />
  if (detail.isError) return <Alert variant="danger">{detail.error.message}<Button variant="secondary" onClick={() => void detail.refetch()}>상세 다시 조회</Button></Alert>
  return <div className="space-y-5">{canManage && <Link className="inline-block text-sm font-semibold text-primary-700 hover:underline" to={editPath}>공지 수정</Link>}<NoticeReader notice={detail.data} /></div>
}

function NoticeReader({ notice }: { notice: AdminNoticeView }) {
  return <div className="space-y-6"><div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{notice.title}</h3>{notice.pinned && <Badge variant="warning">고정</Badge>}{notice.popup && <Badge variant="info">팝업</Badge>}<NoticeWindowBadge notice={notice} /></div><p className="text-sm text-neutral-500">작성자 {notice.createdByName} · 등록 {formatDateTime(notice.createdAt)}</p></div>
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-neutral-500">게시 시작</dt><dd>{formatDateTime(notice.startsAt)}</dd></div><div><dt className="text-neutral-500">게시 종료</dt><dd>{notice.endsAt ? formatDateTime(notice.endsAt) : '계속 게시'}</dd></div></dl><NoticeContent body={notice.body} images={notice.images} />
  </div>
}

export function AdminNoticeEditorPage() {
  const { noticeId: rawId } = useParams()
  const creating = rawId == null
  const noticeId = rawId && isUuid(rawId) ? rawId.toLowerCase() : null
  return <NoticeAuthoringSurface key={creating ? 'new' : rawId} noticeId={noticeId} creating={creating} />
}

function NoticeAuthoringSurface({ noticeId, creating }: { noticeId: string | null; creating: boolean }) {
  const { user } = useAuth()
  const scope = useAdminScope()
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const canManage = !!user && canManageNotice(user.role)
  const returnPath = noticeListReturn(params.get('returnTo'), scope.activeOrgId, !!user && isSysTier(user.role))
  const [creationReceipt] = useState<AdminNoticeView | null>(() => {
    const state = location.state as { createdNotice?: AdminNoticeView } | null
    return state?.createdNotice?.id === noticeId ? state.createdNotice : null
  })
  useLayoutEffect(() => {
    if (typeof location.state === 'object' && location.state !== null && 'createdNotice' in location.state) void navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
  }, [location.pathname, location.search, location.state, navigate])
  const detail = useQuery({ queryKey: ['admin', 'notices', 'detail', noticeId], queryFn: () => fetchAdminNotice(noticeId!), enabled: canManage && !creating && !!noticeId })
  const invalid = !creating && !noticeId
  const returnWithoutSelection = noticeListWithoutSelection(returnPath)
  return <div className="space-y-6">
    <nav><Link className="text-sm font-medium text-primary-700 hover:underline" to={returnPath}>← 공지사항 목록</Link></nav>
    <div><h1 className="text-2xl font-bold">{creating ? '공지 등록' : '공지 수정'}</h1><p className="mt-1 text-sm text-neutral-500">평문 본문과 이미지, 게시 기간을 설정하고 저장 전 내용을 미리봅니다.</p></div>
    {!canManage && <Alert variant="danger">이 역할은 공지를 등록하거나 수정할 수 없습니다.</Alert>}
    {invalid && <Alert variant="danger">공지 ID가 올바르지 않습니다.</Alert>}
    {!creating && detail.isPending && !invalid && canManage && <Spinner label="공지 편집 정보 불러오는 중" />}
    {!creating && detail.isError && <Alert variant="danger">{detail.error.message}<Button variant="secondary" onClick={() => void detail.refetch()}>편집 정보 다시 조회</Button></Alert>}
    {canManage && (creating || detail.isSuccess) && <section aria-label="공지 작성"><Card className="p-5"><NoticeEditor key={noticeId ?? 'new'} notice={creating ? null : detail.data!} initialStored={creationReceipt && detail.data && sameSavedNotice(creationReceipt, detail.data) ? creationReceipt : null}
      onCreated={(created) => { void navigate(adminPaths.editNotice(created.id, scope.activeOrgId, noticeListWithSelection(returnWithoutSelection, created.id)), { replace: true, state: { createdNotice: created } }) }}
      onDeleted={() => { void navigate(returnWithoutSelection, { replace: true }) }} />
    </Card></section>}
    <div><Link className="text-sm text-primary-700 hover:underline" to={returnPath}>목록으로 돌아가기</Link></div>
  </div>
}

/** Shared full-page authoring form; its route owns the exact target. */

function NoticeEditor({
  notice,
  initialStored,
  onCreated,
  onDeleted,
}: {
  /** null이면 등록 모드. */
  notice: AdminNoticeView | null
  initialStored?: AdminNoticeView | null
  /** Opens the exact created notice so image attachments can continue. */
  onCreated: (created: AdminNoticeView) => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const active = useActiveResult()
  const [saved, setSaved] = useState<AdminNoticeView | null>(initialStored ?? null)
  const [previewOpen, setPreviewOpen] = useState(false)

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
  const edit = () => { setSaved(null) }


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
    if (!active.current) return
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
      queryClient.setQueryData(['admin', 'notices', 'detail', created.id], created)
      await invalidate()
      if (!active.current) return
      setSaved(created)
      setError(null)
      setFieldErrors({})
      toast.success('공지를 등록했습니다. 이어서 이미지를 첨부할 수 있습니다.')
      onCreated(created)
    },
    onError: onMutationError('공지를 등록하지 못했습니다.'),
  })

  const update = useMutation({
    mutationFn: () => updateAdminNotice(notice!.id, updateBody()),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['admin', 'notices', 'detail', updated.id], updated)
      await invalidate()
      if (!active.current) return
      setSaved(updated)
      setError(null)
      setFieldErrors({})
      toast.success('공지를 수정했습니다.')
    },
    onError: onMutationError('공지를 수정하지 못했습니다.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteAdminNotice(notice!.id),
    onSuccess: async () => {
      await invalidate()
      if (!active.current) return
      setDeleting(false)
      toast.success('공지를 삭제했습니다.')
      onDeleted()
    },
    onError: (err) => {
      if (!active.current) return
      setDeleting(false)
      setError(toApiError(err, '공지를 삭제하지 못했습니다.').message)
    },
  })

  const busy = create.isPending || update.isPending || remove.isPending
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSaved(null)
    const errors: Record<string, string> = {}
    if (!title.trim()) errors.title = '제목을 입력해 주세요.'
    else if (title.length > 200) errors.title = '제목은 200자 이하여야 합니다.'
    if (!body.trim()) errors.body = '본문을 입력해 주세요.'
    else if (body.length > 20_000) errors.body = '본문은 20,000자 이하여야 합니다.'
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
      {notice && (
        <p className="text-sm text-neutral-500">
          작성자 {notice.createdByName} · 등록 {formatDateTime(notice.createdAt)}
        </p>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
      {saved && (!notice || sameSavedNotice(saved, notice)) && <OperationResult stage="stored">공지 제목과 본문, 게시 기간을 저장했습니다. {NOTICE_WINDOW_LABELS[noticeWindowState(saved.startsAt, saved.endsAt)]} 설정이며 실제 독자의 조회와 팝업 노출은 게시 기간과 공개 설정을 따릅니다.</OperationResult>}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormField label="제목" required error={fieldErrors.title}>
          <Input
            value={title}
            maxLength={200}
            disabled={busy}
            onChange={(event) => { edit(); setTitle(event.target.value) }}
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
            maxLength={20_000}
            disabled={busy}
            onChange={(event) => { edit(); setBody(event.target.value) }}
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <Checkbox
            label="목록 상단 고정"
            description="공지사항 목록과 대시보드에서 먼저 보입니다."
            checked={pinned}
            disabled={busy}
            onChange={(event) => { edit(); setPinned(event.target.checked) }}
          />
          <Checkbox
            label="팝업으로 표시"
            description="게시 기간 동안 콘솔·랜딩·로그인 화면에 비차단 카드로 표시됩니다. 로그인하지 않은 방문자에게도 공개됩니다."
            checked={popup}
            disabled={busy}
            onChange={(event) => { edit(); setPopup(event.target.checked) }}
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <FormField label="게시 시작" required error={fieldErrors.startsAt}>
            <Input
              type="datetime-local"
              className="w-56"
              value={startsAt}
              disabled={busy}
              onChange={(event) => { edit(); setStartsAt(event.target.value) }}
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
              disabled={busy}
              onChange={(event) => { edit(); setEndsAt(event.target.value) }}
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-2">
          {notice && (
            <Button variant="danger" disabled={busy} onClick={() => setDeleting(true)}>
              삭제
            </Button>
          )}
          <Button variant="secondary" disabled={busy} onClick={() => setPreviewOpen((value) => !value)}>내용 미리보기</Button>
          <Button
            type="submit"
            disabled={busy}
            loading={create.isPending || update.isPending}
          >
            {notice ? '저장' : '등록'}
          </Button>
        </div>
      </form>

      {previewOpen && <section aria-label="공지 내용 미리보기" className="space-y-4 rounded border p-4"><h3 className="font-semibold">저장 전 내용 미리보기</h3><h4 className="text-lg font-semibold">{title.trim()}</h4>
        <p className="text-xs">{startsAt ? NOTICE_WINDOW_LABELS[noticeWindowState(fromDateTimeInput(startsAt)!, fromDateTimeInput(endsAt))] : '게시 시작 미지정'} · {popup ? '로그인하지 않은 방문자에게도 공개' : '로그인한 독자에게 게시'}</p>
        <NoticeContent body={body.trim()} images={notice?.images ?? []} />
        {popup && <div className="space-y-2"><h4 className="text-sm font-semibold">팝업 카드 미리보기</h4><NoticePopupCard title={title.trim() || '공지 제목'} onClose={() => setPreviewOpen(false)} footer={<Button variant="secondary" onClick={() => setPreviewOpen(false)}>미리보기 닫기</Button>}><NoticeContent body={body.trim()} images={notice?.images ?? []} variant="popup" /></NoticePopupCard></div>}
      </section>}
      <NoticeImageSection notice={notice} canManage={!busy} onChanged={invalidate} />

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
