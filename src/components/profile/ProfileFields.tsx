import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { type PositionView, fetchProfileOptions } from '../../api/queries'
import type { ProfileFieldErrors, ProfileValues } from './profile-values'
import {
  OTHER_DEPARTMENT,
  picksFromCatalog,
  requiresStudentNo,
  type LockedProfileFields,
} from './profile-values'
import { Alert, FormField, Input, Select } from '../ui'

interface ProfileFieldsProps {
  values: ProfileValues
  onChange: (values: ProfileValues) => void
  errors?: ProfileFieldErrors
  disabled?: boolean
  /**
   * 이미 저장돼 잠긴 필드. 값 대신 잠김 표시를 그리고 입력칸을 주지 않는다.
   *
   * 서버가 정하는 사실이라 화면이 유도하지 않는다. 여기에 실리는 것은 `GET /me`가 답한
   * 저장값이 있느냐이고, 그것이 곧 `PUT /me/profile`이 422로 거절하는 조건이다.
   */
  locked?: LockedProfileFields
}

/**
 * 직책, 학번, 소속 입력. 프로필 안내 모달과 계정 화면이 함께 쓴다.
 *
 * 학번 필드를 띄울지는 서버가 직책마다 함께 내려보내는 `requiresStudentNo`로만 판단한다.
 * 코드 이름에서 유도하면 직책이 하나 늘 때마다 콘솔 배포가 있어야 서버와 일치한다.
 *
 * 소속은 두 모양이다. 학생은 학과 카탈로그에서 코드를 고르고, 교수와 연구원과 직원은
 * 연구소나 부서가 어느 학과 목록에도 없으므로 직접 쓴다. 목록에 없는 학과의 학생만
 * `OTHER` 코드와 직접 입력을 함께 보낸다. 그 밖의 조합에서 둘을 함께 보내면 422다.
 *
 * 세 값은 저장되면 잠기므로(`locked`), 이 폼은 **비어 있는 필드만 입력칸으로 그린다.**
 * 잠긴 값은 숨기지 않고 잠김을 말한다. 숨기면 왜 못 바꾸는지 알 길이 없다.
 */
