import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { orgAdminProfile, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { adminUserStore } from '../test/msw/handlers/users'
import { uuid } from '../test/msw/ids'
import { renderApp } from '../test/render'

function selected(work: string[], scoped = false) {
  const context = mockInstitutionAuthority(orgAdminProfile)
  context.accountRole = 'ORG_MANAGER'
  context.authorityFingerprint = `synthetic-governance:${work.join(',')}`
  context.assignments[0].permission = { mode: 'SELECTED', revision: 14, work,
    scopes: scoped ? { WORKSPACE: { mode: 'LISTED', workspaceIds: [uuid(12)] } } : {} }
  AUTHORITY_OVERRIDES[orgAdminProfile.id] = context
  server.use(refreshSuccessHandler('access-org-admin'))
}

test('a qualified workspace sender completes delivery without institution-wide sending or history reads', async () => {
  selected(['workspace.announcement.send'], true)
  let historyReads = 0
  server.use(http.get('*/api/v1/admin/announcements', () => { historyReads++; return new HttpResponse(null, { status: 403 }) }))
  renderApp('/admin/announcements')
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: '알림 보내기' })
  expect(screen.queryByRole('radio', { name: /전체/ })).not.toBeInTheDocument()
  expect(screen.getByRole('radio', { name: '특정 워크스페이스' })).toBeChecked()
  const workspaces = screen.getByRole('combobox', { name: '대상 워크스페이스' })
  await screen.findByRole('option', { name: '캡스톤 3조' })
  expect(within(workspaces).queryByRole('option', { name: 'AI 동아리' })).not.toBeInTheDocument()
  await user.selectOptions(workspaces, uuid(12))
  await user.type(screen.getByRole('textbox', { name: '제목' }), 'Synthetic scoped notice')
  await user.type(screen.getByRole('textbox', { name: '내용' }), 'Synthetic recipients only.')
  await user.click(screen.getByRole('button', { name: '발송 대상 미리보기' }))
  await user.click(await screen.findByRole('button', { name: '검토한 알림 발송' }))
  await user.click(within(screen.getByRole('dialog', { name: '알림 발송 확인' })).getByRole('button', { name: '발송' }))
  await screen.findByText(/발송건 'Synthetic scoped notice'/)
  expect(screen.queryByRole('button', { name: '저장한 발송건 보기' })).not.toBeInTheDocument()
  expect(historyReads).toBe(0)
})

test('student lookup alone never requests the relationship graph or invents unavailable counts', async () => {
  selected(['student.lookup'])
  let supportReads = 0
  server.use(http.get('*/api/v1/admin/users/:userId/support', () => { supportReads++; return new HttpResponse(null, { status: 403 }) }))
  renderApp(`/admin/users/${uuid(42)}`)
  await screen.findByText('관계 조회는 사용자 지원 업무가 별도로 필요합니다. 프로필 정정과 최소 사용자 조회 권한은 유지됩니다.')
  expect(screen.getByText('상태 이력은 현재 업무로 제공되지 않습니다.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '정정' })).not.toBeInTheDocument()
  expect(screen.queryByText('연구팀')).not.toBeInTheDocument()
  expect(supportReads).toBe(0)
})

test('student support alone shows unavailable graph sections instead of empty relationships', async () => {
  selected(['student.support.read'])
  renderApp(`/admin/users/${uuid(42)}`)
  await screen.findByText('워크스페이스 관계를 제공할 수 없습니다.')
  await waitFor(() => expect(screen.queryByText('연구팀')).not.toBeInTheDocument())
  expect(screen.queryByText('활성 VM 0')).not.toBeInTheDocument()
})

test('a profile correction flag cannot outrun the current authority context', async () => {
  selected(['student.support.read'])
  const target = adminUserStore.find((user) => user.id === uuid(42))!
  server.use(http.get('*/api/v1/admin/users/:userId', () => HttpResponse.json({ ...target, relationshipsLimited: true,
    supportCapabilities: { profileVisible: true, canCorrectProfile: true, canEnableAccount: false } })))
  renderApp(`/admin/users/${target.id}`)
  await screen.findByRole('heading', { name: target.name })
  expect(screen.queryByRole('button', { name: '정정' })).not.toBeInTheDocument()
})
