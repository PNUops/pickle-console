import type { PositionView, updateMyProfile } from '../../api/queries'
import type { UserProfile } from '../../auth/auth-context'
import type { components } from '../../api/schema'

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

/** 잠긴 필드 집합. true 인 필드는 입력칸이 아니라 저장된 값을 보여 준다. */
export interface LockedProfileFields {
  position?: boolean
  studentNo?: boolean
  department?: boolean
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
 * 소속이 답해졌는지. 저장 버튼이 이 판정으로 열린다.
 *
 * 카탈로그의 `OTHER` 는 「목록에 없다」는 표시일 뿐 소속이 아니다. 그것만으로 저장을
 * 허용하면 소속이 「기타」라는 무의미한 값으로 굳는다 — 서버에는 이 규칙이 없고
 * (V94 의 CHECK 도 자유 입력이 비는 것을 허용한다) 잠금 때문에 본인이 되돌릴 수도
 * 없으므로, 세울 수 있는 곳이 화면뿐이다.
 */
export function departmentAnswered(values: ProfileValues): boolean {
  if (values.departmentCode === OTHER_DEPARTMENT) {
    return values.departmentOther.trim() !== ''
  }
  return values.departmentCode !== '' || values.departmentOther.trim() !== ''
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

/**
 * 저장된 값이 있는 필드. 서버가 `PUT /me/profile`에서 422로 거절하는 것과 같은 조건이다.
 *
 * 소속은 두 모양이 화면에서 한 축이다. 코드든 자유 입력이든 하나가 채워지면 소속은
 * 답해진 것이므로 그 축을 잠근다. **서버는 두 컬럼을 각각 잠그므로 이 판정이 서버보다
 * 넓다** — 자유 입력만 저장된 계정에 `OTHER` 코드를 넣는 것을 서버는 받아 준다. 넓은
 * 쪽이 맞는 이유는 그렇게 넣을 수 있는 것이 「목록에 없다」는 표시 하나뿐이고, 그것을
 * 채우는 데 뜻이 없기 때문이다.
 */
export function lockedProfileFields(user: UserProfile): LockedProfileFields {
  return {
    position: user.position != null,
    studentNo: user.studentNo != null,
    department: user.departmentCode != null || user.departmentOther != null,
  }
}

/**
 * 학번을 요구하는 직책인지. 직책이 비어 있으면 아직 알 수 없으므로 해당으로 본다.
 *
 * 판정은 서버가 직책마다 내려보내는 `requiresStudentNo` 로 한다. 코드 이름에서
 * 유도하면 직책이 하나 늘 때마다 콘솔 배포가 있어야 서버와 일치한다.
 */
export function studentNoApplies(
  positions: PositionView[] | undefined,
  user: UserProfile,
): boolean {
  return user.position == null || requiresStudentNo(positions, user.position)
}

/**
 * 보낼 것만 담은 부분 갱신 본문.
 *
 * 잠긴 필드는 **아예 보내지 않는다.** 저장된 값을 그대로 다시 보내도 서버는 통과시키지만,
 * 보내지 않는 것이 잠금 규칙과 한 번 덜 부딪힌다. 이름은 인자를 준 화면만 보낸다 —
 * 안내 모달에는 이름 칸이 없다. 특히 v0.46.0 이전에 프로필을 채운
 * 비학생 계정은 학과 코드를 들고 있는데(라이브에 실존한다) 새 모델대로 `departmentCode`를
 * null 로 보내면 잠금과 조합 규칙에 이중으로 걸려 이름만 바꾸는 저장까지 422가 된다.
 */
export function profilePatch(user: UserProfile, values: ProfileValues, name?: string) {
  const locked = lockedProfileFields(user)
  const patch: Record<string, unknown> = {}
  if (name !== undefined) patch.name = name.trim()
  if (!locked.position) {
    patch.position = (values.position || null) as components['schemas']['UserPosition'] | null
  }
  if (!locked.studentNo && values.studentNo.trim() !== '') {
    patch.studentNo = values.studentNo.trim()
  }
  if (!locked.department) {
    if (values.departmentCode !== '') patch.departmentCode = values.departmentCode
    if (values.departmentOther.trim() !== '') patch.departmentOther = values.departmentOther.trim()
  }
  return patch as Parameters<typeof updateMyProfile>[0]
}
