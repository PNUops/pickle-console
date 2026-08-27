import { describe, expect, test } from 'vitest'
import { vmEventActorLabel } from './status'

/**
 * 수행자 한 칸의 판정. 이 표에서 잘못 떨어지면 둘 중 하나가 일어난다 —
 * 관리자 개인이 워크스페이스에 공개되거나, 하지 않은 개입이 동료에게 씌워진다.
 * 둘 다 영구 보존 이력이라 화면에서만 고칠 수 있는 종류의 실수가 아니다.
 */
describe('vmEventActorLabel', () => {
  test('배경 작업은 시스템', () => {
    expect(vmEventActorLabel({ actorKind: 'SYSTEM', actorId: null })).toBe('시스템')
  })

  test('동료 조작은 그 사람 이름', () => {
    expect(vmEventActorLabel({ actorKind: 'MEMBER', actorId: 'u1', actorName: '홍길동' })).toBe(
      '홍길동',
    )
  })

  test('관리자 개입은 이름이 실려 와도 관리자로만', () => {
    // 사용자용 응답은 서버가 이름을 비우지만, 회귀로 실려 오더라도 화면에 나가지
    // 않는 것이 이 분기의 목적이다.
    expect(vmEventActorLabel({ actorKind: 'ADMIN', actorId: 'a1', actorName: '이운영' })).toBe(
      '관리자',
    )
  })

  test('수행 화면이 기록되기 전 행은 이름 없이 사용자', () => {
    expect(vmEventActorLabel({ actorKind: 'UNKNOWN', actorId: null })).toBe('사용자')
  })

  test('이름이 비어 오는 동료 행은 사용자로 떨어진다', () => {
    expect(vmEventActorLabel({ actorKind: 'MEMBER', actorId: 'u1', actorName: null })).toBe(
      '사용자',
    )
  })

  describe('종류를 모를 때는 이 필드가 생기기 전 규칙으로', () => {
    // api가 콘솔보다 늦게 배포되거나 롤백되면 응답에 actorKind가 없다. 남은
    // 분기로 흘려보내면 프로비저너가 남긴 CREATE 행이 "사용자"로 보인다.
    test('종류가 없고 수행자도 없으면 시스템', () => {
      expect(vmEventActorLabel({ actorId: null })).toBe('시스템')
    })

    test('종류가 없고 수행자가 있으면 사용자', () => {
      expect(vmEventActorLabel({ actorId: 'u1', actorName: '홍길동' })).toBe('사용자')
    })

    test('이 빌드가 모르는 종류도 같은 규칙', () => {
      const future = { actorKind: 'DELEGATE' as never, actorId: 'u1', actorName: '홍길동' }
      expect(vmEventActorLabel(future)).toBe('사용자')
    })
  })
})
