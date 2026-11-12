import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAdminRequestPeriod,
  fetchAdminRequestPeriods,
  updateAdminRequestPeriod,
  type AdminRequestPeriod,
} from '../../api/queries'
import { toApiError } from '../../api/problem'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ErrorSummary,
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
} from '../ui'
import { fieldErrorsOf } from '../../lib/field-errors'
import { filterCatalogue, orderedPeriods, type CatalogueStatus } from '../../lib/admin-catalogue'

const SLOTS = ['name', 'displayName', 'endDate', 'displayOrder']

/**
 * 신청 화면이 제공할 사용 기간 관리.
 *
 * 이 목록은 **이미 지난 항목까지** 담는다. 그것이 이 화면의 쓸모다. 날짜가 절대값이라
 * 학기마다 갱신해야 하는데, 지난 항목이 보이지 않으면 이번 학기 항목이 빠졌다는 것을
 * 알아챌 방법이 없다.
 */
export function AdminRequestPeriods({ isSysAdmin, q = '', status = 'ALL' }: { isSysAdmin: boolean; q?: string; status?: CatalogueStatus }) {
  const periods = useQuery({
    queryKey: ['admin', 'request-periods'],
    queryFn: fetchAdminRequestPeriods,
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminRequestPeriod | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const rows = filterCatalogue(orderedPeriods(periods.data ?? []), q, status)

  const done = (message: string) => {
    setNotice(message)
    setCreateOpen(false)
    setEditTarget(null)
  }

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground-primary">사용 기간</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            학기마다 종료일을 확인하고 갱신해 주세요. 종료일이 지난 항목은 신청 화면에 나오지 않아요. 무기한은 신청자가 신청 화면에서 따로 골라요.
          </p>
        </div>
        {isSysAdmin && (
          <Button size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
            기간 추가
          </Button>
        )}
      </div>
      <p className="text-sm text-foreground-muted">종료일과 은퇴 설정은 이후 신청의 선택지에 적용해요. 이미 저장된 요청 종료일과 부여 기간은 유지돼요. 표시명을 바꾸면 기존 신청에도 새 이름이 표시돼요.</p>

      {notice && <Alert variant="success">{notice}</Alert>}
      {periods.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="사용 기간 목록 불러오는 중" />
        </div>
      )}
      {periods.isError && <Alert variant="danger">{periods.error.message}</Alert>}
      {periods.isSuccess && rows.length === 0 && (
        <Card className="p-8 text-center text-sm text-foreground-muted">
          {periods.data.length === 0 ? '등록된 사용 기간이 없어요. 신청자는 종료일을 직접 정하거나 무기한을 고를 수 있어요.' : '검색 조건에 맞는 사용 기간이 없어요.'}
        </Card>
      )}
      {periods.isSuccess && rows.length > 0 && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>표시명</TH>
                <TH>이름</TH>
                <TH>종료일</TH>
                <TH>상태</TH>
                <TH>순서</TH>
                {isSysAdmin && (
                  <TH>
                    <span className="sr-only">작업</span>
                  </TH>
                )}
              </TR>
            </THead>
            <TBody>
              {rows.map((period) => (
                <TR key={period.id}>
                  <TD className="font-medium text-foreground-primary">{period.displayName}</TD>
                  <TD className="font-mono text-xs text-foreground-muted">{period.name}</TD>
                  <TD className="whitespace-nowrap">{period.endDate}</TD>
                  <TD className="space-x-1 whitespace-nowrap">
                    <Badge variant={period.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {period.status === 'ACTIVE' ? '활성' : '은퇴'}
                    </Badge>
                    {/* 내린 것과 지난 것은 다른 상태다. 지난 항목은 손대지 않아도 사라진다. */}
                    {period.expired && <Badge variant="warning">기간 지남</Badge>}
                  </TD>
                  <TD className="text-xs text-foreground-muted">{period.displayOrder}</TD>
                  {isSysAdmin && (
                    <TD className="text-right whitespace-nowrap">
                      <Button variant="secondary" size="sm" onClick={() => setEditTarget(period)}>
                        수정
                      </Button>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {isSysAdmin && createOpen && <CreatePeriodModal onClose={() => setCreateOpen(false)} onDone={done} />}
      {isSysAdmin && editTarget && (
        <EditPeriodModal
          period={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={done}
        />
      )}
    </section>
  )
}

function CreatePeriodModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [endDate, setEndDate] = useState('')
  const [displayOrder, setDisplayOrder] = useState('0')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      createAdminRequestPeriod({
        name: name.trim(),
        displayName: displayName.trim(),
        endDate,
        displayOrder: Number(displayOrder) || 0,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'request-periods'] })
      await queryClient.invalidateQueries({ queryKey: ['request-periods'] })
      onDone('사용 기간을 추가했어요.')
    },
    onError: (error) => {
      const apiError = toApiError(error, '사용 기간 추가 결과를 확인하지 못했어요.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setFormError(apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const errors: Record<string, string> = {}
    if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$|^[a-z0-9]$/.test(name.trim()))
      errors.name = '이름은 소문자와 숫자, 하이픈으로 1~40자를 입력해 주세요. 처음과 끝에는 하이픈을 쓸 수 없어요.'
    if (!displayName.trim()) errors.displayName = '표시명을 입력해 주세요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    create.mutate()
  }

  return (
    <Modal open onClose={onClose} title="사용 기간 추가">
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorSummary error={formError} fieldErrors={fieldErrors} slots={SLOTS} />
        <FormField label="이름" required error={fieldErrors.name} description="기록에 남는 식별자예요. 만든 뒤에는 바꿀 수 없어요.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="term-2026-1" />
        </FormField>
        <FormField label="표시명" required error={fieldErrors.displayName}>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            placeholder="2026학년도 1학기"
          />
        </FormField>
        <FormField label="종료일" required error={fieldErrors.endDate}>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
        <FormField label="표시 순서" error={fieldErrors.displayOrder} description="작을수록 앞에 나와요.">
          <Input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>
            취소
          </Button>
          <Button type="submit" loading={create.isPending}>
            추가
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function EditPeriodModal({
  period,
  onClose,
  onDone,
}: {
  period: AdminRequestPeriod
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(period.displayName)
  const [endDate, setEndDate] = useState(period.endDate)
  const [displayOrder, setDisplayOrder] = useState(String(period.displayOrder))
  const [retired, setRetired] = useState(period.status === 'DISABLED')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      updateAdminRequestPeriod(period.id, {
        displayName: displayName.trim(),
        endDate: endDate || null,
        status: retired ? 'DISABLED' : 'ACTIVE',
        displayOrder: Number(displayOrder) || 0,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'request-periods'] })
      await queryClient.invalidateQueries({ queryKey: ['request-periods'] })
      onDone('사용 기간을 수정했어요.')
    },
    onError: (error) => {
      const apiError = toApiError(error, '사용 기간 수정 결과를 확인하지 못했어요.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setFormError(apiError.message)
    },
  })

  return (
    <Modal open onClose={onClose} title="사용 기간 수정">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          setFormError(null)
          save.mutate()
        }}
      >
        <ErrorSummary error={formError} fieldErrors={fieldErrors} slots={SLOTS} />
        <FormField label="표시명" error={fieldErrors.displayName}>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
          />
        </FormField>
        <FormField label="종료일" error={fieldErrors.endDate}>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
        <FormField label="표시 순서" error={fieldErrors.displayOrder}>
          <Input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
          />
        </FormField>
        <Checkbox
          label="은퇴"
          description="이후 신청의 선택지에서 숨겨요."
          checked={retired}
          onChange={(e) => setRetired(e.target.checked)}
        />
        <p className="text-sm text-foreground-muted">표시명을 바꾸면 기존 신청에도 새 이름이 표시돼요. 종료일을 바꾸거나 은퇴해도 저장된 신청 날짜와 부여 기간은 유지돼요.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>
            취소
          </Button>
          <Button type="submit" loading={save.isPending}>
            저장
          </Button>
        </div>
      </form>
    </Modal>
  )
}
