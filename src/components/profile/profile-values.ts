import type { PositionView } from '../../api/queries'

/** 프로필 입력 폼이 들고 다니는 네 값. 저장 전까지는 전부 문자열이다. */
export interface ProfileValues {
  position: string
  studentNo: string
  departmentCode: string
  departmentOther: string
}

export const EMPTY_PROFILE: ProfileValues = {
  position: '',
  studentNo: '',
  departmentCode: '',
  departmentOther: '',
}

export interface ProfileFieldErrors {
  position?: string
  studentNo?: string
  departmentCode?: string
  departmentOther?: string
}

/** 카탈로그가 목록에 없는 소속을 담는 코드. 학생만 쓰고, 자유 입력을 함께 요구한다. */
export const OTHER_DEPARTMENT = 'OTHER'

/**
 * 학번이 필수인 직책인지.
 *
 * 서버가 직책마다 `requiresStudentNo`를 함께 내려보내므로 그 값만 본다. 코드 이름에서
 * 유도하면 직책이 하나 늘 때마다 콘솔 배포가 있어야 서버와 일치한다.
 */
export function requiresStudentNo(positions: PositionView[] | undefined, code: string): boolean {
  return positions?.find((p) => p.code === code)?.requiresStudentNo ?? false
}

/**
 * 소속을 학과 목록에서 고르는 직책인지.
 *
 * 학번이 필수인 직책과 같은 집합이다. 학생은 학과에 속하므로 카탈로그에서 고르고, 교수와
 * 연구원과 직원은 연구소나 부서에 속할 수 있어 어느 학과 목록에도 없으므로 직접 쓴다.
 * 별도 서버 플래그를 두지 않은 것은 두 축이 같은 사실("이 사람은 학생인가")에서 나오기
 * 때문이고, 갈라져야 하는 날이 오면 서버가 플래그를 하나 더 내려보내는 것이 옳다.
 */
export function picksFromCatalog(positions: PositionView[] | undefined, code: string): boolean {
  return requiresStudentNo(positions, code)
}
