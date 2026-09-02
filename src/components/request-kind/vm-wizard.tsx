import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchOsImages,
  fetchRequestOptions,
  fetchVmFlavors,
  type OsImage,
  type VmFlavor,
} from '../../api/queries'
import { Alert, CardRadioGroup, FormField, Input, Textarea } from '../ui'
import { SSH_GATEWAY_HOST } from '../../lib/hosts'
import { formatMemory, formatSpec } from '../../lib/format'
import { SUBDOMAIN_RE } from '../../lib/validation'
import type { FieldErrors, KindWizard, RequestKindModule, WizardStepId } from './types'

/** 사양을 고르는 세 갈래. `custom`이면 신청 본문의 flavorId가 없다. */
const CUSTOM_SPEC = 'custom'

interface VmSpecState {
  /** 고른 OS 계열. 버전은 이 안에서만 고른다. */
  osFamily: string | null
  imageId: string | null
  /** 고른 사양의 id, 또는 직접 입력을 뜻하는 `custom`. */
  flavorChoice: string | null
  reqVcpu: number
  reqMemoryMb: number
  reqDiskGb: number
  specReason: string
  desiredSlug: string
}

const INITIAL_SPEC: VmSpecState = {
  osFamily: null,
  imageId: null,
  flavorChoice: null,
  reqVcpu: 1,
  reqMemoryMb: 1024,
  reqDiskGb: 32,
  specReason: '',
  desiredSlug: '',
}

/** 계열의 사람이 읽는 이름. 모르는 계열은 원문을 그대로 보여 준다. */
const FAMILY_LABELS: Record<string, string> = {
  ubuntu: 'Ubuntu',
  debian: 'Debian',
  rocky: 'Rocky Linux',
}

function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family
}

/** 계열의 등장 순서. 서버가 계열 오름차순으로 주므로 그 순서를 그대로 쓴다. */
function familiesOf(images: OsImage[]): string[] {
  return [...new Set(images.map((image) => image.osFamily))]
}

