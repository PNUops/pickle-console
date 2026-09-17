import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchRequestOptions } from '../../api/queries'
import { consolePaths } from '../../lib/paths'
import { Alert, FormField, Input, Select } from '../ui'
import { SUBDOMAIN_RE } from '../../lib/validation'
import type { CommonWizardState, FieldErrors, KindWizard, RequestKindModule } from './types'

interface DomainSpecState {
  label: string
  /** 비어 있으면 첫 허용 루트가 기본값이다 — 서버도 같은 값을 쓴다. */
  rootDomain: string
}

function initialSpec(draft: unknown): DomainSpecState {
  const base: DomainSpecState = { label: '', rootDomain: '' }
  if (typeof draft !== 'object' || draft == null) return base
  return {
    label: 'label' in draft && typeof draft.label === 'string' ? draft.label : '',
    rootDomain:
      'rootDomain' in draft && typeof draft.rootDomain === 'string' ? draft.rootDomain : '',
  }
}

function useDomainWizard(draft: unknown, _common: CommonWizardState): KindWizard {
  const [spec, setSpec] = useState(() => initialSpec(draft))
  // 루트 도메인·예약어 목록은 VM 서브도메인 폼과 같은 출처를 쓴다.
  const options = useQuery({ queryKey: ['request-options'], queryFn: fetchRequestOptions })
  const allowedRoots = options.data?.allowedRootDomains ?? []
  const label = spec.label.trim().toLowerCase()
  const root = spec.rootDomain || allowedRoots[0] || ''
  const fqdn = label && root ? `${label}.${root}` : ''

  return {
    spec,
    isPending: options.isPending,
    error: options.error,
    validateStep: (step) => {
      const errors: FieldErrors = {}
      if (step !== 'resource') return errors
      if (!label) {
        errors['domain.label'] = '도메인 이름을 입력해 주세요.'
      } else if (!SUBDOMAIN_RE.test(label)) {
        errors['domain.label'] =
          '이름은 소문자·숫자·하이픈만 사용해 3~40자로 입력해 주세요. (하이픈으로 시작·끝 불가)'
      } else if (options.data?.reservedSubdomains.includes(label)) {
        // 금칙어 일부는 서버만 알고 있어 그쪽은 422로 돌아온다.
        errors['domain.label'] = `'${label}'은(는) 예약된 이름이라 사용할 수 없습니다.`
      }
      if (!root) errors['domain.rootDomain'] = '루트 도메인을 선택해 주세요.'
      return errors
    },
    resourceFields: (errors) => (
      <>
        <FormField
          label="도메인 이름"
          required
          error={errors['domain.label']}
          description="소문자·숫자·하이픈, 3~40자. 이 이름이 신청의 이름이 됩니다."
        >
          {/* 고를 루트가 하나뿐이면 고를 것이 없으므로 칸 옆에 그대로 붙여
              둔다 — 입력한 이름이 어디에 붙는지가 칸 안에서 읽힌다. */}
          <div className="flex items-center gap-2">
            <Input
              className="flex-1"
              value={spec.label}
              maxLength={40}
              placeholder="myblog"
              onChange={(event) => setSpec((prev) => ({ ...prev, label: event.target.value }))}
            />
            {allowedRoots.length === 1 && (
              <span className="shrink-0 font-mono text-sm text-neutral-500">
                .{allowedRoots[0]}
              </span>
            )}
          </div>
        </FormField>
        {allowedRoots.length >= 2 && (
          <FormField
            label="루트 도메인"
            required
            error={errors['domain.rootDomain']}
            description="이 이름이 속할 기관은 고른 루트가 정합니다."
          >
            <Select
              value={root}
              onChange={(event) =>
                setSpec((prev) => ({ ...prev, rootDomain: event.target.value }))
              }
            >
              {allowedRoots.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          받을 주소{' '}
          <code className="font-mono text-neutral-900">
            {label || '<이름>'}
            {root ? `.${root}` : ''}
          </code>
        </p>
        {options.isError && (
          <Alert variant="warning">
            루트 도메인 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </Alert>
        )}
      </>
    ),
    reviewRows: () => ({ resource: [['도메인 이름', fqdn || '—']] }),
    // 발급이 끝나도 주소가 바로 열리지는 않는다. 레코드를 넣기 전까지는 이름만
    // 있고 가리키는 곳이 없으며, 그것을 말해 주지 않으면 침묵이 고장으로 읽힌다.
    notice: (
      <p className="text-sm text-neutral-600">
        발급받은 뒤 도메인 상세 화면에서 레코드를 넣어야 주소가 열립니다. 레코드는 플랫폼 밖
        서버도 가리킬 수 있습니다.
      </p>
    ),
    displayName: fqdn,
    payload: () => ({ type: 'DOMAIN', domain: { label, rootDomain: root } }),
  }
}

export const domainRequestKind: RequestKindModule = {
  type: 'DOMAIN',
  picker: {
    title: '도메인',
    description: 'VM 없이 이름만 받아 원하는 곳을 가리키는 DNS 레코드를 직접 넣습니다.',
  },
  copy: {
    noWorkspaceNotice: '도메인을 소유할 워크스페이스를 먼저 만들어 주세요.',
    displayNameHint: null,
    approvedNotice: (
      <>
        이름만으로는 아직 아무 곳도 가리키지 않습니다.{' '}
        <Link
          to={consolePaths.dnsDomains(null)}
          className="font-medium text-primary-700 hover:underline"
        >
          내 도메인
        </Link>
        에서 레코드를 넣어 주세요.
      </>
    ),
  },
  // 기관은 고른 루트가, 사용 기한은 도메인 자신이, 이름은 발급받는 라벨이 정한다.
  hiddenCommonFields: ['orgId', 'period', 'displayName'],
  fields: {
    'domain.label': { label: '도메인 이름', step: 'resource' },
    'domain.rootDomain': { label: '루트 도메인', step: 'resource' },
    domain: { label: '도메인', step: 'resource' },
  },
  useWizard: useDomainWizard,
}
