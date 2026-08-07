import { useState, type FormEvent } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  createVmPortForwarding,
  deleteVmPortForwarding,
  fetchVmPortForwardings,
  type PortForwardingView,
  type PortMappingProto,
  type VmDetail,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { fieldErrorsOf } from '../lib/field-errors'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorSummary,
  FormField,
  InfoTip,
  Input,
  PortForwardApplyStateBadge,
  PortMappingStatusBadge,
  Select,
  Spinner,
  useToast,
} from './ui'
import { useVmGroupRole } from './vm-group-role'

/** 반영 대기(PENDING) 매핑이 있을 때의 폴링 주기 — 릴레이 폴링 수렴을 따라간다. */
const PENDING_POLL_MS = import.meta.env.MODE === 'test' ? 50 : 10_000
/** 적용 실패(FAILED)만 남았을 때의 완만한 폴링 주기 — 재수렴은 관리자 개입 이후다. */
const FAILED_POLL_MS = import.meta.env.MODE === 'test' ? 250 : 30_000

/** 요약 Alert에서 필드 키 대신 보여줄 이름. */
const FIELD_LABELS: Record<string, string> = {
  proto: '프로토콜',
  targetPort: '대상 포트',
}

/** 클라이언트 측 대상 포트 사전 검증 (서버 422 규칙과 동일: 1–65535). */
function targetPortError(raw: string): string | null {
  if (!/^\d+$/.test(raw.trim())) return '포트 번호를 입력해 주세요.'
  const port = Number(raw.trim())
  if (port < 1 || port > 65535) return '포트는 1–65535 범위여야 합니다.'
  return null
}

/**
 * 포트포워딩 절 — HTTP 공개와 함께 '도메인·포트' 탭에 산다. 둘 다 이 VM을 바깥에
 * 닿게 하는 수단이라 한 화면에서 고른다: 웹이면 위쪽 공개, 그 밖의 TCP/UDP면 이쪽.
 * 그룹 역할이 기준이다 — 구성원은 상태를 읽고, 소유자·편집자만 만들거나 지운다.
 */
