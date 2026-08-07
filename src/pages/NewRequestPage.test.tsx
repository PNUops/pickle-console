import { fireEvent, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { requestOptions } from '../test/msw/handlers/reference'
import { createdVmRequestBodies } from '../test/msw/handlers/vm-requests'
import { VM_REQUEST_DRAFT_KEY } from '../lib/storage-keys'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderWizard() {
  server.use(refreshSuccessHandler('access-user'))
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

    // OWNER/EDITOR 그룹만 선택지에 나온다 (알고리즘 스터디는 MEMBER라 제외).
    const groupSelect = screen.getByLabelText('신청 그룹')
    expect(groupSelect).toContainHTML('캡스톤 3조')
    expect(groupSelect).toContainHTML('홍길동')
    // EDITOR 그룹도 신청 가능 (EDITOR 게이트).
    expect(groupSelect).toContainHTML('데이터베이스 실습')
    expect(groupSelect).not.toContainHTML('알고리즘 스터디')

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('신청할 그룹을 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('자원을 제공할 기관을 선택해 주세요.')).toBeInTheDocument()
  })

  test('OS와 사양 프리셋을 각각 골라야 하고, 프리셋 초과 시 사유가 필수가 된다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByRole('heading', { name: 'VM 신청' })
    await passStep1(user)

    // 두 축을 모두 고르지 않으면 다음으로 넘어갈 수 없다
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('OS를 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('사양 프리셋을 선택해 주세요.')).toBeInTheDocument()

    // OS만 골라도 아직 사양 축이 비어 있다 (사양 입력도 나오지 않는다)
    await user.click(screen.getByRole('button', { name: /Ubuntu 24\.04 LTS/ }))
    expect(screen.queryByLabelText('vCPU')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.queryByText('OS를 선택해 주세요.')).not.toBeInTheDocument()
    expect(screen.getByText('사양 프리셋을 선택해 주세요.')).toBeInTheDocument()

    // 프리셋 선택 → 프리셋 값으로 사양이 프리필된다
    await user.click(screen.getByRole('button', { name: /기본형/ }))
    expect(screen.getByLabelText('vCPU')).toHaveValue(2)
    expect(screen.getByLabelText('메모리 (MiB)')).toHaveValue(2048)
    expect(screen.getByLabelText('디스크 (GiB)')).toHaveValue(20)

    // OS 최소 디스크 미만이면 오류
    const disk = screen.getByLabelText('디스크 (GiB)')
    await user.clear(disk)
    await user.type(disk, '5')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(
      screen.getByText('디스크는 이 OS의 최소 크기(10 GiB) 이상이어야 합니다.'),
    ).toBeInTheDocument()
    await user.clear(disk)
    await user.type(disk, '20')

    // 선택한 프리셋 초과(메모리 4096 > 기본형 2048)면 사양 사유가 필수
    const memory = screen.getByLabelText('메모리 (MiB)')
    await user.clear(memory)
    await user.type(memory, '4096')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(
      screen.getByText('선택한 사양 프리셋보다 높은 사양을 요청할 때는 사유를 입력해 주세요.'),
    ).toBeInTheDocument()

    // 더 큰 프리셋(대형 4c/8GiB)으로 바꾸면 초과가 아니게 되어 사유 입력이 사라진다
    await user.click(screen.getByRole('button', { name: /대형/ }))
    expect(screen.queryByLabelText('사양 사유')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /기본형/ }))
    await user.clear(screen.getByLabelText('메모리 (MiB)'))
    await user.type(screen.getByLabelText('메모리 (MiB)'), '4096')
    await user.type(screen.getByLabelText('사양 사유'), 'DB와 백엔드 동시 구동')
    await user.click(screen.getByRole('button', { name: '다음' }))

    // 3단계 도착: 용도 필수
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('사용 목적을 입력해 주세요.')).toBeInTheDocument()
  })

  test('신청서에는 도메인(서브도메인·루트) 입력이 없다 — 도메인은 VM 생성 후 연결한다', async () => {
    renderWizard()
    await screen.findByRole('heading', { name: 'VM 신청' })
    await screen.findByLabelText('신청 그룹')

    expect(screen.queryByLabelText('희망 서브도메인')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('루트 도메인')).not.toBeInTheDocument()
  })
})

