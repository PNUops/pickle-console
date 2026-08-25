import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'

type Schemas = components['schemas']

/**
 * 직책 카탈로그. 학번이 필수인 것과 아닌 것을 둘씩 둔다 — 조건부 필드를 양쪽으로
 * 태워 볼 수 있어야 한다.
 */
export const positions: Schemas['PositionView'][] = [
  { code: 'STUDENT_UNDERGRAD', label: '학부생', requiresStudentNo: true },
  { code: 'STUDENT_GRADUATE', label: '대학원생', requiresStudentNo: true },
  { code: 'PROFESSOR', label: '교수', requiresStudentNo: false },
  { code: 'STAFF', label: '직원', requiresStudentNo: false },
]

/** 소속 카탈로그. 단과대학 묶음(optgroup)이 보이도록 두 단위를 둔다. */
export const departments: Schemas['DepartmentView'][] = [
  { code: 'COMPUTER_SCIENCE', college: '정보의생명공학대학', name: '정보컴퓨터공학부' },
  { code: 'ELECTRONICS_INFO', college: '정보의생명공학대학', name: '전자공학과' },
  { code: 'MECHANICAL_ENG', college: '공과대학', name: '기계공학부' },
  { code: 'OTHER', college: '기타', name: '기타' },
]

export const profileOptionsHandlers: RequestHandler[] = [
  http.get('*/api/v1/meta/profile-options', () =>
    HttpResponse.json({ positions, departments } satisfies Schemas['ProfileOptionsResponse'], {
      status: 200,
    }),
  ),
]
