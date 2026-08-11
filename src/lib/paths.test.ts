import { describe, expect, test } from 'vitest'
import { consolePathInScope, consolePaths } from './paths'
import { uuid } from '../test/msw/ids'

const SCOPE = uuid(15)
const OTHER = uuid(21)

/**
 * 범위 세그먼트를 알아보는 규칙 — 콘솔 주소에서 워크스페이스를 읽어내는 곳.
 *
 * 이 규칙이 틀리면 아무것도 던지지 않는다: `/console/<uuid>/vms`가 범위 없는
 * 주소로 읽히고 화면은 멀쩡히 그려진다. 그래서 렌더 결과가 아니라 만들어진
 * 주소 자체를 확인한다.
 */
describe('consolePathInScope — 범위 세그먼트 인식', () => {
  test('범위가 걸린 목록은 다른 범위로 옮겨도 같은 목록에 머문다', () => {
    expect(consolePathInScope(OTHER, `/console/${SCOPE}/vms`)).toBe(`/console/${OTHER}/vms`)
    expect(consolePathInScope(OTHER, `/console/${SCOPE}/resources`)).toBe(
      `/console/${OTHER}/resources`,
    )
    expect(consolePathInScope(OTHER, `/console/${SCOPE}/requests/new`)).toBe(
      `/console/${OTHER}/requests/new`,
    )
    // 등재를 빠뜨리면 워크스페이스를 바꿀 때 조용히 대시보드로 떨어진다.
    expect(consolePathInScope(OTHER, `/console/${SCOPE}/llm-keys`)).toBe(
      `/console/${OTHER}/llm-keys`,
    )
  })

  test('범위 없는 목록에서 범위를 걸면 그 목록의 범위판으로 간다', () => {
    expect(consolePathInScope(SCOPE, '/console/vms')).toBe(`/console/${SCOPE}/vms`)
  })

  test('범위를 풀면 같은 목록의 범위 없는 주소로 돌아간다', () => {
    expect(consolePathInScope(null, `/console/${SCOPE}/vms`)).toBe('/console/vms')
  })

  test('한 워크스페이스에 매인 화면은 범위를 바꾸면 그 범위의 대시보드로 떨어진다', () => {
    // 상세는 이미 워크스페이스가 정해져 있어 범위 세그먼트가 담을 정보가 없다.
    expect(consolePathInScope(SCOPE, `/console/vms/${uuid(56)}`)).toBe(`/console/${SCOPE}`)
    expect(consolePathInScope(SCOPE, `/console/workspaces/${uuid(12)}`)).toBe(
      `/console/${SCOPE}`,
    )
    expect(consolePathInScope(SCOPE, '/console/account')).toBe(`/console/${SCOPE}`)
    expect(consolePathInScope(SCOPE, `/console/llm-keys/${uuid(70)}`)).toBe(
      `/console/${SCOPE}`,
    )
  })

  test('목록 이름을 범위로 착각하지 않는다', () => {
    // 'vms'는 세그먼트 첫 자리에 오지만 범위가 아니다 — 잘라내면 목록을 잃는다.
    expect(consolePathInScope(SCOPE, '/console/requests')).toBe(`/console/${SCOPE}/requests`)
  })
})

describe('consolePaths — 상세 주소', () => {
  test('상세 주소는 범위 밖에 그대로 만들어진다', () => {
    expect(consolePaths.vmDetail(uuid(56))).toBe(`/console/vms/${uuid(56)}`)
    expect(consolePaths.vmTerminal(uuid(56))).toBe(`/console/vms/${uuid(56)}/terminal`)
    expect(consolePaths.requestDetail(uuid(201))).toBe(`/console/requests/${uuid(201)}`)
    expect(consolePaths.llmKeyDetail(uuid(70))).toBe(`/console/llm-keys/${uuid(70)}`)
    expect(consolePaths.llmKeyAccess(uuid(70))).toBe(`/console/llm-keys/${uuid(70)}/access`)
  })
})
