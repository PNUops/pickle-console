import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createVmDomain,
  type PublicationView,
  type VmDetail,
} from '../../api/queries'
import { toApiError } from '../../api/problem'
import { fieldErrorsOf } from '../../lib/field-errors'
import {
  CUSTOM_DOMAIN_FORMAT_MESSAGE,
  HOSTNAME_RE,
  normalizeCustomDomain,
} from '../../lib/validation'
import { Alert, Button, Drawer, ErrorSummary, FormField, Input } from '../ui'
import { LiveDomainBody } from './DomainDrawer'
import { DOMAIN_FIELD_LABELS, portFieldError } from './domain-form'

interface ConnectCustomDomainDrawerProps {
  vm: VmDetail
  open: boolean
  onClose: () => void
  defaultPort: string
  onAccepted: (pub: PublicationView, port: number) => void
}

/**
 * 내 도메인 연결 드로어 — 접수 순간 후속 작업(DNS 레코드 등록 → 검증 대기)이
 * 이어지므로, 접수에 성공하면 같은 드로어가 도메인 상세로 전환되어 레코드
 * 표가 바로 보인다.
 */
export function ConnectCustomDomainDrawer({
  vm,
  open,
  onClose,
  defaultPort,
  onAccepted,
}: ConnectCustomDomainDrawerProps) {
  const [accepted, setAccepted] = useState<PublicationView | null>(null)

  const close = () => {
    setAccepted(null)
    onClose()
  }

  // 접수 후에는 폴링으로 갱신되는 서버 상태를 우선하고, 아직 반영 전이면
  // 접수 응답을 그대로 보여준다.
  const livePub = accepted
    ? (vm.publications.find((p) => p.domain.id === accepted.domain.id) ?? accepted)
    : null

  return (
    <Drawer
      open={open}
      onClose={close}
      title={livePub ? livePub.fqdn : '내 도메인 연결'}
    >
      {livePub ? (
        <LiveDomainBody
          vm={vm}
          pub={livePub}
          canMutate
          onReleased={close}
          onPortUsed={() => {}}
          notice={
            <Alert variant="info">
              연결을 접수했습니다. 아래 DNS 레코드를 추가하면 확인이 자동으로
              진행됩니다.
            </Alert>
          }
        />
      ) : (
        <ConnectForm
          vm={vm}
          defaultPort={defaultPort}
          onAccepted={(pub, port) => {
            setAccepted(pub)
            onAccepted(pub, port)
          }}
        />
      )}
    </Drawer>
  )
}

function ConnectForm({
  vm,
  defaultPort,
  onAccepted,
}: {
  vm: VmDetail
  defaultPort: string
  onAccepted: (pub: PublicationView, port: number) => void
}) {
  const queryClient = useQueryClient()
  const [customDomain, setCustomDomain] = useState('')
  const [port, setPort] = useState(defaultPort)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const connect = useMutation({
    mutationFn: () =>
      createVmDomain(vm.id, {
        // 신청서와 같은 규칙: trim+lowercase 정규화한 값을 전송한다.
        customDomain: normalizeCustomDomain(customDomain),
        port: Number(port),
      }),
    onSuccess: async (pub) => {
      setError(null)
      setFieldErrors({})
      onAccepted(pub, Number(port))
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (err) => {
      const apiError = toApiError(err, '도메인 연결을 접수하지 못했습니다.')
      if (apiError.code === 'DOMAIN_FQDN_TAKEN') {
        setFieldErrors({
          customDomain: '이미 사용 중인 이름입니다. 다른 이름을 입력해 주세요.',
        })
        setError(apiError.message)
        return
      }
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setError(apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    const domain = normalizeCustomDomain(customDomain)
    if (!HOSTNAME_RE.test(domain)) {
      setFieldErrors({ customDomain: CUSTOM_DOMAIN_FORMAT_MESSAGE })
      return
    }
    const portError = portFieldError(port)
    if (portError) {
      setFieldErrors({ port: portError })
      return
    }
    connect.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-neutral-600">
        내가 소유한 도메인을 연결합니다. 접수하면 안내되는 DNS 레코드를 등록해야
        소유 확인과 인증서 발급이 진행됩니다.
      </p>
      {error && (
        <ErrorSummary
          error={error}
          fieldErrors={fieldErrors}
          slots={['customDomain', 'port']}
          fieldLabels={DOMAIN_FIELD_LABELS}
        />
      )}
      <FormField label="커스텀 도메인" required error={fieldErrors.customDomain}>
        <Input
          placeholder="app.example.com"
          value={customDomain}
          onChange={(event) => setCustomDomain(event.target.value)}
        />
      </FormField>
      <FormField
        label="공개 포트"
        required
        error={fieldErrors.port}
        description="VM 안에서 서비스가 듣고 있는 포트입니다. SSH 포트(22)는 공개할 수 없습니다."
        className="sm:w-40"
      >
        <Input
          inputMode="numeric"
          value={port}
          onChange={(event) => setPort(event.target.value)}
        />
      </FormField>
      <Button type="submit" loading={connect.isPending} disabled={customDomain.trim() === ''}>
        도메인 연결
      </Button>
    </form>
  )
}