describe('VM 신청 위저드 — 단계 URL·초안 유지', () => {
  test('새로고침(재마운트) 후에도 URL step과 입력값이 유지된다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    const first = renderApp('/console/requests/new')
    await screen.findByRole('heading', { name: 'VM 신청' })

    // 1~2단계 진행: 그룹·기관 선택 후 OS·사양 프리셋 선택.
    await passStep1(user)
    await user.click(screen.getByRole('button', { name: /Ubuntu 24\.04 LTS/ }))
    await user.click(screen.getByRole('button', { name: /기본형/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    await screen.findByLabelText('사용 목적') // 3단계 도착 (?step=3)

    // 브라우저 새로고침/뒤로가기를 재현: 앱을 다시 열어 ?step=2로 진입.
    first.unmount()
    renderApp('/console/requests/new?step=2')

    // 2단계가 열리고 OS·프리셋·사양 입력이 초안에서 복원된다.
    expect(await screen.findByLabelText('vCPU')).toHaveValue(2)
    expect(screen.getByLabelText('메모리 (MiB)')).toHaveValue(2048)
    expect(screen.getByRole('button', { name: /Ubuntu 24\.04 LTS/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /기본형/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('완료되지 않은 단계로 직접 진입하면 첫 미완료 단계로 돌려보낸다', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/requests/new?step=4')

    // 아무것도 입력하지 않았으므로 1단계(그룹·기관)로 되돌아간다.
    expect(await screen.findByLabelText('신청 그룹')).toBeInTheDocument()
  })

  test('선택 목록에 없는 사양 프리셋이 초안에 남아 있으면 2단계에서 막힌다', async () => {
    const user = userEvent.setup()
    // 은퇴(DISABLED)한 프리셋 id가 초안에 남은 상황 — 공개 목록에는 없는 값이다.
    sessionStorage.setItem(
      VM_REQUEST_DRAFT_KEY,
      JSON.stringify({
        groupId: 12,
        orgId: 1,
        templateId: 1,
        flavorId: 9,
        reqVcpu: 1,
        reqMemoryMb: 512,
        reqDiskGb: 10,
        purpose: '실습 서버',
      }),
    )
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/requests/new?step=4')

    // 확인 단계로 직접 진입해도 2단계에서 멈춘다 (요약에 원시 id가 새지 않는다).
    expect(await screen.findByRole('button', { name: /기본형/ })).toBeInTheDocument()
    expect(screen.queryByText('신청 내용 확인')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('사양 프리셋을 선택해 주세요.')).toBeInTheDocument()

    // 목록에 있는 프리셋을 고르면 그대로 진행된다.
    await user.click(screen.getByRole('button', { name: /기본형/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByLabelText('사용 목적')).toBeInTheDocument()
  })
})

describe('VM 신청 위저드 — OS·사양 축의 상호 보정', () => {
  test('OS를 고르면 디스크가 그 OS의 최소치까지 올라가고, 그보다 큰 값은 유지된다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByRole('heading', { name: 'VM 신청' })
    await passStep1(user)

    await user.click(screen.getByRole('button', { name: /Ubuntu 24\.04 LTS/ }))
    await user.click(screen.getByRole('button', { name: /기본형/ }))

    // 최소치 미만으로 직접 낮춘 뒤 OS를 (다시) 고르면 최소 디스크로 보정된다.
    const disk = screen.getByLabelText('디스크 (GiB)')
    await user.clear(disk)
    await user.type(disk, '5')
    await user.click(screen.getByRole('button', { name: /Ubuntu 24\.04 LTS/ }))
    expect(screen.getByLabelText('디스크 (GiB)')).toHaveValue(10)

    // 최소치를 이미 넘는 값은 OS 선택으로 줄어들지 않는다.
    await user.clear(screen.getByLabelText('디스크 (GiB)'))
    await user.type(screen.getByLabelText('디스크 (GiB)'), '20')
    await user.click(screen.getByRole('button', { name: /Ubuntu 24\.04 LTS/ }))
    expect(screen.getByLabelText('디스크 (GiB)')).toHaveValue(20)

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByLabelText('사용 목적')).toBeInTheDocument()
  })
})

describe('VM 신청 위저드 — 빈 OS 카탈로그', () => {
  // 갓 설치한 환경은 카탈로그가 비어 있다. 마이그레이션이 심는 행은 그 호스트에
  // 없을 수도 있는 템플릿을 가리키므로, 카탈로그는 운영자가 실제 템플릿을 등록할
  // 때까지 비어 있는 것이 정상이다. 그때 이 단계가 빈 격자만 보여 주면 사용자는
  // "OS를 선택해 주세요"라는 따를 수 없는 안내 앞에 멈춘다.
  test('고를 OS가 없으면 빈 격자 대신 이유를 안내한다', async () => {
    const user = userEvent.setup()
    server.use(http.get('*/api/v1/templates', () => HttpResponse.json([], { status: 200 })))
    renderWizard()
    await screen.findByRole('heading', { name: 'VM 신청' })
    await passStep1(user)

    expect(
      await screen.findByText(/신청할 수 있는 OS가 아직 없습니다/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ubuntu/ })).not.toBeInTheDocument()
  })
})

describe('VM 신청 위저드 — 희망 호스트명(슬러그)', () => {
  // 서버가 게이트웨이 호스트를 주면 그것을, 못 주면 상수를 쓴다. fallback 분기는
  // 도메인 전환 때마다 갱신을 잊기 쉬운데 그동안 어떤 테스트도 태우지 않았다.
  test('SSH 게이트웨이 호스트는 서버 값을 쓰고, 응답이 없으면 상수로 안내한다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByRole('heading', { name: 'VM 신청' })
    await user.selectOptions(await screen.findByLabelText('신청 그룹'), '12')
    await user.selectOptions(screen.getByLabelText('기관'), '1')
    expect(screen.getByText(new RegExp(`@${requestOptions.sshHost}`))).toBeInTheDocument()
  })

  test('형식·예약어를 검사하고, 비워 두면 자동 생성으로 제출된다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByRole('heading', { name: 'VM 신청' })
    await user.selectOptions(await screen.findByLabelText('신청 그룹'), '12')
    await user.selectOptions(screen.getByLabelText('기관'), '1')

    const slugInput = screen.getByLabelText('희망 호스트명(슬러그)')
    // 형식 위반
    await user.type(slugInput, 'My-Server')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(
      await screen.findByText(/호스트명\(슬러그\)은 소문자·숫자·하이픈만/),
    ).toBeInTheDocument()
    // 예약어
    await user.clear(slugInput)
    await user.type(slugInput, 'admin')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText(/예약된 이름이라 사용할 수 없습니다/)).toBeInTheDocument()
    // 비워 두면 통과 + 요약에 자동 생성 표시, 페이로드 null
    await user.clear(slugInput)
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.click(screen.getByRole('button', { name: /Ubuntu 24\.04 LTS/ }))
    await user.click(screen.getByRole('button', { name: /기본형/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.type(screen.getByLabelText('사용 목적'), '실습')
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(screen.getByText('자동 생성')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '신청 제출' }))
    await screen.findByRole('heading', { name: '신청이 접수되었습니다' })
    expect(createdVmRequestBodies.at(-1)).toMatchObject({
      desiredSlug: null,
      displayName: null,
    })
  })
})

describe('VM 신청 위저드 — 제출', () => {
  test('전체 단계를 통과하면 계약에 맞는 페이로드로 제출하고 완료 화면을 보여준다', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByRole('heading', { name: 'VM 신청' })

    // ① 그룹·기관·이름
    await user.selectOptions(await screen.findByLabelText('신청 그룹'), '12')
    await user.selectOptions(screen.getByLabelText('기관'), '1')
    await user.type(screen.getByLabelText('표시명'), '캡스톤 백엔드 서버')
    await user.type(screen.getByLabelText('희망 호스트명(슬러그)'), 'capstone-api-server')
    await user.click(screen.getByRole('button', { name: '다음' }))

    // ② OS·사양 (프리셋 값 그대로)
    await user.click(screen.getByRole('button', { name: /Ubuntu 24\.04 LTS/ }))
    await user.click(screen.getByRole('button', { name: /기본형/ }))
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

    // ④ 확인·제출: 요약·백업 책임 고지 확인 후 제출
    expect(screen.getByText('신청 내용 확인')).toBeInTheDocument()
    // 요약에 두 축이 각각 나온다.
    expect(screen.getByText('Ubuntu 24.04 LTS')).toBeInTheDocument()
    expect(screen.getByText('기본형')).toBeInTheDocument()
    expect(screen.getByText('capstone-api-server')).toBeInTheDocument()
    expect(screen.getByText('캡스톤 백엔드 서버')).toBeInTheDocument()
    expect(screen.getByText('2 vCPU · 2 GiB · 20 GiB')).toBeInTheDocument()
    expect(screen.getByText('백업 책임 안내')).toBeInTheDocument()
    expect(
      screen.getByText(
        /플랫폼은 VM 데이터를 백업하지 않습니다\. 데이터 보호와 백업은 사용자 책임이며, 삭제된 VM의 데이터는 복구할 수 없습니다\./,
      ),
    ).toBeInTheDocument()
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
      flavorId: 2,
      purpose: '캡스톤 백엔드 API 서버 운영',
      courseOrProject: '2026-1 캡스톤디자인',
      specReason: null,
      extraNote: null,
      reqVcpu: 2,
      reqMemoryMb: 2048,
      reqDiskGb: 20,
      reqStartDate: '2026-07-15',
      reqEndDate: '2026-12-20',
      displayName: '캡스톤 백엔드 서버',
      desiredSlug: 'capstone-api-server',
    })
  })
})
