import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Button } from './Button'
import { CommandBar } from './CommandBar'
import { DataTable } from './DataTable'
import { DescriptionList } from './DescriptionList'
import { EmptyState } from './EmptyState'
import { LoadingBlock } from './LoadingBlock'
import { MessageBar } from './MessageBar'
import { PageHeader } from './PageHeader'
import { TBody, TD, TH, THead, TR } from './Table'

describe('foundation primitives', () => {
  test('PageHeader는 페이지 heading과 action을 묶는다', () => {
    render(<PageHeader title="LLM API" description="API key를 관리합니다." actions={<Button>추가</Button>} />)
    expect(screen.getByRole('heading', { level: 1, name: 'LLM API' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '추가' })).toBeInTheDocument()
  })

  test('CommandBar는 이름 있는 toolbar와 줄바꿈 가능한 action group을 제공한다', () => {
    render(<CommandBar aria-label="리소스 동작" primary={<Button>새로 만들기</Button>} />)
    expect(screen.getByRole('toolbar', { name: '리소스 동작' })).toBeInTheDocument()
  })

  test('DataTable은 accessible caption을 필수로 렌더한다', () => {
    render(
      <DataTable caption="키 목록">
        <THead>
          <TR>
            <TH>이름</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD>research</TD>
          </TR>
        </TBody>
      </DataTable>,
    )
    expect(screen.getByRole('table', { name: '키 목록' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '이름' })).toBeInTheDocument()
  })

  test('DescriptionList는 term과 description 관계를 유지한다', () => {
    render(<DescriptionList items={[{ term: '상태', description: '활성' }]} />)
    expect(screen.getByText('상태').tagName).toBe('DT')
    expect(screen.getByText('활성').tagName).toBe('DD')
  })

  test('LoadingBlock과 EmptyState는 보조 기술에 현재 상태를 전달한다', () => {
    render(
      <>
        <LoadingBlock label="키 불러오는 중" />
        <EmptyState title="키가 없습니다" />
      </>,
    )
    expect(screen.getByRole('status', { name: '키 불러오는 중' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '키가 없습니다' })).toBeInTheDocument()
  })

  test('MessageBar danger는 alert이고 dismiss action에 accessible name이 있다', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(
      <MessageBar variant="danger" title="실패" onDismiss={onDismiss}>
        다시 시도하세요.
      </MessageBar>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('실패')
    await user.click(screen.getByRole('button', { name: '메시지 닫기' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  test('caller class가 Button variant 기본값을 override한다', () => {
    render(<Button className="bg-danger-600">재정의</Button>)
    expect(screen.getByRole('button', { name: '재정의' })).toHaveClass('bg-danger-600')
    expect(screen.getByRole('button', { name: '재정의' })).not.toHaveClass('bg-brand-fill')
  })
})
