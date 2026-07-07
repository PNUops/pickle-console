import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { createdVmRequestBodies } from '../test/msw/handlers/vm-requests'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderWizard() {
  server.use(refreshSuccessHandler('access-student'))
  renderApp('/console/requests/new')
}

async function passStep1(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText('신청 그룹'), '12')
  await user.selectOptions(screen.getByLabelText('기관'), '1')
  await user.click(screen.getByRole('button', { name: '다음' }))
}

describe('VM 신청 위저드 — 단계 검증', () => {
  test('그룹·기관을 선택하기 전에는 다음으로 넘어갈 수 없고, 신청 권한이 있는 그룹만 보인다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByRole('heading', { name: 'VM 신청' })

    // OWNER/MANAGER 그룹만 선택지에 나온다 (알고리즘 스터디는 MEMBER라 제외).
    const groupSelect = screen.getByLabelText('신청 그룹')
    expect(groupSelect).toContainHTML('캡스톤 3조')
    expect(groupSelect).toContainHTML('홍길동')
    expect(groupSelect).not.toContainHTML('알고리즘 스터디')

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('신청할 그룹을 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('자원을 제공할 기관을 선택해 주세요.')).toBeInTheDocument()
  })

  test('템플릿 선택 시 기본 사양이 채워지고, 기본값 초과 시 사유가 필수가 된다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByRole('heading', { name: 'VM 신청' })
    await passStep1(user)

    // 템플릿 없이 다음 → 오류
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('템플릿을 선택해 주세요.')).toBeInTheDocument()

    // 템플릿 선택 → 기본 사양 프리필
    await user.click(screen.getByRole('button', { name: /Ubuntu 24.04 LTS \(기본형\)/ }))
    expect(screen.getByLabelText('vCPU')).toHaveValue(2)
    expect(screen.getByLabelText('메모리 (MiB)')).toHaveValue(2048)
    expect(screen.getByLabelText('디스크 (GiB)')).toHaveValue(20)

    // 템플릿 최소 디스크 미만이면 오류
    const disk = screen.getByLabelText('디스크 (GiB)')
    await user.clear(disk)
    await user.type(disk, '5')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(
      screen.getByText('디스크는 이 템플릿의 최소 크기(10 GiB) 이상이어야 합니다.'),
    ).toBeInTheDocument()
    await user.clear(disk)
    await user.type(disk, '20')

    // 기본값 초과(메모리 4096)면 사양 사유가 필수
    const memory = screen.getByLabelText('메모리 (MiB)')
    await user.clear(memory)
    await user.type(memory, '4096')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(
      screen.getByText('기본 사양보다 높은 사양을 요청할 때는 사유를 입력해 주세요.'),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('사양 사유'), 'DB와 백엔드 동시 구동')
    await user.click(screen.getByRole('button', { name: '다음' }))

    // 3단계 도착: 용도 필수
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('사용 목적을 입력해 주세요.')).toBeInTheDocument()
  })

  test('HTTP 게시 선택 시 서브도메인 형식·예약어를 검사한다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByRole('heading', { name: 'VM 신청' })
    await passStep1(user)
    await user.click(screen.getByRole('button', { name: /Ubuntu 24.04 LTS \(기본형\)/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.type(screen.getByLabelText('사용 목적'), '웹 서비스 배포')
    await user.click(screen.getByRole('button', { name: '다음' }))

    await user.click(screen.getByRole('checkbox', { name: /HTTP 서비스 게시/ }))

    // 비워둔 채 다음 → 필수 오류
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(
      screen.getByText('HTTP 서비스를 게시하려면 서브도메인을 입력해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('루트 도메인을 선택해 주세요.')).toBeInTheDocument()

    // 형식 위반
    const subdomain = screen.getByLabelText('희망 서브도메인')
    await user.type(subdomain, 'Bad_Sub')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText(/서브도메인은 소문자·숫자·하이픈만 사용해/)).toBeInTheDocument()

    // 예약어
    await user.clear(subdomain)
    await user.type(subdomain, 'www')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(
      screen.getByText("'www'은(는) 예약된 서브도메인이라 사용할 수 없습니다."),
    ).toBeInTheDocument()
  })
})

describe('VM 신청 위저드 — 제출', () => {
  test('전체 단계를 통과하면 계약에 맞는 페이로드로 제출하고 완료 화면을 보여준다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByRole('heading', { name: 'VM 신청' })

    // ① 그룹·기관
    await passStep1(user)

    // ② 템플릿·사양 (기본값 그대로)
    await user.click(screen.getByRole('button', { name: /Ubuntu 24.04 LTS \(기본형\)/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))

    // ③ 용도·기간
    await user.type(screen.getByLabelText('사용 목적'), '캡스톤 백엔드 API 서버 운영')
    await user.type(screen.getByLabelText('수업/프로젝트명'), '2026-1 캡스톤디자인')
    fireEvent.change(screen.getByLabelText('희망 시작일'), {
      target: { value: '2026-07-15' },
    })
    fireEvent.change(screen.getByLabelText('희망 종료일'), {
      target: { value: '2026-12-20' },
    })
    await user.click(screen.getByRole('button', { name: '다음' }))

    // ④ 네트워크·도메인
    await user.click(screen.getByRole('checkbox', { name: /HTTP 서비스 게시/ }))
    await user.click(screen.getByRole('checkbox', { name: /외부\(캠퍼스 밖\) 공개/ }))
    await user.type(screen.getByLabelText('희망 서브도메인'), 'capstone-api')
    await user.selectOptions(screen.getByLabelText('루트 도메인'), 'pickle.pnuops.com')
    await user.click(screen.getByRole('button', { name: '다음' }))

    // ⑤ 확인·제출: 요약 확인 후 제출
    expect(screen.getByText('신청 내용 확인')).toBeInTheDocument()
    expect(screen.getByText('capstone-api.pickle.pnuops.com')).toBeInTheDocument()
    expect(screen.getByText('2 vCPU · 2 GiB · 20 GiB')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '신청 제출' }))

    expect(
      await screen.findByRole('heading', { name: '신청이 접수되었습니다' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '내 신청으로 이동' })).toBeInTheDocument()

    // 서버로 간 페이로드가 계약(CreateVmRequest)과 정확히 일치한다.
    expect(createdVmRequestBodies).toHaveLength(1)
    expect(createdVmRequestBodies[0]).toEqual({
      groupId: 12,
      orgId: 1,
      templateId: 1,
      purpose: '캡스톤 백엔드 API 서버 운영',
      courseOrProject: '2026-1 캡스톤디자인',
      specReason: null,
      extraNote: null,
      reqVcpu: 2,
      reqMemoryMb: 2048,
      reqDiskGb: 20,
      reqStartDate: '2026-07-15',
      reqEndDate: '2026-12-20',
      needSsh: true,
      needHttp: true,
      needPublic: true,
      desiredSubdomain: 'capstone-api',
      rootDomain: 'pickle.pnuops.com',
      customDomain: null,
    })
  })
})
