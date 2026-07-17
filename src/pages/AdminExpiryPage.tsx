import { useState, type FormEvent } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAdminVms, fetchOrgs, updateVmPeriod, type VmSummary } from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { FilterBar } from '../components/FilterBar'
import {
  Alert,
  Badge,
  Button,
  Card,
  DdayBadge,
  FormField,
  Input,
  Modal,
  Pagination,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  VmStatusBadge,
} from '../components/ui'
import { fieldErrorsOf } from '../lib/field-errors'
import { todayKstDate } from '../lib/format'

const PAGE_SIZE = 20

type ExpiryTab = 'D7' | 'D30' | 'EXPIRED'

const TABS: { label: string; status: ExpiryTab | undefined }[] = [
  { label: '7일 이내', status: 'D7' },
  { label: '30일 이내', status: 'D30' },
  { label: '만료됨', status: 'EXPIRED' },
]

function queryParamsOf(tab: ExpiryTab) {
  if (tab === 'EXPIRED') return { expired: true as const }
  return { expiringInDays: tab === 'D7' ? 7 : 30 }
}

/** 만료 관리 — 만료 임박·만료된 VM을 모아 보고 사용 기간을 연장한다. */
export function AdminExpiryPage() {
  const { user } = useAuth()
  const isSysAdmin = user?.role === 'SYS_ADMIN'
  const [tab, setTab] = useState<ExpiryTab>('D7')
  const [orgId, setOrgId] = useState<number | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [extendTarget, setExtendTarget] = useState<VmSummary | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const params = queryParamsOf(tab)
  const vms = useQuery({
    queryKey: [
      'admin',
      'vms',
      {
        expiringInDays: 'expiringInDays' in params ? params.expiringInDays : null,
        expired: 'expired' in params ? params.expired : null,
        orgId: orgId ?? null,
        page,
        size: PAGE_SIZE,
      },
    ],
    queryFn: () => fetchAdminVms({ ...params, orgId, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: isSysAdmin })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">만료 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isSysAdmin ? '전체' : '우리 기관'} VM의 사용 기간 만료 현황입니다. 만료된 VM은
          자동으로 중지되며, 기간을 연장하면 다시 시작할 수 있습니다.
        </p>
      </div>

      <FilterBar
        tabs={TABS}
        status={tab}
        onStatus={(next) => {
          setTab(next ?? 'D7')
          setPage(0)
        }}
        isSysAdmin={isSysAdmin}
        orgId={orgId}
        onOrg={(next) => {
          setOrgId(next)
          setPage(0)
        }}
        orgs={orgs.data ?? []}
      />

      {message && <Alert variant="info">{message}</Alert>}

      {vms.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="만료 현황 불러오는 중" />
        </div>
      )}
      {vms.isError && <Alert variant="danger">{vms.error.message}</Alert>}
      {vms.isSuccess && vms.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          {tab === 'EXPIRED' ? '만료된 VM이 없습니다.' : '만료 예정 VM이 없습니다.'}
        </Card>
      )}
      {vms.isSuccess && vms.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>VM</TH>
                  <TH>종료일</TH>
                  <TH>상태</TH>
                  <TH>
                    <span className="sr-only">작업</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {vms.data.content.map((vm) => (
                  <TR key={vm.id}>
                    <TD>
                      <span className="font-medium text-neutral-900">{vm.name}</span>
                      <span className="block text-xs text-neutral-500">{vm.groupName}</span>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {vm.endDate}
                      {vm.endDate && <DdayBadge endDate={vm.endDate} className="ml-2" />}
                    </TD>
                    <TD>
                      <VmStatusBadge status={vm.status} />
                      {vm.expiryStoppedAt && (
                        <Badge variant="warning" className="ml-1">
                          자동 중지됨
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setExtendTarget(vm)}
                      >
                        기간 연장
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={vms.data.page}
            totalPages={vms.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {extendTarget && (
        <ExtendPeriodModal
          vm={extendTarget}
          onClose={() => setExtendTarget(null)}
          onDone={(text) => {
            setExtendTarget(null)
            setMessage(text)
          }}
        />
      )}
    </div>
  )
}

function ExtendPeriodModal({
  vm,
  onClose,
  onDone,
}: {
  vm: VmSummary
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const extend = useMutation({
    mutationFn: () => updateVmPeriod(vm.id, { endDate }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
      onDone('연장되었습니다. 중지된 VM은 VM 관리에서 다시 시작해 주세요.')
    },
    onError: (err) => {
      const apiError = toApiError(err, '사용 기간을 변경하지 못했습니다.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setError(apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    if (!endDate) {
      setFieldErrors({ endDate: '새 종료일을 선택해 주세요.' })
      return
    }
    extend.mutate()
  }

  return (
    <Modal open onClose={onClose} title={`기간 연장 — ${vm.name}`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-neutral-600">
          현재 종료일: <strong>{vm.endDate ?? '미지정'}</strong>. 새 종료일 당일까지 사용할
          수 있으며, 만료로 중지된 VM은 연장 후 다시 시작할 수 있습니다.
        </p>
        {error && Object.keys(fieldErrors).length === 0 && (
          <Alert variant="danger">{error}</Alert>
        )}
        <FormField label="새 종료일" required error={fieldErrors.endDate}>
          <Input
            type="date"
            min={todayKstDate()}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="w-44"
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" loading={extend.isPending}>
            연장
          </Button>
        </div>
      </form>
    </Modal>
  )
}
