import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchOsImages,
  type ApproveRequest,
  type OsImage,
  type RequestDetail,
} from '../../api/queries'
import {
  Alert,
  Button,
  FormField,
  Input,
  Select,
  Spinner,
  Textarea,
} from '../ui'
import { formatSpec } from '../../lib/format'
import { SUBDOMAIN_RE, isUuid } from '../../lib/validation'
import { Field } from './Field'
import type { DecisionData, DecisionFormApi, RequestKindView } from './types'

function useVmDecisionData(): DecisionData {
  const osImages = useQuery({
    queryKey: ['os-images'],
    queryFn: fetchOsImages,
    // 페이지 진입 시의 프리페치 옵저버가 조회를 소유한다 — 이 옵저버의 마운트가
    // 같은 조회를 한 번 더 쏘거나(성공 후 재조회), 실패를 조용히 재시도해
    // 오류 안내(재시도 버튼)를 건너뛰지 않게 한다.
    refetchOnMount: false,
    retryOnMount: false,
  })

  // OS 이미지 조회가 실패해도 결정 폼 자리를 비워 두지 않는다 — 실패를
  // 명시하고 재시도 경로를 제공한다 (무음 실종 방지).
  if (osImages.isError) {
    return {
      status: 'blocked',
      gate: (
        <Alert variant="danger" title="OS 이미지 목록을 불러오지 못했습니다">
          <div className="space-y-2">
            <p>승인·반려를 결정하려면 OS 이미지 목록이 필요합니다.</p>
            <Button
              size="sm"
              variant="secondary"
              loading={osImages.isFetching}
              onClick={() => void osImages.refetch()}
            >
              다시 시도
            </Button>
          </div>
        </Alert>
      ),
    }
  }
  if (!osImages.data) {
    return {
      status: 'blocked',
      gate: (
        <div className="flex justify-center py-6">
          <Spinner label="OS 이미지 목록 불러오는 중" />
        </div>
      ),
    }
  }
  return { status: 'ready', value: osImages.data }
}

