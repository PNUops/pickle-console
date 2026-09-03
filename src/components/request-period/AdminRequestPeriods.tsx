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

const SLOTS = ['name', 'displayName', 'endDate', 'displayOrder']

/**
 * 신청 화면이 제공할 사용 기간 관리.
 *
 * 이 목록은 **이미 지난 항목까지** 담는다. 그것이 이 화면의 쓸모다. 날짜가 절대값이라
 * 학기마다 갱신해야 하는데, 지난 항목이 보이지 않으면 이번 학기 항목이 빠졌다는 것을
 * 알아챌 방법이 없다.
 */
export function AdminRequestPeriods({ isSysAdmin }: { isSysAdmin: boolean }) {
  const periods = useQuery({
    queryKey: ['admin', 'request-periods'],
    queryFn: fetchAdminRequestPeriods,
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminRequestPeriod | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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
            신청 화면이 고를 수 있게 제공하는 기간입니다. 날짜가 절대값이라 학기마다
            갱신해야 하고, 이미 지난 항목은 신청 화면에 나오지 않습니다. 종료일이 없는
            항목이 무기한이며, 그것을 만들지 않으면 무기한은 신청할 수 없습니다.
          </p>
        </div>
        {isSysAdmin && (
          <Button size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
            기간 추가
          </Button>
        )}
      </div>

      {notice && <Alert variant="success">{notice}</Alert>}
      {periods.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="사용 기간 목록 불러오는 중" />
        </div>
      )}
      {periods.isError && <Alert variant="danger">{periods.error.message}</Alert>}
      {periods.isSuccess && periods.data.length === 0 && (
        <Card className="p-8 text-center text-sm text-foreground-muted">
          등록된 사용 기간이 없습니다. 신청자는 날짜를 직접 적게 됩니다.
        </Card>
      )}
      {periods.isSuccess && periods.data.length > 0 && (
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
              {periods.data.map((period) => (
                <TR key={period.id}>
                  <TD className="font-medium text-foreground-primary">{period.displayName}</TD>
                  <TD className="font-mono text-xs text-foreground-muted">{period.name}</TD>
                  <TD className="whitespace-nowrap">{period.endDate ?? '무기한'}</TD>
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

      {createOpen && <CreatePeriodModal onClose={() => setCreateOpen(false)} onDone={done} />}
      {editTarget && (
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
        endDate: endDate || null,
        displayOrder: Number(displayOrder) || 0,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'request-periods'] })
      await queryClient.invalidateQueries({ queryKey: ['request-periods'] })
      onDone('사용 기간을 추가했습니다.')
    },
    onError: (error) => {
      const apiError = toApiError(error, '사용 기간을 만들지 못했습니다.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setFormError(apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const errors: Record<string, string> = {}
    if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$|^[a-z0-9]$/.test(name.trim()))
      errors.name = '이름은 소문자와 숫자, 하이픈 1~40자여야 합니다.'
    if (!displayName.trim()) errors.displayName = '표시명을 입력해 주세요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    create.mutate()
  }

  return (
    <Modal open onClose={onClose} title="사용 기간 추가">
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorSummary error={formError} fieldErrors={fieldErrors} slots={SLOTS} />
        <FormField label="이름" required error={fieldErrors.name} description="기록에 남는 식별자입니다. 만든 뒤에는 바꿀 수 없습니다.">
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
        <FormField
          label="종료일"
          error={fieldErrors.endDate}
          description="비우면 무기한 항목이 됩니다. 종료하면 안 되는 교내 서비스가 그것을 고릅니다."
        >
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
        <FormField label="표시 순서" error={fieldErrors.displayOrder} description="작을수록 앞에 옵니다.">
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
  const [endDate, setEndDate] = useState(period.endDate ?? '')
  const [indefinite, setIndefinite] = useState(period.endDate == null)
  const [displayOrder, setDisplayOrder] = useState(String(period.displayOrder))
  const [retired, setRetired] = useState(period.status === 'DISABLED')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      updateAdminRequestPeriod(period.id, {
        displayName: displayName.trim(),
        // 서버는 날짜 지정과 지우기를 함께 받지 않는다. 화면도 한쪽만 보낸다.
        endDate: indefinite ? null : endDate || null,
        clearEndDate: indefinite ? true : null,
        status: retired ? 'DISABLED' : 'ACTIVE',
        displayOrder: Number(displayOrder) || 0,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'request-periods'] })
      await queryClient.invalidateQueries({ queryKey: ['request-periods'] })
      onDone('사용 기간을 수정했습니다.')
    },
    onError: (error) => {
      const apiError = toApiError(error, '사용 기간을 수정하지 못했습니다.')
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
        <Checkbox
          label="무기한"
          description="종료일 없이 제공합니다."
          checked={indefinite}
          onChange={(e) => setIndefinite(e.target.checked)}
        />
        {!indefinite && (
          <FormField label="종료일" error={fieldErrors.endDate}>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormField>
        )}
        <FormField label="표시 순서" error={fieldErrors.displayOrder}>
          <Input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
          />
        </FormField>
        <Checkbox
          label="은퇴"
          description="신청 화면에서 감춥니다. 이미 낸 신청은 그대로입니다."
          checked={retired}
          onChange={(e) => setRetired(e.target.checked)}
        />
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
