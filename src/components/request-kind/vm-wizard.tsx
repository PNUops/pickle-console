import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchOsImages,
  fetchRequestOptions,
  fetchVmFlavors,
  type OsImage,
  type VmFlavor,
} from '../../api/queries'
import { Alert, CardRadioGroup, FormField, Input } from '../ui'
import { SSH_GATEWAY_HOST } from '../../lib/hosts'
import { formatMemory, formatSpec } from '../../lib/format'
import { SUBDOMAIN_RE } from '../../lib/validation'
import { RaisedAxis } from './RaisedAxis'
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
  /** 직접 입력에서 이 축을 올릴지. 끄면 기본값이 그대로 간다. */
  raiseVcpu: boolean
  raiseMemory: boolean
  raiseDisk: boolean
  /** 올린 축마다 그 축의 사유. 축을 끄면 지운다. */
  vcpuReason: string
  memoryReason: string
  diskReason: string
  desiredSlug: string
}

/**
 * 직접 입력의 바닥값.
 *
 * 직접 입력은 준비된 사양의 큰 쪽에서 출발하지 않는다. **바닥에서 출발해 필요한
 * 축만 올리게 하는 것이 이 화면의 요점이다.** 큰 값에서 출발하면 아무것도 올리지
 * 않아도 이미 큰 신청이 되고, 그것을 되돌리는 것은 사용자 몫이 된다.
 */
const CUSTOM_BASE = { vcpu: 1, memoryMb: 1024, diskGb: 32 } as const

