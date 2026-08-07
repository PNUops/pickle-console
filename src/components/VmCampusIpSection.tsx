import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelVmCampusIpRequest,
  createVmCampusIpRequest,
  fetchVmCampusIpRequests,
  type CampusIpRequestView,
  type VmDetail,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatDateTime } from '../lib/format'
import {
  Alert,
  Button,
  CampusIpStatusBadge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorSummary,
  FormField,
  InfoTip,
  Input,
  Spinner,
  Textarea,
  useToast,
} from './ui'

/** 요약 Alert에서 필드 키 대신 보여줄 이름. */
const FIELD_LABELS: Record<string, string> = {
  purpose: '신청 목적',
  ports: '개방 포트',
}

/** 진행 중(활성)으로 취급하는 상태 — VM당 1건 제한에 걸리는 상태와 동일. */
const ACTIVE_STATUSES: CampusIpRequestView['status'][] = [
  'REQUESTED',
  'APPROVED',
  'GRANTED',
]

/**
 * 쉼표·공백 구분 포트 목록 입력을 정수 배열로 파싱한다 (서버 규칙과 동일:
 * 각 1–65535, 최대 32개). 실패하면 오류 메시지를 돌려준다.
 */
function parsePorts(raw: string): { ports: number[] } | { error: string } {
  const tokens = raw.split(/[,\s]+/).filter((t) => t !== '')
  if (tokens.length === 0) return { error: '개방이 필요한 포트를 1개 이상 입력해 주세요.' }
  const ports: number[] = []
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) return { error: `'${token}'은(는) 포트 번호가 아닙니다.` }
    const port = Number(token)
    if (port < 1 || port > 65535) return { error: '포트는 1–65535 범위여야 합니다.' }
    if (!ports.includes(port)) ports.push(port)
  }
  if (ports.length > 32) return { error: '포트는 최대 32개까지 신청할 수 있습니다.' }
  return { ports }
}

/**
 * 캠퍼스 IP 절 — 그룹 구성원이면 상태를 읽고, 소유자·편집자만 신청·취소한다
 * (포트포워딩과 같은 기준). 활성 신청이 있으면 상태 카드를, 없으면 신청 폼을
 * 보여준다.
 */
export function VmCampusIpSection({
  vm,
  canMutate,
  rolePending,
}: {
  vm: VmDetail
  canMutate: boolean
  /** 그룹 역할 조회 중 — 읽기 전용 문구가 잠깐 번쩍이지 않게 로딩으로 대체한다. */
  rolePending: boolean
}) {
  const requests = useQuery({
    queryKey: ['vms', vm.id, 'campus-ip-requests'],
    queryFn: () => fetchVmCampusIpRequests(vm.id),
  })

  // 목록은 최신순 — 활성 신청은 VM당 1건뿐이므로 첫 활성 행이 현재 신청이다.
  const active = requests.data?.find((r) => ACTIVE_STATUSES.includes(r.status)) ?? null
  const latestClosed =
    requests.data?.find((r) => !ACTIVE_STATUSES.includes(r.status)) ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          캠퍼스 IP
          <InfoTip label="캠퍼스 IP 도움말">
            VM을 캠퍼스 네트워크의 교내 IP(10.x)로 연결하는 신청입니다. 관리자
            승인 후 주소가 부여되며, 부여된 주소는 기본 차단 상태로 신청한
            포트만 열립니다.
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-neutral-600">
          승인되면 VM이 캠퍼스 네트워크의 교내 IP(10.x)로 연결됩니다. 부여된
          주소는 기본 차단 상태이며 신청한 포트만 개방됩니다. 이후 공인 IP
          연결(NAT)이 필요하면 정보전산원 포털에서 직접 신청하며, 상세 절차는
          메뉴얼로 제공될 예정입니다.
        </p>

        {(requests.isPending || rolePending) && (
          <div className="flex justify-center py-6">
            <Spinner label="캠퍼스 IP 신청 이력 불러오는 중" />
          </div>
        )}
        {requests.isError && <Alert variant="danger">{requests.error.message}</Alert>}

        {requests.isSuccess &&
          !rolePending &&
          (active ? (
            <ActiveRequestCard vm={vm} request={active} canMutate={canMutate} />
          ) : (
            <>
              {latestClosed && <ClosedRequestNotice request={latestClosed} />}
              {canMutate ? (
                <RequestForm vm={vm} />
              ) : (
                <p className="text-sm text-neutral-500">
                  캠퍼스 IP 신청·취소는 그룹의 소유자·편집자만 할 수 있습니다.
                </p>
              )}
            </>
          ))}
      </CardContent>
    </Card>
  )
}

function SummaryField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{children}</dd>
    </div>
  )
}

/* ─── 현재(활성) 신청 상태 카드 ─── */