function useVmApproveForm(request: RequestDetail, value: unknown): DecisionFormApi {
  // useVmDecisionData가 ready로 돌려준 그 값 — 이 모듈이 넣고 이 모듈이 꺼낸다.
  const images = value as OsImage[]

  // 승인 폼 — 요청 사양으로 프리필
  const [vcpu, setVcpu] = useState(String(request.vm?.reqVcpu))
  const [memoryMb, setMemoryMb] = useState(String(request.vm?.reqMemoryMb))
  const [diskGb, setDiskGb] = useState(String(request.vm?.reqDiskGb))
  const [imageId, setImageId] = useState(String(request.vm?.imageId))
  const [startDate, setStartDate] = useState(request.reqStartDate ?? '')
  const [endDate, setEndDate] = useState(request.reqEndDate ?? '')
  const [grantedSlug, setGrantedSlug] = useState(request.vm?.desiredSlug ?? '')
  const [nodeId, setNodeId] = useState('')
  const [approveComment, setApproveComment] = useState('')

  return {
    /**
     * 오류 키는 서버가 422의 errors[]에 싣는 필드 경로와 같아야 한다.
     * 부여 사양은 승인 본문의 vm 아래에 있으므로 서버가 보내는 이름도
     * 'vm.grantedVcpu'처럼 중첩형이다 — 평평한 이름으로 받으면 서버가
     * 되돌려준 오류가 어느 칸에도 붙지 못한다. 기간(grantedStartDate·
     * grantedEndDate)과 승인 의견은 본문 최상위라 접두사가 없다.
     */
    validate: () => {
      const errors: Record<string, string> = {}
      const image = images.find((t) => t.id === imageId)
      if (!Number.isInteger(Number(vcpu)) || Number(vcpu) < 1)
        errors['vm.grantedVcpu'] = 'vCPU는 1 이상의 정수로 입력해 주세요.'
      if (!Number.isInteger(Number(memoryMb)) || Number(memoryMb) < 256)
        errors['vm.grantedMemoryMb'] = '메모리는 256 MiB 이상으로 입력해 주세요.'
      if (!Number.isInteger(Number(diskGb)) || Number(diskGb) < 1)
        errors['vm.grantedDiskGb'] = '디스크는 1 GiB 이상으로 입력해 주세요.'
      else if (image && Number(diskGb) < image.minDiskGb)
        errors['vm.grantedDiskGb'] = `디스크는 이 OS 이미지의 최소 크기(${image.minDiskGb} GiB) 이상이어야 합니다.`
      if (nodeId.trim() && !isUuid(nodeId.trim()))
        errors['vm.nodeId'] = '노드 ID는 UUID 형식으로 입력하거나 비워 두세요.'
      if (grantedSlug.trim() && !SUBDOMAIN_RE.test(grantedSlug.trim()))
        errors['vm.grantedSlug'] =
          '호스트명(슬러그)은 소문자·숫자·하이픈만 사용해 3~40자로 입력해 주세요.'
      return errors
    },

    body: (): ApproveRequest => ({
      grantedStartDate: startDate || null,
      grantedEndDate: endDate || null,
      comment: approveComment.trim() ? approveComment.trim() : null,
      vm: {
        grantedVcpu: Number(vcpu),
        grantedMemoryMb: Number(memoryMb),
        grantedDiskGb: Number(diskGb),
        grantedImageId: imageId,
        grantedSlug: grantedSlug.trim() || null,
        nodeId: nodeId.trim() || null,
      },
    }),

    fields: (fieldErrors) => (
      <>
        <p className="text-sm text-neutral-500">
          요청 사양으로 미리 채워져 있습니다. 필요하면 조정한 뒤 승인해 주세요.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="vCPU" required error={fieldErrors['vm.grantedVcpu']}>
            <Input
              type="number"
              min={1}
              value={vcpu}
              onChange={(event) => setVcpu(event.target.value)}
            />
          </FormField>
          <FormField label="메모리 (MiB)" required error={fieldErrors['vm.grantedMemoryMb']}>
            <Input
              type="number"
              min={256}
              step={256}
              value={memoryMb}
              onChange={(event) => setMemoryMb(event.target.value)}
            />
          </FormField>
          <FormField label="디스크 (GiB)" required error={fieldErrors['vm.grantedDiskGb']}>
            <Input
              type="number"
              min={1}
              value={diskGb}
              onChange={(event) => setDiskGb(event.target.value)}
            />
          </FormField>
        </div>
        <FormField label="OS 이미지" required error={fieldErrors['vm.grantedImageId']}>
          <Select
            value={imageId}
            onChange={(event) => setImageId(event.target.value)}
          >
            {images.map((image) => (
              <option key={image.id} value={image.id}>
                {image.displayName}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="사용 시작일" error={fieldErrors.grantedStartDate}>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </FormField>
          <FormField label="사용 종료일" error={fieldErrors.grantedEndDate}>
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </FormField>
        </div>
        <FormField
          label="호스트명(슬러그) 확정"
          error={fieldErrors['vm.grantedSlug']}
          description="SSH 접속명·VM 이름으로 쓰입니다. 신청자의 희망값이 채워져 있으며, 비우면 자동 생성됩니다."
        >
          <Input
            value={grantedSlug}
            onChange={(event) => setGrantedSlug(event.target.value)}
            placeholder="비우면 자동 생성"
            maxLength={40}
          />
        </FormField>
        <FormField
          label="배치 노드 ID"
          error={fieldErrors['vm.nodeId']}
          description="비워 두면 자동 배치됩니다."
        >
          <Input
            value={nodeId}
            onChange={(event) => setNodeId(event.target.value)}
            placeholder="자동 배치"
          />
        </FormField>
        <FormField label="승인 의견" description="신청자에게 전달됩니다. (선택)">
          <Textarea
            value={approveComment}
            onChange={(event) => setApproveComment(event.target.value)}
            maxLength={2000}
            placeholder="요청 사양 그대로 승인합니다."
          />
        </FormField>
      </>
    ),

    confirmBody: (
      <div className="space-y-2 text-sm text-neutral-600">
        <p>아래 사양으로 승인하시겠습니까? 승인 즉시 VM 생성이 시작됩니다.</p>
        <p className="font-medium text-neutral-800">
          {formatSpec(Number(vcpu), Number(memoryMb), Number(diskGb))} ·{' '}
          {images.find((t) => t.id === imageId)?.displayName}
        </p>
        <p>{nodeId.trim() ? `지정한 노드에 배치` : '자동 배치'}</p>
      </div>
    ),

    successMessage: '신청을 승인했습니다. VM 생성이 시작되었습니다.',
  }
}

export const vmRequestView: RequestKindView = {
  decisionPrefetchQueries: [{ queryKey: ['os-images'], queryFn: fetchOsImages }],
  useDecisionData: useVmDecisionData,
  useApproveForm: useVmApproveForm,

  summaryCell: (request) => (
    <>
      <span className="block">{request.vm?.imageName ?? '—'}</span>
      <span className="block text-xs text-neutral-500">
        {formatSpec(request.vm?.reqVcpu, request.vm?.reqMemoryMb, request.vm?.reqDiskGb)}
      </span>
    </>
  ),

  contentFields: (data) => (
    <>
      <Field label="워크스페이스">{data.workspaceName}</Field>
      <Field label="기관">{data.orgName}</Field>
      {/* 이름은 응답이 실어 준다 — 카탈로그에서 내려간 OS·프리셋도 이름이
          남으므로 공개 목록을 따로 뒤질 필요가 없다. */}
      <Field label="OS">{data.vm?.imageName ?? '—'}</Field>
      <Field label="사양 프리셋">{data.vm?.flavorName ?? '—'}</Field>
      <Field label="요청 사양">
        {formatSpec(data.vm?.reqVcpu, data.vm?.reqMemoryMb, data.vm?.reqDiskGb)}
      </Field>
      <Field label="사용 기간">
        {data.reqStartDate ?? '미지정'} ~ {data.reqEndDate ?? '미지정'}
      </Field>
      <Field label="용도">{data.purpose}</Field>
      <Field label="수업/프로젝트">{data.courseOrProject ?? '—'}</Field>
      <Field label="사양 사유">{data.vm?.specReason ?? '—'}</Field>
      <Field label="기타 참고">{data.extraNote ?? '—'}</Field>
      <Field label="표시명">{data.displayName}</Field>
      <Field label="희망 호스트명(슬러그)">{data.vm?.desiredSlug ?? '자동 생성'}</Field>
      {/* 신청서의 도메인 축은 폐지됐다 — 과거 신청의 이력 값만 보여준다. */}
      {data.vm?.desiredSubdomain && (
        <Field label="서브도메인 선지정">
          {data.vm?.rootDomain
            ? `${data.vm?.desiredSubdomain}.${data.vm?.rootDomain}`
            : data.vm?.desiredSubdomain}
        </Field>
      )}
    </>
  ),
  resultFields: (data) => {
    if (data.review?.decision !== 'APPROVE') return null
    const granted = data.vm?.granted
    return (
      <>
        {granted?.grantedVcpu != null &&
          granted?.grantedMemoryMb != null &&
          granted?.grantedDiskGb != null && (
            <Field label="부여 사양">
              {formatSpec(granted?.grantedVcpu, granted?.grantedMemoryMb, granted?.grantedDiskGb)}
            </Field>
          )}
        <Field label="부여 OS 이미지">{granted?.grantedImageName ?? '—'}</Field>
        <Field label="부여 기간">
          {data.review.grantedStartDate ?? '미지정'} ~ {data.review.grantedEndDate ?? '미지정'}
        </Field>
        <Field label="배치 노드">
          {granted?.nodeName ?? (granted?.nodeId == null ? '자동 배치' : '노드 지정 배치')}
        </Field>
      </>
    )
  },
}
