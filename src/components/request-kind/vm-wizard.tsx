import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchOsImages,
  fetchRequestOptions,
  fetchVmFlavors,
  type VmFlavor,
} from '../../api/queries'
import { Alert, FormField, Input, Textarea } from '../ui'
import { cn } from '../../lib/cn'
import { SSH_GATEWAY_HOST } from '../../lib/hosts'
import { formatMemory, formatSpec } from '../../lib/format'
import { SUBDOMAIN_RE, isUuid } from '../../lib/validation'
import type {
  FieldErrors,
  KindWizard,
  RequestKindModule,
  WizardStepId,
} from './types'

/** VM 스펙 입력 상태 — 신청 초안의 spec 부분으로 그대로 직렬화된다. */
interface VmSpecState {
  imageId: string | null
  flavorId: string | null
  reqVcpu: number
  reqMemoryMb: number
  reqDiskGb: number
  specReason: string
  desiredSlug: string
}

const INITIAL_SPEC: VmSpecState = {
  imageId: null,
  flavorId: null,
  reqVcpu: 1,
  reqMemoryMb: 1024,
  reqDiskGb: 10,
  specReason: '',
  desiredSlug: '',
}

/** 초안 spec에서 식별자를 담는 필드 — 값이 있다면 UUID 문자열이어야 한다. */
const DRAFT_ID_FIELDS = ['imageId', 'flavorId'] as const
/** 초안 spec에서 수치를 담는 필드. */
const DRAFT_NUMBER_FIELDS = ['reqVcpu', 'reqMemoryMb', 'reqDiskGb'] as const

/**
 * 저장된 초안의 VM 스펙 부분이 지금 모양인지.
 *
 * 식별자가 숫자에서 UUID로 바뀌었으므로, 그 전에 저장된 초안은 신청 본문에
 * 숫자 id를 실어 보낸다 — 타입은 통과하고 서버에서야 틀어지는 종류의 값이다.
 * 모양이 다르면 초안 전체가 버려진다(판단은 위저드 본체): 일부만 살리면
 * 사용자가 고르지 않은 값이 남아 더 헷갈린다.
 */
function isCompatibleSpecDraft(
  value: unknown,
): value is Partial<VmSpecState> | null | undefined {
  if (value === undefined || value === null) return true
  if (typeof value !== 'object') return false
  const draft = value as Record<string, unknown>
  for (const field of DRAFT_ID_FIELDS) {
    const id = draft[field]
    if (id === undefined || id === null) continue
    if (!isUuid(typeof id === 'string' ? id : null)) return false
  }
  for (const field of DRAFT_NUMBER_FIELDS) {
    const n = draft[field]
    if (n !== undefined && typeof n !== 'number') return false
  }
  return true
}

/** 선택한 사양 프리셋을 초과하는 요청인지 (초과 시 specReason 필수 — 서버와 동일 규칙). */
function exceedsFlavor(spec: VmSpecState, flavor: VmFlavor | undefined): boolean {
  if (!flavor) return false
  return (
    spec.reqVcpu > flavor.vcpu ||
    spec.reqMemoryMb > flavor.memoryMb ||
    spec.reqDiskGb > flavor.diskGb
  )
}

