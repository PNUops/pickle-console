import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { AccessSection } from './AccessSection'
import { SSH_GATEWAY_HOST } from '../../lib/hosts'

// 랜딩은 비인증 화면이라 서버에서 게이트웨이 호스트를 받아 올 수 없고 상수를 그대로
// 렌더한다. 도메인이 바뀔 때 여기만 옛 값으로 남아 있어도 지금까지는 아무 테스트도
// 실패하지 않았다(터미널 목업도 같은 상수를 쓴다 — 타이핑 연출이라 여기서 단언하지
// 않고 상수 공유로 묶는다).
describe('랜딩 SSH 안내', () => {
  test('접속 방법 카드가 현재 게이트웨이 호스트를 안내한다', () => {
    render(<AccessSection />)
    expect(screen.getByText(`ssh <vm-slug>@${SSH_GATEWAY_HOST}`)).toBeInTheDocument()
  })
})