/** 선택한 사양을 초과하는 요청인지. 서버와 같은 규칙이다. */
function exceeds(spec: VmSpecState, flavor: VmFlavor | undefined): boolean {
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
    ...(typeof draftSpec === 'object' && draftSpec != null ? draftSpec : null),
  }))

  const update = (patch: Partial<VmSpecState>) => setSpec((prev) => ({ ...prev, ...patch }))

  const images = osImages.data ?? []
  const selectedImage = images.find((image) => image.id === spec.imageId)
  const custom = spec.flavorChoice === CUSTOM_SPEC
  const selectedFlavor = custom
    ? undefined
    : flavors.data?.find((flavor) => flavor.id === spec.flavorChoice)
  /** 사양 축이 정해졌는지. 정해져야 수치와 사유를 볼 일이 생긴다. */
  const specChosen = custom || selectedFlavor != null

  const versionsOf = (family: string) => images.filter((image) => image.osFamily === family)

  /**
   * 계열을 고른다. 그 계열의 버전이 하나뿐이면 두 번째 물음을 건너뛰고 바로 고른다.
   * 서버가 계열 안에서 최신을 먼저 주므로 첫 항목이 기본값이다.
   */
  const selectFamily = (family: string) => {
    const versions = versionsOf(family)
    const pick = versions[0]
    update({
      osFamily: family,
      imageId: pick ? pick.id : null,
      reqDiskGb: pick ? Math.max(spec.reqDiskGb, pick.minDiskGb) : spec.reqDiskGb,
    })
  }

  const selectVersion = (imageId: string) => {
    const image = images.find((candidate) => candidate.id === imageId)
    update({
      imageId,
      reqDiskGb: image ? Math.max(spec.reqDiskGb, image.minDiskGb) : spec.reqDiskGb,
    })
  }

  /**
   * 사양을 고른다.
   *
   * 준비된 사양으로 되돌아오면 수치와 사유를 그 사양의 값으로 되돌린다. 이 초기화가
   * 빠지면 직접 입력에서 적어 둔 초과 사양이 화면에서 사라진 채 사유 없이 제출된다.
   * 서버에 그것을 잡는 검사가 없으므로 여기가 유일한 방어다.
   */
  const selectSpec = (choice: string) => {
    if (choice === CUSTOM_SPEC) {
      update({ flavorChoice: CUSTOM_SPEC })
      return
    }
    const flavor = flavors.data?.find((candidate) => candidate.id === choice)
    if (!flavor) return
    update({
      flavorChoice: choice,
      reqVcpu: flavor.vcpu,
      reqMemoryMb: flavor.memoryMb,
      reqDiskGb: Math.max(flavor.diskGb, selectedImage?.minDiskGb ?? 0),
      specReason: '',
    })
  }

  /**
   * 오류 키는 서버가 422에 싣는 필드 경로와 같아야 한다. 이 종류의 스펙은 신청 본문의
   * vm 아래에 있으므로 서버도 `vm.imageId`처럼 중첩 경로로 보낸다.
   */
  const validateStep = (step: WizardStepId): FieldErrors => {
    const next: FieldErrors = {}
    if (step !== 'resource') return next

    if (spec.desiredSlug) {
      if (!SUBDOMAIN_RE.test(spec.desiredSlug)) {
        next['vm.desiredSlug'] =
          '접속 이름은 소문자와 숫자, 하이픈만 써서 3~40자로 입력해 주세요. 하이픈으로 시작하거나 끝날 수 없습니다.'
      } else if (options.data?.reservedSubdomains.includes(spec.desiredSlug)) {
        next['vm.desiredSlug'] = `'${spec.desiredSlug}'은(는) 예약된 이름이라 쓸 수 없습니다.`
      }
    }
    // 목록에 없는 id(초안에 남은 은퇴 항목)는 고르지 않은 것으로 본다. 그대로 두면
    // 요약이 빈 자리를 보여주고 제출이 422로 튕긴다.
    if (!selectedImage) next['vm.imageId'] = 'OS를 선택해 주세요.'
    if (!specChosen) next['vm.flavorId'] = '사양을 선택해 주세요.'
    if (selectedImage && specChosen) {
      if (spec.reqVcpu < 1) next['vm.reqVcpu'] = 'vCPU는 1 이상이어야 합니다.'
      if (spec.reqMemoryMb < 256) next['vm.reqMemoryMb'] = '메모리는 256 MiB 이상이어야 합니다.'
      if (spec.reqDiskGb < selectedImage.minDiskGb)
        next['vm.reqDiskGb'] = `디스크는 이 OS의 최소 크기(${selectedImage.minDiskGb} GiB) 이상이어야 합니다.`
      if (custom && !spec.specReason.trim())
        next['vm.specReason'] = '사양을 직접 적을 때는 사유를 입력해 주세요.'
      else if (exceeds(spec, selectedFlavor) && !spec.specReason.trim())
        next['vm.specReason'] = '선택한 사양을 초과할 때는 사유를 입력해 주세요.'
    }
    return next
  }

  const specSummary = `${spec.reqVcpu} vCPU, ${formatMemory(spec.reqMemoryMb)} 메모리, ${spec.reqDiskGb} GiB 디스크`

  return {
    spec,
    isPending: osImages.isPending || flavors.isPending || options.isPending,
    error: osImages.error ?? flavors.error ?? options.error,
    validateStep,

    resourceFields: (errors) => (
      <>
        <FormField
          label="접속 이름"
          error={errors['vm.desiredSlug']}
          description="SSH로 접속할 때 쓰는 이름입니다. 만든 뒤에는 바꿀 수 없습니다."
        >
          <Input
            value={spec.desiredSlug}
            onChange={(event) => update({ desiredSlug: event.target.value })}
            placeholder="비우면 자동으로 정해집니다"
            maxLength={40}
          />
        </FormField>
        <p className="-mt-2 text-xs text-foreground-muted">
          {`ssh ${spec.desiredSlug || '<접속 이름>'}@${options.data?.sshHost ?? SSH_GATEWAY_HOST}`}
        </p>

        {images.length === 0 ? (
          <Alert variant="warning">
            신청할 수 있는 OS가 아직 없습니다. 관리자가 OS를 등록하면 신청할 수 있습니다.
          </Alert>
        ) : (
          <CardRadioGroup
            legend="OS"
            required
            error={errors['vm.imageId']}
            value={spec.osFamily}
            onChange={selectFamily}
            columns={3}
            options={familiesOf(images).map((family) => ({
              value: family,
              title: familyLabel(family),
            }))}
          />
        )}

        {spec.osFamily && versionsOf(spec.osFamily).length > 1 && (
          <CardRadioGroup
            legend="버전"
            required
            value={spec.imageId}
            onChange={selectVersion}
            columns={3}
            options={versionsOf(spec.osFamily).map((image) => ({
              value: image.id,
              title: image.displayName,
              description: image.notes ?? undefined,
            }))}
          />
        )}

        {flavors.data?.length === 0 ? (
          <Alert variant="warning">
            신청할 수 있는 사양이 아직 없습니다. 관리자가 사양을 등록하면 신청할 수 있습니다.
          </Alert>
        ) : (
          <CardRadioGroup
            legend="사양"
            required
            error={errors['vm.flavorId']}
            value={spec.flavorChoice}
            onChange={selectSpec}
            columns={3}
            options={[
              ...(flavors.data ?? []).map((flavor) => ({
                value: flavor.id,
                title: flavor.displayName,
                description: flavor.notes ?? undefined,
                meta: formatSpec(flavor.vcpu, flavor.memoryMb, flavor.diskGb),
              })),
              {
                value: CUSTOM_SPEC,
                title: '직접 입력',
                description: '준비된 사양으로 모자랄 때. 사유를 적으면 관리자가 검토합니다.',
              },
            ]}
          />
        )}

        {selectedFlavor && (
          <p className="text-sm text-foreground-secondary">
            {specSummary}
            {selectedImage && selectedFlavor.diskGb < selectedImage.minDiskGb && (
              <span className="block text-xs text-foreground-muted">
                {`선택한 OS의 최소 디스크에 맞춰 ${spec.reqDiskGb} GiB로 올렸습니다.`}
              </span>
            )}
          </p>
        )}

        {custom && (
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
                  min={selectedImage?.minDiskGb ?? 1}
                  value={spec.reqDiskGb}
                  onChange={(event) => update({ reqDiskGb: Number(event.target.value) })}
                />
              </FormField>
            </div>
            <FormField
              label="사양 사유"
              required
              error={errors['vm.specReason']}
              description="준비된 사양으로 모자라는 이유와 무엇에 얼마나 쓸지 적어 주세요. 관리자는 이 글을 보고 판단합니다."
            >
              <Textarea
                value={spec.specReason}
                onChange={(event) => update({ specReason: event.target.value })}
                maxLength={2000}
                placeholder="예: Spring Boot와 PostgreSQL을 함께 띄워 메모리 4 GiB가 필요합니다"
              />
            </FormField>
            <Alert variant="warning">
              직접 적은 사양은 관리자가 따로 검토합니다. 승인이 늦어질 수 있고 더 작은 사양으로
              승인될 수 있습니다.
            </Alert>
          </>
        )}
      </>
    ),

    reviewRows: () => ({
      resource: [
        ['OS', selectedImage?.displayName ?? '—'],
        ['사양', custom ? '직접 입력 (관리자 검토)' : (selectedFlavor?.displayName ?? '—')],
        ['요청 사양', specSummary],
        ...(spec.specReason.trim()
          ? ([['사양 사유', spec.specReason.trim()]] as [string, string][])
          : []),
        ['접속 이름', spec.desiredSlug || '자동 생성'],
      ],
    }),

    notice: (
      <Alert variant="warning" title="백업 책임 안내">
        플랫폼은 VM 데이터를 백업하지 않습니다. 데이터 보호와 백업은 사용자 책임이며, 삭제된
        VM의 데이터는 복구할 수 없습니다.
      </Alert>
    ),

    payload: () => ({
      type: 'VM',
      vm: {
        imageId: spec.imageId!,
        flavorId: custom ? null : spec.flavorChoice,
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
    title: '가상머신',
    description: 'SSH로 접속해 쓰는 리눅스 서버입니다.',
  },
  copy: {
    noWorkspaceNotice:
      '가상머신을 신청할 수 있는 워크스페이스가 없습니다. 워크스페이스에 속해 있어야 신청할 수 있습니다.',
  },
  // 키는 서버가 422에 싣는 필드 경로 그대로다.
  fields: {
    vm: { label: '가상머신 신청 항목', step: 'resource' },
    'vm.imageId': { label: 'OS', step: 'resource' },
    'vm.flavorId': { label: '사양', step: 'resource' },
    'vm.specReason': { label: '사양 사유', step: 'resource' },
    'vm.reqVcpu': { label: 'vCPU', step: 'resource' },
    'vm.reqMemoryMb': { label: '메모리', step: 'resource' },
    'vm.reqDiskGb': { label: '디스크', step: 'resource' },
    'vm.desiredSlug': { label: '접속 이름', step: 'resource' },
  },
  useWizard: useVmWizard,
}