const INITIAL_SPEC: VmSpecState = {
  osFamily: null,
  imageId: null,
  flavorChoice: null,
  reqVcpu: CUSTOM_BASE.vcpu,
  reqMemoryMb: CUSTOM_BASE.memoryMb,
  reqDiskGb: CUSTOM_BASE.diskGb,
  raiseVcpu: false,
  raiseMemory: false,
  raiseDisk: false,
  vcpuReason: '',
  memoryReason: '',
  diskReason: '',
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

/**
 * 호스트 이름의 흠. 흠이 없으면 null이다.
 *
 * 이 검사를 「다음」이 아니라 입력마다 돌리는 이유는, 여기서 걸리는 두 가지를
 * 콘솔이 이미 알고 있기 때문이다. 글자 규칙은 정규식이고 예약어 목록은 서버가
 * 내려 준다. 아는 것을 알려 주지 않고 화면을 넘긴 뒤에 되돌리는 것은 검사가
 * 아니라 시험이다.
 *
 * **모르는 것 하나는 남는다.** 이미 누가 쓰는 이름인지는 서버만 안다. 그것은
 * 제출 때 422로 오고, 그 422가 이 칸으로 되돌아온다.
 */
function checkSlug(value: string, reserved: string[] | undefined): string | null {
  if (!value) return null
  // 무엇이 틀렸는지 짚는다. 규칙 전체를 되풀이하면 칸 위의 안내와 같은 문장이
  // 두 번 보이고, 정작 자기 입력의 어디가 문제인지는 여전히 안 알려 준다.
  if (/[^a-z0-9-]/.test(value)) {
    return '영문 소문자와 숫자, 하이픈만 쓸 수 있습니다. 한글과 공백, 대문자는 쓸 수 없습니다.'
  }
  if (value.startsWith('-') || value.endsWith('-')) {
    return '하이픈으로 시작하거나 끝낼 수 없습니다.'
  }
  if (!SUBDOMAIN_RE.test(value)) {
    return '3~40자로 입력해 주세요.'
  }
  if (reserved?.includes(value)) return `'${value}'은(는) 예약된 이름이라 쓸 수 없습니다.`
  return null
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

/**
 * 축별 사유를 계약의 `specReason` 한 칸으로 합친다.
 *
 * 계약은 사유를 하나만 싣는다. 축을 나눈 것은 **입력과 검토의 문제**이지 저장
 * 형식의 문제가 아니므로, 열을 늘리는 대신 어느 축의 글인지 밝혀서 붙인다.
 * 승인자는 줄마다 어느 축의 근거인지 그대로 읽는다.
 */
function composeSpecReason(spec: VmSpecState): string {
  const lines: string[] = []
  if (spec.raiseVcpu && spec.vcpuReason.trim())
    lines.push(`vCPU ${spec.reqVcpu}개: ${spec.vcpuReason.trim()}`)
  if (spec.raiseMemory && spec.memoryReason.trim())
    lines.push(`메모리 ${spec.reqMemoryMb / 1024} GiB: ${spec.memoryReason.trim()}`)
  if (spec.raiseDisk && spec.diskReason.trim())
    lines.push(`디스크 ${spec.reqDiskGb} GiB: ${spec.diskReason.trim()}`)
  return lines.join('\n')
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
      update({ flavorChoice: CUSTOM_SPEC, ...customBase() })
      return
    }
    const flavor = flavors.data?.find((candidate) => candidate.id === choice)
    if (!flavor) return
    update({
      flavorChoice: choice,
      reqVcpu: flavor.vcpu,
      reqMemoryMb: flavor.memoryMb,
      reqDiskGb: Math.max(flavor.diskGb, selectedImage?.minDiskGb ?? 0),
      ...clearedAxes(),
    })
  }

  /** 직접 입력의 출발점. 디스크만 OS 최소치가 바닥을 올릴 수 있다. */
  const customBase = () => ({
    reqVcpu: CUSTOM_BASE.vcpu,
    reqMemoryMb: CUSTOM_BASE.memoryMb,
    reqDiskGb: Math.max(CUSTOM_BASE.diskGb, selectedImage?.minDiskGb ?? 0),
    ...clearedAxes(),
  })

  const clearedAxes = () => ({
    raiseVcpu: false,
    raiseMemory: false,
    raiseDisk: false,
    vcpuReason: '',
    memoryReason: '',
    diskReason: '',
  })

  /**
   * 축 하나를 켜고 끈다. 끄면 값과 사유를 바닥으로 되돌린다.
   *
   * 되돌리지 않으면 체크를 풀어 화면에서 사라진 값이 그대로 제출된다. 사유는
   * 축에 매여 있으므로 그 축이 꺼지는 순간 근거 없는 숫자가 된다.
   */
  const toggleAxis = (axis: 'vcpu' | 'memory' | 'disk', on: boolean) => {
    if (axis === 'vcpu') {
      update({ raiseVcpu: on, ...(on ? {} : { reqVcpu: CUSTOM_BASE.vcpu, vcpuReason: '' }) })
    } else if (axis === 'memory') {
      update({
        raiseMemory: on,
        ...(on ? {} : { reqMemoryMb: CUSTOM_BASE.memoryMb, memoryReason: '' }),
      })
    } else {
      update({
        raiseDisk: on,
        ...(on ? {} : { reqDiskGb: Math.max(CUSTOM_BASE.diskGb, selectedImage?.minDiskGb ?? 0), diskReason: '' }),
      })
    }
  }

  /**
   * 오류 키는 서버가 422에 싣는 필드 경로와 같아야 한다. 이 종류의 스펙은 신청 본문의
   * vm 아래에 있으므로 서버도 `vm.imageId`처럼 중첩 경로로 보낸다.
   */
  const validateStep = (step: WizardStepId): FieldErrors => {
    const next: FieldErrors = {}
    if (step !== 'resource') return next

    const slugError = checkSlug(spec.desiredSlug, options.data?.reservedSubdomains)
    if (slugError) next['vm.desiredSlug'] = slugError
    // 목록에 없는 id(초안에 남은 은퇴 항목)는 고르지 않은 것으로 본다. 그대로 두면
    // 요약이 빈 자리를 보여주고 제출이 422로 튕긴다.
    if (!selectedImage) next['vm.imageId'] = 'OS를 선택해 주세요.'
    if (!specChosen) next['vm.flavorId'] = '사양을 선택해 주세요.'
    if (selectedImage && specChosen) {
      if (spec.reqVcpu < 1) next['vm.reqVcpu'] = 'vCPU는 1 이상이어야 합니다.'
      if (spec.reqMemoryMb < 1024) next['vm.reqMemoryMb'] = '메모리는 1 GiB 이상이어야 합니다.'
      if (spec.reqDiskGb < selectedImage.minDiskGb)
        next['vm.reqDiskGb'] = `디스크는 이 OS의 최소 크기(${selectedImage.minDiskGb} GiB) 이상이어야 합니다.`

      if (custom) {
        // **축마다 따로 묻는 이유가 여기 있다.** 사유가 하나뿐이면 메모리가 필요한
        // 이유를 적고 vCPU까지 함께 올릴 수 있고, 검토하는 쪽은 그 글만 보고는
        // 어느 축이 근거를 가진 것인지 가려낼 수 없다.
        const baseDisk = Math.max(CUSTOM_BASE.diskGb, selectedImage.minDiskGb)
        if (spec.raiseVcpu) {
          if (spec.reqVcpu <= CUSTOM_BASE.vcpu)
            next['vm.reqVcpu'] = `기본값(${CUSTOM_BASE.vcpu})보다 큰 값을 적어 주세요.`
          if (!spec.vcpuReason.trim()) next['vm.vcpuReason'] = 'vCPU를 늘리는 이유를 적어 주세요.'
        }
        if (spec.raiseMemory) {
          if (spec.reqMemoryMb <= CUSTOM_BASE.memoryMb)
            next['vm.reqMemoryMb'] = `기본값(${CUSTOM_BASE.memoryMb / 1024} GiB)보다 큰 값을 적어 주세요.`
          if (!spec.memoryReason.trim())
            next['vm.memoryReason'] = '메모리를 늘리는 이유를 적어 주세요.'
        }
        if (spec.raiseDisk) {
          if (spec.reqDiskGb <= baseDisk)
            next['vm.reqDiskGb'] = `기본값(${baseDisk} GiB)보다 큰 값을 적어 주세요.`
          if (!spec.diskReason.trim()) next['vm.diskReason'] = '디스크를 늘리는 이유를 적어 주세요.'
        }
        if (!spec.raiseVcpu && !spec.raiseMemory && !spec.raiseDisk)
          next['vm.flavorId'] = '늘릴 항목을 하나 이상 고르고 이유를 적어 주세요.'
      } else if (exceeds(spec, selectedFlavor)) {
        // 준비된 사양은 값을 손으로 고칠 자리가 없으므로 여기 걸리면 초안이 낡은
        // 것이다. 사용자가 고칠 칸이 없으니 사양을 다시 고르게 한다.
        next['vm.flavorId'] = '사양을 다시 선택해 주세요.'
      }
    }
    return next
  }

  const reservedSlugs = options.data?.reservedSubdomains
  const specSummary = `${spec.reqVcpu} vCPU, ${formatMemory(spec.reqMemoryMb)} 메모리, ${spec.reqDiskGb} GiB 디스크`

  return {
    spec,
    isPending: osImages.isPending || flavors.isPending || options.isPending,
    error: osImages.error ?? flavors.error ?? options.error,
    validateStep,

    resourceFields: (errors) => (
      <>
        <FormField
          label="호스트 이름"
          error={errors['vm.desiredSlug'] ?? checkSlug(spec.desiredSlug, reservedSlugs) ?? undefined}
          description="SSH로 접속할 때 쓰는 이름입니다. 만든 뒤에는 바꿀 수 없습니다. 소문자와 숫자, 하이픈만 쓸 수 있고 3~40자입니다."
        >
          <Input
            value={spec.desiredSlug}
            onChange={(event) => update({ desiredSlug: event.target.value })}
            placeholder="비우면 자동으로 정해집니다"
            maxLength={40}
          />
        </FormField>
        <p className="-mt-2 text-xs text-foreground-muted">
          {`ssh ${spec.desiredSlug || '<호스트 이름>'}@${options.data?.sshHost ?? SSH_GATEWAY_HOST}`}
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
            <p className="text-sm text-foreground-secondary">
              {`기본은 ${CUSTOM_BASE.vcpu} vCPU, ${CUSTOM_BASE.memoryMb / 1024} GiB 메모리, ${Math.max(CUSTOM_BASE.diskGb, selectedImage?.minDiskGb ?? 0)} GiB 디스크입니다. 더 필요한 항목만 골라 늘려 주세요.`}
            </p>
            <RaisedAxis
              label="vCPU"
              unit="개"
              checked={spec.raiseVcpu}
              onToggle={(on) => toggleAxis('vcpu', on)}
              min={CUSTOM_BASE.vcpu + 1}
              value={spec.reqVcpu}
              onValue={(value) => update({ reqVcpu: value })}
              valueError={errors['vm.reqVcpu']}
              reason={spec.vcpuReason}
              onReason={(value) => update({ vcpuReason: value })}
              reasonError={errors['vm.vcpuReason']}
              reasonPlaceholder="예: 빌드와 테스트를 병렬로 돌려 코어를 4개까지 씁니다"
            />
            <RaisedAxis
              label="메모리"
              unit="GiB"
              checked={spec.raiseMemory}
              onToggle={(on) => toggleAxis('memory', on)}
              min={CUSTOM_BASE.memoryMb / 1024 + 1}
              value={spec.reqMemoryMb / 1024}
              onValue={(value) => update({ reqMemoryMb: Math.round(value * 1024) })}
              valueError={errors['vm.reqMemoryMb']}
              reason={spec.memoryReason}
              onReason={(value) => update({ memoryReason: value })}
              reasonError={errors['vm.memoryReason']}
              reasonPlaceholder="예: 8만 장짜리 이미지 데이터셋을 메모리에 올려 두고 전처리합니다"
            />
            <RaisedAxis
              label="디스크"
              unit="GiB"
              checked={spec.raiseDisk}
              onToggle={(on) => toggleAxis('disk', on)}
              min={Math.max(CUSTOM_BASE.diskGb, selectedImage?.minDiskGb ?? 0) + 1}
              value={spec.reqDiskGb}
              onValue={(value) => update({ reqDiskGb: value })}
              valueError={errors['vm.reqDiskGb']}
              reason={spec.diskReason}
              onReason={(value) => update({ diskReason: value })}
              reasonError={errors['vm.diskReason']}
              reasonPlaceholder="예: 학습 데이터 원본과 중간 산출물을 합쳐 120 GiB를 둡니다"
            />

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
        ...(composeSpecReason(spec)
          ? ([['늘린 이유', composeSpecReason(spec)]] as [string, string][])
          : []),
        ['호스트 이름', spec.desiredSlug || '자동 생성'],
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
        specReason: composeSpecReason(spec) || null,
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
    'vm.desiredSlug': { label: '호스트 이름', step: 'resource' },
  },
  useWizard: useVmWizard,
}
