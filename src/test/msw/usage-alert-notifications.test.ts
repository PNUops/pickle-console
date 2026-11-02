import { expect, test } from 'vitest'
import { fetchNotifications, fetchUnreadCount, markNotificationRead } from '../../api/queries'
import { setAccessToken } from '../../api/token'
import { llmKeyStore } from './handlers/llm-keys'
import { notificationStore, seedUsageAlertNotifications } from './handlers/notifications'
import { uuid } from './ids'

test('usage fixture list count and read share the ordinary standing without masking legacy rows', async () => {
  setAccessToken('access-user')
  seedUsageAlertNotifications('demo')
  const before = await fetchNotifications()
  const usage = before.content.filter((row) => row.event === 'llm.usage.threshold')
  expect(usage).toHaveLength(2)
  expect(usage.every((row) => Object.keys(row).length === 8)).toBe(true)
  expect((await fetchUnreadCount()).unreadCount).toBe(4)
  llmKeyStore.find((row) => row.id === uuid(70))!.myResourceRole = null
  const after = await fetchNotifications()
  expect(after.content.some((row) => row.event === 'llm.usage.threshold')).toBe(false)
  expect(after.totalElements).toBe(3)
  expect((await fetchUnreadCount()).unreadCount).toBe(2)
  await expect(markNotificationRead(usage[0].id)).rejects.toMatchObject({ problem: { status: 404 } })
  expect(notificationStore.find((row) => row.id === usage[0].id)!.readAt).toBeNull()
})

test('legacy read behavior remains independent of the new usage standing', async () => {
  setAccessToken('access-user')
  seedUsageAlertNotifications('access-revoked')
  const legacy = await markNotificationRead(uuid(301))
  expect(legacy.title).toBe('VM 생성 완료')
  expect(legacy.readAt).not.toBeNull()
  expect((await fetchUnreadCount()).unreadCount).toBe(1)
})

test('another mock account has no earlier account notifications or unread count', async () => {
  seedUsageAlertNotifications('demo')
  setAccessToken('access-user-b')
  const page = await fetchNotifications()
  expect(page.content).toHaveLength(0)
  expect(page.totalElements).toBe(0)
  expect((await fetchUnreadCount()).unreadCount).toBe(0)
})

test('fixture errors reject reads instead of returning invented empty or zero data', async () => {
  setAccessToken('access-user')
  seedUsageAlertNotifications('error')
  await expect(fetchNotifications()).rejects.toMatchObject({ problem: { status: 503 } })
  await expect(fetchUnreadCount()).rejects.toMatchObject({ problem: { status: 503 } })
})
