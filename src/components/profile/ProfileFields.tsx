import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { fetchProfileOptions } from '../../api/queries'
import type { ProfileFieldErrors, ProfileValues } from './profile-values'
import { requiresStudentNo } from './profile-values'
import { Alert, FormField, Input, Select } from '../ui'

interface ProfileFieldsProps {
  values: ProfileValues
  onChange: (values: ProfileValues) => void
  errors?: ProfileFieldErrors
  disabled?: boolean
}

/**
 * 직책, 학번, 소속 입력. 가입 폼과 프로필 게이트와 계정 화면이 함께 쓴다.
 *
 * 학번 필드를 띄울지는 서버가 직책마다 함께 내려보내는 `requiresStudentNo`로만 판단한다.
 * 코드 이름에서 유도하면 직책이 하나 늘 때마다 콘솔 배포가 있어야 서버와 일치한다.
 */
export function ProfileFields({ values, onChange, errors, disabled }: ProfileFieldsProps) {
  const options = useQuery({
    queryKey: ['meta', 'profile-options'],
    queryFn: fetchProfileOptions,
    staleTime: 60 * 60 * 1000,
  })

  const positions = options.data?.positions
  const needsStudentNo = requiresStudentNo(positions, values.position)

  // 학생이 아닌 직책으로 바꾸면 학번을 비운다. 남겨 두면 교수 계정에 학번이 딸려 가고,
  // 그 값이 형식에 안 맞으면 화면에 없는 필드에 대한 422를 받게 된다.
  //
  // 카탈로그가 오기 전에는 아무것도 지우지 않는다. `requiresStudentNo` 는 목록을 못
  // 받으면 false 를 답하므로, 그 사이에 지우면 **채워진 값을 들고 들어온 화면**의 학번이
  // 조용히 사라진다. 지금 세 호출처는 전부 빈 값으로 시작해 발화하지 않지만, 값을
  // 미리 채우는 화면이 처음 생기는 날 데이터가 없어진다.
  useEffect(() => {
    if (!positions) return
    if (!needsStudentNo && values.studentNo !== '') {
      onChange({ ...values, studentNo: '' })
    }
  }, [positions, needsStudentNo, values, onChange])

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
      <FormField label="직책" required error={errors?.position}>
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

      {needsStudentNo && (
        <FormField label="학번" required error={errors?.studentNo}>
          <Input
            value={values.studentNo}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="off"
            maxLength={20}
            onChange={(event) => onChange({ ...values, studentNo: event.target.value })}
          />
        </FormField>
      )}

      <FormField label="소속" required error={errors?.departmentCode}>
        <Select
          value={values.departmentCode}
          disabled={disabled || options.isPending}
          onChange={(event) => onChange({ ...values, departmentCode: event.target.value })}
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
    </>
  )
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