export function ProfileFields({
  values,
  onChange,
  errors,
  disabled,
  locked,
}: ProfileFieldsProps) {
  const options = useQuery({
    queryKey: ['meta', 'profile-options'],
    queryFn: fetchProfileOptions,
    staleTime: 60 * 60 * 1000,
  })

  const positions = options.data?.positions
  const needsStudentNo = requiresStudentNo(positions, values.position)
  const departmentFromCatalog = picksFromCatalog(positions, values.position)
  const departmentLocked = locked?.department ?? false

  // 학생이 아닌 직책으로 바꾸면 학번을 비운다. 남겨 두면 교수 계정에 학번이 딸려 가고,
  // 그 값이 형식에 안 맞으면 화면에 없는 필드에 대한 422를 받게 된다.
  //
  // 카탈로그가 오기 전에는 아무것도 지우지 않는다. `requiresStudentNo` 는 목록을 못
  // 받으면 false 를 답하므로, 그 사이에 지우면 **채워진 값을 들고 들어온 화면**의 학번이
  // 조용히 사라진다. 지금 세 호출처는 전부 빈 값으로 시작해 발화하지 않지만, 값을
  // 미리 채우는 화면이 처음 생기는 날 데이터가 없어진다.
  //
  // 잠긴 학번은 지우지 않는다. 보통은 학번이 저장돼 있으면 그것을 요구하는 직책도
  // 저장돼 함께 잠겨 있어 이 갈래에 닿지 않지만, 직책 없이 학번만 있는 행은 과거
  // 검증 갭으로 만들어질 수 있었고(서버 쪽 주석이 그 역사를 인정한다) 그런 행에서는
  // 직책이 잠기지 않는다. 이 효과가 조용히 값을 지우는 종류라 조건을 명시해 둔다.
  useEffect(() => {
    if (!positions) return
    if (locked?.studentNo) return
    if (!needsStudentNo && values.studentNo !== '') {
      onChange({ ...values, studentNo: '' })
    }
  }, [positions, needsStudentNo, values, onChange, locked?.studentNo])

  // 직책이 소속의 모양을 정하므로, 직책을 바꾸면 다른 모양의 값은 뜻을 잃는다.
  // 지우지 않으면 화면에서 사라진 값이 상태에 남아 그대로 전송되고, 잠금이 그것을
  // 영구화한다 — 학부생으로 학과를 고른 뒤 교수로 바꾸면 보이는 소속은 빈 칸인데
  // 학과 코드가 저장되고, 그 뒤 진짜 소속을 자유 입력으로 넣으려 하면 조합 규칙에
  // 걸려 관리자 정정 없이는 벗어날 수 없다.
  //
  // 학번과 같은 이유로 카탈로그가 오기 전에는 아무것도 지우지 않고, 잠긴 값도
  // 건드리지 않는다.
  useEffect(() => {
    if (!positions) return
    if (departmentLocked) return
    if (values.position === '') return
    if (departmentFromCatalog) {
      // 학생인데 코드 없이 자유 입력만 남은 경우. `OTHER` 를 고르면 그 칸이 다시 나온다.
      if (values.departmentCode === '' && values.departmentOther !== '') {
        onChange({ ...values, departmentOther: '' })
      }
    } else if (values.departmentCode !== '') {
      onChange({ ...values, departmentCode: '' })
    }
  }, [positions, departmentFromCatalog, departmentLocked, values, onChange])

  const colleges = groupByCollege(options.data?.departments ?? [])

  return (
    <>
      {options.isError && (
        <Alert variant="danger">
          직책과 소속 목록을 불러오지 못했습니다.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void options.refetch()}
          >
            다시 시도
          </button>
        </Alert>
      )}
      {locked?.position ? (
        <LockedField label="직책" value={positionLabel(positions, values.position)} />
      ) : (
        <FormField label="직책" error={errors?.position}>
          <Select
            value={values.position}
            disabled={disabled || options.isPending}
            onChange={(event) => onChange({ ...values, position: event.target.value })}
          >
            <option value="">선택해 주세요</option>
            {positions?.map((position) => (
              <option key={position.code} value={position.code}>
                {position.label}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      {locked?.studentNo ? (
        <LockedField label="학번" value={values.studentNo} />
      ) : (
        needsStudentNo && (
          <FormField label="학번" error={errors?.studentNo}>
            <Input
              value={values.studentNo}
              disabled={disabled}
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              onChange={(event) => onChange({ ...values, studentNo: event.target.value })}
            />
          </FormField>
        )
      )}

      {departmentLocked ? (
        <LockedField
          label="소속"
          value={
            values.departmentOther !== ''
              ? values.departmentOther
              : departmentName(options.data?.departments, values.departmentCode)
          }
        />
      ) : (
        <>
          {/*
            직책이 정해지기 전에는 소속을 묻지 않는다. 어느 모양을 줘야 할지 직책이
            정하고, 먼저 물으면 고른 뒤에 칸이 바뀌면서 방금 쓴 값이 버려진다.
          */}
          {values.position === '' ? (
            <p className="text-sm text-neutral-500">직책을 고르면 소속을 입력할 수 있습니다.</p>
          ) : departmentFromCatalog ? (
            <>
              <FormField label="소속 학과" error={errors?.departmentCode}>
                <Select
                  value={values.departmentCode}
                  disabled={disabled || options.isPending}
                  onChange={(event) =>
                    onChange({
                      ...values,
                      departmentCode: event.target.value,
                      // 목록에서 실제 학과로 옮기면 직접 입력은 버린다. 남겨 두면
                      // 코드와 자유 입력을 함께 보내는 조합이 되어 422다.
                      departmentOther:
                        event.target.value === OTHER_DEPARTMENT ? values.departmentOther : '',
                    })
                  }
                >
                  <option value="">선택해 주세요</option>
                  {colleges.map(([college, departments]) => (
                    <optgroup key={college} label={college}>
                      {departments.map((department) => (
                        <option key={department.code} value={department.code}>
                          {department.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </FormField>
              {values.departmentCode === OTHER_DEPARTMENT && (
                <FormField label="소속 학과 직접 입력" error={errors?.departmentOther}>
                  <Input
                    value={values.departmentOther}
                    disabled={disabled}
                    maxLength={100}
                    autoComplete="off"
                    onChange={(event) =>
                      onChange({ ...values, departmentOther: event.target.value })
                    }
                  />
                </FormField>
              )}
            </>
          ) : (
            <FormField label="소속" error={errors?.departmentOther}>
              <Input
                value={values.departmentOther}
                disabled={disabled}
                maxLength={100}
                autoComplete="off"
                placeholder="예: 정보컴퓨터공학부 부설연구소"
                onChange={(event) => onChange({ ...values, departmentOther: event.target.value })}
              />
            </FormField>
          )}
        </>
      )}
    </>
  )
}

/**
 * 저장돼 잠긴 값. 입력칸 대신 값과 잠김 사유를 그린다.
 *
 * 숨기지 않는 것이 요점이다. 행이 사라지면 값이 무엇인지도, 왜 못 바꾸는지도 알 수 없다.
 */
function LockedField({ label, value }: { label: string; value: string }) {
  return (
    // dl/dt/dd 로 그린다. 입력칸이 아니라 값이므로 폼 라벨이 없고, 그냥 문단 셋으로
    // 두면 스크린리더가 라벨과 값을 잇지 못한다.
    <dl>
      <dt className="mb-1 text-sm font-medium text-neutral-700">{label}</dt>
      <dd className="text-sm text-neutral-900">{value || '입력하지 않음'}</dd>
      <dd className="mt-1 text-xs text-neutral-500">
        한 번 입력한 뒤에는 직접 바꿀 수 없습니다. 변경이 필요하면 문의해 주세요.
      </dd>
    </dl>
  )
}

/** 저장된 직책 코드의 라벨. 목록이 오기 전이거나 사라진 코드면 코드를 그대로 보여 준다. */
function positionLabel(positions: PositionView[] | undefined, code: string): string {
  return positions?.find((p) => p.code === code)?.label ?? code
}

/** 저장된 학과 코드의 이름. 카탈로그에서 빠진 코드면 코드가 그대로 남는다. */
function departmentName(
  departments: { code: string; name: string }[] | undefined,
  code: string,
): string {
  return departments?.find((d) => d.code === code)?.name ?? code
}

/** 카탈로그 순서를 유지한 채 단과대학으로 묶는다. */
function groupByCollege<T extends { college: string }>(items: T[]): [string, T[]][] {
  const grouped = new Map<string, T[]>()
  for (const item of items) {
    const bucket = grouped.get(item.college)
    if (bucket) bucket.push(item)
    else grouped.set(item.college, [item])
  }
  return [...grouped]
}