function useVmWizard(draftSpec: unknown): KindWizard {
  const osImages = useQuery({ queryKey: ['os-images'], queryFn: fetchOsImages })
  const flavors = useQuery({ queryKey: ['vm-flavors'], queryFn: fetchVmFlavors })
  const options = useQuery({ queryKey: ['request-options'], queryFn: fetchRequestOptions })

  const [spec, setSpec] = useState<VmSpecState>(() => ({
    ...INITIAL_SPEC,
    ...(isCompatibleSpecDraft(draftSpec) ? draftSpec : null),
  }))

  const update = (patch: Partial<VmSpecState>) =>
    setSpec((prev) => ({ ...prev, ...patch }))

  const selectedImage = osImages.data?.find((t) => t.id === spec.imageId)
  const selectedFlavor = flavors.data?.find((f) => f.id === spec.flavorId)

  /**
   * 오류 키는 서버가 422의 errors[]에 싣는 필드 경로와 같아야 한다.
   * 이 종류의 스펙은 신청 본문의 vm 아래에 있으므로 서버가 보내는 이름도
   * 'vm.imageId'처럼 중첩형이다 — 평평한 이름으로 받으면 서버가 되돌려준
   * 오류가 어느 칸에도 붙지 못한다. 공통 필드(workspaceId·purpose·reqEndDate…)는
   * 본문 최상위라 접두사가 붙지 않으며, 그쪽은 위저드 본체가 본다.
   */
  const validateStep = (step: WizardStepId): FieldErrors => {
    const next: FieldErrors = {}
    if (step === 'target') {
      if (spec.desiredSlug) {
        if (!SUBDOMAIN_RE.test(spec.desiredSlug)) {
          next['vm.desiredSlug'] =
            '호스트명(슬러그)은 소문자·숫자·하이픈만 사용해 3~40자로 입력해 주세요. (하이픈으로 시작·끝 불가)'
        } else if (options.data?.reservedSubdomains.includes(spec.desiredSlug)) {
          next['vm.desiredSlug'] = `'${spec.desiredSlug}'은(는) 예약된 이름이라 사용할 수 없습니다.`
        }
      }
    }
    if (step === 'spec') {
      // 목록에 없는 id(초안에 남은 은퇴 OS·프리셋, 직접 넣은 값)는 선택되지 않은
      // 것으로 본다 — 그대로 두면 요약이 원시 id를 보여주고 제출이 422로 튕긴다.
      if (spec.imageId == null || !selectedImage) next['vm.imageId'] = 'OS를 선택해 주세요.'
      if (spec.flavorId == null || !selectedFlavor)
        next['vm.flavorId'] = '사양 프리셋을 선택해 주세요.'
      if (selectedImage && selectedFlavor) {
        if (spec.reqVcpu < 1) next['vm.reqVcpu'] = 'vCPU는 1 이상이어야 합니다.'
        if (spec.reqMemoryMb < 256)
          next['vm.reqMemoryMb'] = '메모리는 256 MiB 이상이어야 합니다.'
        if (spec.reqDiskGb < selectedImage.minDiskGb)
          next['vm.reqDiskGb'] = `디스크는 이 OS의 최소 크기(${selectedImage.minDiskGb} GiB) 이상이어야 합니다.`
        if (exceedsFlavor(spec, selectedFlavor) && !spec.specReason.trim())
          next['vm.specReason'] =
            '선택한 사양 프리셋보다 높은 사양을 요청할 때는 사유를 입력해 주세요.'
      }
    }
    return next
  }

  return {
    spec,
    isPending: osImages.isPending || flavors.isPending || options.isPending,
    error: osImages.error ?? flavors.error ?? options.error,
    validateStep,

    targetFields: (errors) => (
      <FormField
        label="희망 호스트명(슬러그)"
        error={errors['vm.desiredSlug']}
        description={`SSH 접속명으로 쓰입니다 — ssh ${spec.desiredSlug || '<슬러그>'}@${
          options.data?.sshHost ?? SSH_GATEWAY_HOST
        } · 미입력 시 자동 생성됩니다.`}
      >
        <Input
          value={spec.desiredSlug}
          onChange={(event) => update({ desiredSlug: event.target.value })}
          placeholder="미입력 시 자동 생성"
          maxLength={40}
        />
      </FormField>
    ),

    specStep: (errors) => (
      <>
        <fieldset>
          <legend className="text-sm font-medium text-neutral-700">
            OS 선택 <span aria-hidden="true" className="text-danger-600">*</span>
          </legend>
          {errors['vm.imageId'] && (
            <p role="alert" className="mt-1 text-sm text-danger-600">
              {errors['vm.imageId']}
            </p>
          )}
          {osImages.data?.length === 0 && (
            <Alert variant="warning" className="mt-2">
              신청할 수 있는 OS가 아직 없습니다. 관리자가 OS를 등록하면 신청할 수
              있습니다.
            </Alert>
          )}
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {osImages.data?.map((image) => {
              const selected = image.id === spec.imageId
              return (
                <button
                  key={image.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    update({
                      imageId: image.id,
                      // 이미 고른 사양(또는 직접 입력값)이 이 OS의 최소 디스크보다
                      // 작으면 끌어올린다 — 사양을 먼저 골랐거나 OS를 바꾼 경우.
                      reqDiskGb: Math.max(spec.reqDiskGb, image.minDiskGb),
                    })
                  }
                  className={cn(
                    'cursor-pointer rounded-card border p-4 text-left focus-visible:outline-2 focus-visible:outline-primary-600',
                    selected
                      ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                      : 'border-neutral-200 bg-white hover:border-neutral-300',
                  )}
                >
                  <p className="font-medium text-neutral-900">
                    {image.displayName} <span className="text-neutral-400">v{image.version}</span>
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    최소 디스크 {image.minDiskGb} GiB
                  </p>
                  {image.notes && (
                    <p className="mt-1 text-xs text-neutral-500">{image.notes}</p>
                  )}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="border-t border-neutral-100 pt-4">
          <legend className="text-sm font-medium text-neutral-700">
            사양 선택 <span aria-hidden="true" className="text-danger-600">*</span>
          </legend>
          {errors['vm.flavorId'] && (
            <p role="alert" className="mt-1 text-sm text-danger-600">
              {errors['vm.flavorId']}
            </p>
          )}
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {flavors.data?.map((flavor) => {
              const selected = flavor.id === spec.flavorId
              return (
                <button
                  key={flavor.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    update({
                      flavorId: flavor.id,
                      reqVcpu: flavor.vcpu,
                      reqMemoryMb: flavor.memoryMb,
                      // 선택한 OS의 최소 디스크가 더 크면 그 값으로 올려 채운다 —
                      // 프리셋 값 그대로 넣으면 곧바로 검증에 걸린다.
                      reqDiskGb: Math.max(flavor.diskGb, selectedImage?.minDiskGb ?? 0),
                    })
                  }
                  className={cn(
                    'cursor-pointer rounded-card border p-4 text-left focus-visible:outline-2 focus-visible:outline-primary-600',
                    selected
                      ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                      : 'border-neutral-200 bg-white hover:border-neutral-300',
                  )}
                >
                  <p className="font-medium text-neutral-900">{flavor.displayName}</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {formatSpec(flavor.vcpu, flavor.memoryMb, flavor.diskGb)}
                  </p>
                  {flavor.notes && (
                    <p className="mt-1 text-xs text-neutral-500">{flavor.notes}</p>
                  )}
                </button>
              )
            })}
          </div>
        </fieldset>

        {selectedImage && selectedFlavor && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="vCPU" required error={errors['vm.reqVcpu']}>
                <Input
                  type="number"
                  min={1}
                  value={spec.reqVcpu}
                  onChange={(event) => update({ reqVcpu: Number(event.target.value) })}
                />
              </FormField>
              <FormField label="메모리 (MiB)" required error={errors['vm.reqMemoryMb']}>
                <Input
                  type="number"
                  min={256}
                  step={256}
                  value={spec.reqMemoryMb}
                  onChange={(event) => update({ reqMemoryMb: Number(event.target.value) })}
                />
              </FormField>
              <FormField label="디스크 (GiB)" required error={errors['vm.reqDiskGb']}>
                <Input
                  type="number"
                  min={selectedImage.minDiskGb}
                  value={spec.reqDiskGb}
                  onChange={(event) => update({ reqDiskGb: Number(event.target.value) })}
                />
              </FormField>
            </div>
            {exceedsFlavor(spec, selectedFlavor) && (
              <FormField
                label="사양 사유"
                required
                error={errors['vm.specReason']}
                description={`선택한 프리셋(${selectedFlavor.displayName})보다 높은 사양을 요청하는 이유를 적어 주세요. 관리자 검토에 사용됩니다.`}
              >
                <Textarea
                  value={spec.specReason}
                  onChange={(event) => update({ specReason: event.target.value })}
                  maxLength={2000}
                  placeholder="예: Spring Boot + PostgreSQL 동시 구동을 위해 메모리 4GiB 필요"
                />
              </FormField>
            )}
          </>
        )}
      </>
    ),

    summaryRows: (common, names) => [
      ['워크스페이스', names.workspaceName],
      ['기관', names.orgName],
      ['OS', selectedImage?.displayName ?? '—'],
      ['사양 프리셋', selectedFlavor?.displayName ?? '—'],
      [
        '요청 사양',
        `${spec.reqVcpu} vCPU · ${formatMemory(spec.reqMemoryMb)} · ${spec.reqDiskGb} GiB`,
      ],
      ['사양 사유', spec.specReason.trim() || '—'],
      ['사용 목적', common.purpose.trim()],
      ['수업/프로젝트명', common.courseOrProject.trim() || '—'],
      ['기타 참고', common.extraNote.trim() || '—'],
      ['표시명', common.displayName.trim()],
      ['호스트명(SSH 접속명)', spec.desiredSlug || '자동 생성'],
      [
        '사용 기간',
        common.reqStartDate || common.reqEndDate
          ? `${common.reqStartDate || '미지정'} ~ ${common.reqEndDate || '미지정'}`
          : '미지정',
      ],
    ],

    confirmNotice: (
      <Alert variant="warning" title="백업 책임 안내">
        플랫폼은 VM 데이터를 백업하지 않습니다. 데이터 보호와 백업은 사용자
        책임이며, 삭제된 VM의 데이터는 복구할 수 없습니다.
      </Alert>
    ),

    payload: () => ({
      type: 'VM',
      vm: {
        imageId: spec.imageId!,
        flavorId: spec.flavorId!,
        reqVcpu: spec.reqVcpu,
        reqMemoryMb: spec.reqMemoryMb,
        reqDiskGb: spec.reqDiskGb,
        specReason: spec.specReason.trim() || null,
        desiredSlug: spec.desiredSlug || null,
      },
    }),
  }
}

export const vmRequestKind: RequestKindModule = {
  type: 'VM',
  picker: {
    title: '가상 머신 (VM)',
    description: 'SSH로 접속해 쓰는 리눅스 서버입니다.',
  },
  specStepTitle: 'OS·사양',
  copy: {
    workspaceDescription:
      'VM은 워크스페이스 명의로 만들어집니다. 만들어진 VM은 신청한 사람만 접근할 수 있고, 접근 권한은 생성 후 VM 상세에서 부여합니다.',
    noWorkspaceNotice:
      'VM을 신청할 수 있는 워크스페이스가 없습니다. 워크스페이스에 속해 있어야 신청할 수 있습니다.',
  },
  // 키는 서버가 422에 싣는 필드 경로 그대로다 (신청 본문의 vm 아래).
  fieldLabels: {
    vm: 'VM 신청 항목',
    'vm.imageId': 'OS',
    'vm.flavorId': '사양 프리셋',
    'vm.specReason': '사양 사유',
    'vm.reqVcpu': 'vCPU',
    'vm.reqMemoryMb': '메모리',
    'vm.reqDiskGb': '디스크',
    'vm.desiredSlug': '호스트명(슬러그)',
  },
  isCompatibleSpecDraft,
  useWizard: useVmWizard,
}
