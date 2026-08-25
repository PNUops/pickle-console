import type { PositionView } from '../../api/queries'

/** 프로필 입력 폼이 들고 다니는 세 값. 저장 전까지는 전부 문자열이다. */
export interface ProfileValues {
  position: string
  studentNo: string
  departmentCode: string
}

export const EMPTY_PROFILE: ProfileValues = { position: '', studentNo: '', departmentCode: '' }

export interface ProfileFieldErrors {
  position?: string
  studentNo?: string
  departmentCode?: string
}

/**
 * 학번이 필수인 직책인지.
 *
 * 서버가 직책마다 `requiresStudentNo`를 함께 내려보내므로 그 값만 본다. 코드 이름에서
 * 유도하면 직책이 하나 늘 때마다 콘솔 배포가 있어야 서버와 일치한다.
 */
export function requiresStudentNo(positions: PositionView[] | undefined, code: string): boolean {
  return positions?.find((p) => p.code === code)?.requiresStudentNo ?? false
}