export function VmPortForwardingSection({ vm }: { vm: VmDetail }) {
  const { canMutate, rolePending, roleFallback } = useVmGroupRole(vm)
  const forwardings = useQuery({
    queryKey: ['vms', vm.id, 'port-forwardings'],
    queryFn: () => fetchVmPortForwardings(vm.id),
    // 반영 대기(PENDING)가 있으면 릴레이 수렴을 따라 폴링하고, 실패만 남으면
    // 완만하게, 전부 활성이면 폴링을 멈춘다.
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      if (data.some((f) => f.applyState === 'PENDING')) return PENDING_POLL_MS
      if (data.some((f) => f.applyState === 'FAILED')) return FAILED_POLL_MS
      return false
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          포트포워딩
          <InfoTip label="포트포워딩 도움말">
            릴레이의 공인 포트 하나를 VM의 TCP/UDP 포트 하나로 넘겨 외부에
            공개합니다. 공인 포트는 릴레이 대역에서 자동 할당되며 직접 정할 수
            없습니다. 위쪽 HTTP 서비스 공개가 웹 주소를 붙이는 수단이라면, 이쪽은
            웹이 아닌 포트를 그대로 여는 수단입니다.
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-neutral-600">
          VM 내부 포트를 릴레이 공인 포트로 외부에 공개합니다. 적용은 비동기로
          수렴하며, 외부에서 들어온 연결은 VM에 릴레이 주소로 보입니다.
        </p>

        <Alert variant="info" title="본인만 접속한다면 SSH 로컬 포워딩으로 충분합니다">
          <div className="space-y-1">
            <p>
              외부 공개 없이 내 컴퓨터에서만 접근하려면 SSH 로컬 포워딩을 사용할
              수 있습니다.
            </p>
            <code className="block overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-100">
              {`ssh -L <로컬포트>:localhost:<VM포트> ${vm.hostname}@${vm.sshHost}`}
            </code>
          </div>
        </Alert>

        {roleFallback ??
          (rolePending ? (
            <div className="flex justify-center py-4">
              <Spinner label="권한 정보 확인 중" />
            </div>
          ) : canMutate ? (
            <CreateForwardingForm vm={vm} />
          ) : (
            <p className="text-sm text-neutral-500">
              포트포워딩 생성·삭제는 그룹의 소유자·편집자만 할 수 있습니다.
            </p>
          ))}

        <ForwardingList vm={vm} canMutate={canMutate} query={forwardings} />
      </CardContent>
    </Card>
  )
}

function CreateForwardingForm({ vm }: { vm: VmDetail }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [proto, setProto] = useState<PortMappingProto>('TCP')
  const [targetPort, setTargetPort] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // 계약: RUNNING + 내부 IP 할당 상태에서만 생성할 수 있다 (그 외 409).
  const creatable = vm.status === 'RUNNING' && vm.ipAddress != null

  const create = useMutation({
    mutationFn: () =>
      createVmPortForwarding(vm.id, { proto, targetPort: Number(targetPort.trim()) }),
    onSuccess: async (created) => {
      setError(null)
      setFieldErrors({})
      setTargetPort('')
      toast.success(
        `포트포워딩을 만들었습니다. 공인 포트 ${created.publicPort}이(가) 곧 열립니다.`,
      )
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
    },
    onError: (err) => {
      const apiError = toApiError(err, '포트포워딩을 만들지 못했습니다.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setError(apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    const portError = targetPortError(targetPort)
    if (portError) {
      setFieldErrors({ targetPort: portError })
      return
    }
    create.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {!creatable && (
        <Alert variant="warning">
          실행 중이고 내부 IP가 할당된 VM만 포트포워딩을 만들 수 있습니다.
        </Alert>
      )}
      <ErrorSummary
        error={error}
        fieldErrors={fieldErrors}
        slots={['proto', 'targetPort']}
        fieldLabels={FIELD_LABELS}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="프로토콜" required error={fieldErrors.proto}>
          <Select
            value={proto}
            onChange={(event) => setProto(event.target.value as PortMappingProto)}
          >
            <option value="TCP">TCP</option>
            <option value="UDP">UDP</option>
          </Select>
        </FormField>
        <FormField
          label="대상 포트"
          required
          error={fieldErrors.targetPort}
          description="VM 내부에서 열려 있는 포트 (1–65535). 공인 포트는 자동 할당됩니다."
        >
          <Input
            inputMode="numeric"
            placeholder="8080"
            value={targetPort}
            onChange={(event) => setTargetPort(event.target.value)}
          />
        </FormField>
      </div>
      <Button
        type="submit"
        loading={create.isPending}
        disabled={!creatable || targetPort.trim() === ''}
      >
        포트포워딩 만들기
      </Button>
    </form>
  )
}

function ForwardingList({
  vm,
  canMutate,
  query,
}: {
  vm: VmDetail
  canMutate: boolean
  query: UseQueryResult<PortForwardingView[], Error>
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)

  const remove = useMutation({
    mutationFn: (portForwardingId: number) =>
      deleteVmPortForwarding(vm.id, portForwardingId),
    onSuccess: async (data) => {
      setError(null)
      toast.success(data.message)
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
    },
    onError: async (err) => {
      const apiError = toApiError(err, '포트포워딩 삭제를 접수하지 못했습니다.')
      setError(apiError.message)
      // 이미 서버에서 사라진 매핑(404)이면 목록을 다시 불러와 낡은 행을 정리한다.
      if (apiError.problem?.status === 404) {
        await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
      }
    },
  })

  if (query.isPending) {
    return (
      <div className="flex justify-center py-6">
        <Spinner label="포트포워딩 목록 불러오는 중" />
      </div>
    )
  }
  if (query.isError) return <Alert variant="danger">{query.error.message}</Alert>
  if (query.data.length === 0) {
    return <p className="py-2 text-sm text-neutral-500">설정된 포트포워딩이 없습니다.</p>
  }

  return (
    <div className="space-y-2 border-t border-neutral-100 pt-4">
      {error && <Alert variant="danger">{error}</Alert>}
      <ul className="space-y-2">
        {query.data.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm text-neutral-800">
              {f.publicHost ?? '릴레이 주소 미설정'}:{f.publicPort}
            </code>
            <span aria-hidden="true" className="text-neutral-400">
              →
            </span>
            <code className="font-mono text-sm text-neutral-800">
              {f.targetPort}/{f.proto}
            </code>
            <PortForwardApplyStateBadge state={f.applyState} />
            {f.status === 'SUSPENDED' && <PortMappingStatusBadge status={f.status} />}
            {canMutate && (
              <Button
                variant="danger"
                size="sm"
                loading={remove.isPending && remove.variables === f.id}
                onClick={() => remove.mutate(f.id)}
              >
                삭제
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-neutral-500">
        정지됨 상태는 관리자 개입에 의한 것입니다. 문의는 관리자에게 해 주세요.
      </p>
    </div>
  )
}
