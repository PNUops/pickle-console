import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { GuideFigure } from './GuideFigure'

test('describes the screenshot and opens that same original in a new tab', () => {
  const caption = '가상머신 상세의 개요에서 상태와 접속 정보를 확인합니다.'
  render(
    <GuideFigure
      src="/assets/vm-connection.png"
      alt="가상머신 개요의 SSH 접속 명령과 웹 터미널 버튼"
      caption={caption}
      width={1280}
      height={720}
    />,
  )

  const figure = screen.getByRole('figure', { name: caption })
  const image = screen.getByRole('img', { name: '가상머신 개요의 SSH 접속 명령과 웹 터미널 버튼' })
  const link = screen.getByRole('link', { name: /SSH 접속 명령과 웹 터미널 버튼.*새 탭에서 원본 이미지 열기/ })
  expect(figure).toContainElement(image)
  expect(image).toHaveAttribute('loading', 'lazy')
  expect(image).toHaveAttribute('decoding', 'async')
  expect(image).toHaveAttribute('width', '1280')
  expect(image).toHaveAttribute('height', '720')
  expect(link).toHaveAttribute('href', image.getAttribute('src'))
  expect(link).toHaveAttribute('target', '_blank')
  expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
  expect(link).toHaveAccessibleDescription(caption)
})

test('keeps each caption associated with its own keyboard-accessible image', async () => {
  render(
    <>
      <GuideFigure src="/assets/workspace-members.png" alt="워크스페이스 구성원 목록" caption="구성원과 역할을 확인합니다." />
      <GuideFigure src="/assets/resource-access.png" alt="리소스 접근 목록" caption="리소스별 접근 등급을 확인합니다." />
    </>,
  )
  const user = userEvent.setup()
  const links = screen.getAllByRole('link')
  expect(links[0].getAttribute('aria-describedby')).not.toBe(links[1].getAttribute('aria-describedby'))
  expect(links[0]).toHaveAccessibleDescription('구성원과 역할을 확인합니다.')
  expect(links[1]).toHaveAccessibleDescription('리소스별 접근 등급을 확인합니다.')
  await user.tab()
  expect(links[0]).toHaveFocus()
  await user.tab()
  expect(links[1]).toHaveFocus()
})
