import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createVmDomain,
  fetchRequestOptions,
  type PublicationView,
  type VmDetail,
} from '../../api/queries'
import { toApiError } from '../../api/problem'
import { fieldErrorsOf } from '../../lib/field-errors'
import {
  Alert,
  Button,
  Drawer,
  ErrorSummary,
  FormField,
  Input,
  Select,
} from '../ui'
import { LiveDomainBody } from './DomainDrawer'
import { DOMAIN_FIELD_LABELS, portFieldError, subdomainFieldError } from './domain-form'

interface AddPlatformSubdomainDrawerProps {
  vm: VmDetail
  open: boolean
  onClose: () => void
  /** 직전에 쓴 포트가 있으면 그 값, 없으면 '80'. */
  defaultPort: string
  /** 예약 중 이름 다시 연결 — 이름·루트를 채워서 연다. */
  initialSubdomain?: string
  initialRootDomain?: string
  onAccepted: (pub: PublicationView, port: number) => void
}

/**
 * 플랫폼 서브도메인 추가 드로어 — 내 도메인 연결과 같은 표면을 쓴다. 도메인을
 * 붙이는 두 갈래가 같은 자리에서 같은 모양으로 열리고, 접수 후에는 어느 쪽이든
 * 같은 드로어가 그대로 도메인 상세로 이어져 적용 진행이 보인다.
 */
export function AddPlatformSubdomainDrawer({
  vm,
  open,
  onClose,
  defaultPort,
  initialSubdomain,
  initialRootDomain,
  onAccepted,
}: AddPlatformSubdomainDrawerProps) {
  const queryClient = useQueryClient()
  // 루트 도메인·예약어 목록은 신청서와 같은 출처를 쓴다.
  const options = useQuery({ queryKey: ['request-options'], queryFn: fetchRequestOptions })
  const allowedRoots = options.data?.allowedRootDomains ?? []

  const [accepted, setAccepted] = useState<PublicationView | null>(null)
  const [subdomain, setSubdomain] = useState(initialSubdomain ?? '')
  const [rootDomain, setRootDomain] = useState(initialRootDomain ?? '')
  const [port, setPort] = useState(defaultPort)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // 목록을 받았는데 아직 고르지 않았다면 첫 항목이 기본값이다 (서버도 같은 값을 쓴다).
  const effectiveRoot = rootDomain || allowedRoots[0] || ''

  const add = useMutation({
    mutationFn: () =>
      createVmDomain(vm.id, {
        subdomain: subdomain.trim(),
        rootDomain: effectiveRoot || null,
        port: Number(port),
      }),
    onSuccess: async (pub) => {
      setError(null)
      setFieldErrors({})
      setAccepted(pub)
      onAccepted(pub, Number(port))
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
      await queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (err) => {
      const apiError = toApiError(err, '도메인 연결을 접수하지 못했습니다.')
      if (apiError.code === 'DOMAIN_LIMIT_REACHED') {
        // 상한값과 행동 지침(몇 개까지인지, 해제하거나 커스텀 도메인을 쓰라는
        // 안내)은 서버 detail에만 있다 — 자체 문구로 덮지 않고 그대로 보여준다.
        setFieldErrors({})
        setError(apiError.message)
        return
      }
      if (apiError.code === 'DOMAIN_FQDN_TAKEN') {
        setFieldErrors({ subdomain: '이미 사용 중인 이름입니다. 다른 이름을 입력해 주세요.' })
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
    const nameError = subdomainFieldError(subdomain, options.data?.reservedSubdomains)
    if (nameError) {
      setFieldErrors({ subdomain: nameError })
      return
    }
    if (!effectiveRoot) {
      setFieldErrors({ rootDomain: '루트 도메인을 선택해 주세요.' })
      return
    }
    const portError = portFieldError(port)
    if (portError) {
      setFieldErrors({ port: portError })
      return
    }
    add.mutate()
  }

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
      title={livePub ? livePub.fqdn : '플랫폼 서브도메인 추가'}
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
              연결을 접수했습니다. 적용이 끝나면 이 주소로 열립니다.
            </Alert>
          }
        />
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-neutral-600">소유 확인 없이 바로 연결됩니다.</p>
          {error && (
            <ErrorSummary
              error={error}
              fieldErrors={fieldErrors}
              slots={['subdomain', 'rootDomain', 'port']}
              fieldLabels={DOMAIN_FIELD_LABELS}
            />
          )}
          <FormField
            label="서브도메인"
            required
            error={fieldErrors.subdomain}
            description="소문자·숫자·하이픈, 3~40자"
          >
            {/* 고를 루트가 하나뿐이면 고를 것이 없으므로, 이름 옆에 붙는 자리에
                그대로 붙여 둔다 — 입력한 이름이 어디에 붙는지가 칸 안에서 읽힌다. */}
            <div className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder="capstone-team3"
                value={subdomain}
                maxLength={40}
                onChange={(event) => setSubdomain(event.target.value)}
              />
              {allowedRoots.length === 1 && (
                <span className="shrink-0 font-mono text-sm text-neutral-500">
                  .{allowedRoots[0]}
                </span>
              )}
            </div>
          </FormField>
          {allowedRoots.length >= 2 && (
            <FormField label="루트 도메인" required error={fieldErrors.rootDomain}>
              <Select
                value={effectiveRoot}
                onChange={(event) => setRootDomain(event.target.value)}
              >
                {allowedRoots.map((root) => (
                  <option key={root} value={root}>
                    {root}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            공개 주소{' '}
            <code className="font-mono text-neutral-900">
              https://{subdomain.trim() || '<서브도메인>'}
              {effectiveRoot ? `.${effectiveRoot}` : ''}
            </code>
          </p>
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
          {options.isError && (
            <Alert variant="warning">
              루트 도메인 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </Alert>
          )}
          <Button
            type="submit"
            loading={add.isPending}
            disabled={subdomain.trim() === '' || allowedRoots.length === 0}
          >
            도메인 연결
          </Button>
        </form>
      )}
    </Drawer>
  )
}