function ActiveRequestCard({
  vm,
  request,
  canMutate,
}: {
  vm: VmDetail
  request: CampusIpRequestView
  canMutate: boolean
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)

  const cancel = useMutation({
    mutationFn: () => cancelVmCampusIpRequest(vm.id, request.id),
    onSuccess: async () => {
      setError(null)
      toast.success('캠퍼스 IP 신청을 취소했습니다.')
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
    },
    onError: async (err) => {
      setError(toApiError(err, '캠퍼스 IP 신청을 취소하지 못했습니다.').message)
      // 409(이미 활성 신청 존재)면 화면이 뒤처진 것이므로 최신 상태를 다시 불러온다.
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
    },
  })

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-800">현재 신청</h3>
          <CampusIpStatusBadge status={request.status} />
        </div>
        {canMutate && request.status === 'REQUESTED' && (
          <Button
            variant="secondary"
            size="sm"
            loading={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            신청 취소
          </Button>
        )}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {request.status === 'REQUESTED' && (
        <p className="text-sm text-neutral-600">관리자 검토를 기다리고 있습니다.</p>
      )}
      {request.status === 'APPROVED' && (
        <p className="text-sm text-neutral-600">
          승인되었습니다. VM을 캠퍼스 네트워크에 연결하는 작업이 끝나면 부여된
          교내 IP가 여기에 표시됩니다.
        </p>
      )}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        {request.status === 'GRANTED' && (
          <SummaryField label="연결된 교내 IP">
            <code className="font-mono">{request.grantedAddress ?? '—'}</code>
          </SummaryField>
        )}
        <SummaryField label="신청 목적">{request.purpose}</SummaryField>
        <SummaryField label="개방 포트">{request.ports.join(', ')}</SummaryField>
        <SummaryField label="신청일">{formatDateTime(request.createdAt)}</SummaryField>
        {request.processedAt && (
          <SummaryField label="처리일">{formatDateTime(request.processedAt)}</SummaryField>
        )}
      </dl>
      {request.adminNote && (
        <p className="text-sm text-neutral-600">
          <span className="font-medium text-neutral-700">관리자 메모:</span>{' '}
          {request.adminNote}
        </p>
      )}
    </section>
  )
}

/** 종료된(반려·회수) 최신 신청 안내 — 새 신청 폼 위에 참고로 남긴다. */
function ClosedRequestNotice({ request }: { request: CampusIpRequestView }) {
  return (
    <Alert variant="info">
      <div className="flex flex-wrap items-center gap-2">
        <CampusIpStatusBadge status={request.status} />
        <span>
          {formatDateTime(request.createdAt)} 신청이{' '}
          {request.status === 'REJECTED' ? '반려되었습니다.' : '회수되었습니다.'}
          {request.adminNote && ` 사유: ${request.adminNote}`}
        </span>
      </div>
    </Alert>
  )
}

/* ─── 신청 폼 ─── */

function RequestForm({ vm }: { vm: VmDetail }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [purpose, setPurpose] = useState('')
  const [portsRaw, setPortsRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: (body: { purpose: string; ports: number[] }) =>
      createVmCampusIpRequest(vm.id, body),
    onSuccess: async () => {
      setError(null)
      setFieldErrors({})
      setPurpose('')
      setPortsRaw('')
      toast.success('캠퍼스 IP 신청을 접수했습니다. 관리자 검토 후 연결됩니다.')
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
    },
    onError: async (err) => {
      const apiError = toApiError(err, '캠퍼스 IP 신청을 접수하지 못했습니다.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      // 409(이미 활성 신청 존재)면 최신 이력을 다시 불러와 상태 카드로 전환하는데,
      // 그러면 이 폼과 함께 인라인 오류도 사라진다 — 사유가 남도록 토스트로 알린다.
      if (apiError.problem?.status === 409) {
        setError(null)
        toast.error(apiError.message)
        await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
        return
      }
      setError(apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    if (purpose.trim() === '') {
      setFieldErrors({ purpose: '신청 목적을 입력해 주세요.' })
      return
    }
    const parsed = parsePorts(portsRaw)
    if ('error' in parsed) {
      setFieldErrors({ ports: parsed.error })
      return
    }
    create.mutate({ purpose: purpose.trim(), ports: parsed.ports })
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ErrorSummary
        error={error}
        fieldErrors={fieldErrors}
        slots={['purpose', 'ports']}
        fieldLabels={FIELD_LABELS}
      />
      <FormField
        label="신청 목적"
        required
        error={fieldErrors.purpose}
        description="어떤 일에 쓰는지 알려 주시면 관리자가 검토 후 연결합니다."
      >
        <Textarea
          rows={3}
          value={purpose}
          maxLength={1000}
          placeholder="예: 학과 실습 서버 외부 연동 (교내망 고정 주소 필요)"
          onChange={(event) => setPurpose(event.target.value)}
        />
      </FormField>
      <FormField
        label="개방 포트"
        required
        error={fieldErrors.ports}
        description="쉼표로 구분해 입력합니다 (예: 80, 443). 여기 적은 포트만 열립니다."
        className="max-w-md"
      >
        <Input
          value={portsRaw}
          placeholder="80, 443"
          onChange={(event) => setPortsRaw(event.target.value)}
        />
      </FormField>
      <Button
        type="submit"
        loading={create.isPending}
        disabled={purpose.trim() === '' || portsRaw.trim() === ''}
      >
        캠퍼스 IP 신청
      </Button>
    </form>
  )
}
