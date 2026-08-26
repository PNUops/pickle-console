import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAdminVms, type VmSummary } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { canOperateVm, isSysTier } from '../auth/permissions'
import { ExtendVmPeriodModal } from '../components/ExtendVmPeriodModal'
import { FilterBar } from '../components/FilterBar'
import { useOrgOptions } from '../lib/use-org-options'
import {
  Alert,
  Badge,
  Button,
  Card,
  DdayBadge,
  Pagination,
  PermissionNotice,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  VmStatusBadge,
} from '../components/ui'

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
  const isSysAdmin = !!user && isSysTier(user.role)
  // 기간 연장은 운영 역할만 — 열람 역할은 조회만이며, 기관 계층의 연장은 자기가
  // 운영하는 기관의 VM에 한한다 (서버 강제).
  const canExtend = !!user && canOperateVm(user.role)
  const [tab, setTab] = useState<ExpiryTab>('D7')
  const [orgId, setOrgId] = useState<string | undefined>(undefined)
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
  // 기관 선택지는 계정이 지정할 수 있는 기관만 — 보유하지 않은 기관은 404다.
  const orgOptions = useOrgOptions()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">만료 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isSysAdmin ? '전체' : '우리 기관'} VM의 사용 기간 만료 현황입니다. 만료된
          VM은 자동으로 중지되며, 기간을 연장하면 다시 시작할 수 있습니다.
        </p>
      </div>

      <FilterBar
        tabs={TABS}
        status={tab}
        onStatus={(next) => {
          setTab(next ?? 'D7')
          setPage(0)
        }}
        showOrgFilter={orgOptions.length > 1}
        orgId={orgId}
        onOrg={(next) => {
          setOrgId(next)
          setPage(0)
        }}
        orgs={orgOptions}
      />

      {message && <Alert variant="info">{message}</Alert>}
      {!canExtend && (
        <PermissionNotice>
          기간 연장은 기관 운영자 이상과 시스템 운영자, 시스템 관리자만 수행할 수
          있습니다.
        </PermissionNotice>
      )}

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
                      <span className="block text-xs text-neutral-500">{vm.workspaceName}</span>
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
                        disabled={!canExtend}
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
        <ExtendVmPeriodModal
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
