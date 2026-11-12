import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, type NotificationPage, type NotificationView } from '../api/queries'
import { toApiError } from '../api/problem'
import { getAuthorityGeneration } from '../api/authority-generation'
import { getSessionGeneration } from '../api/token'
import { useAuth } from '../auth/auth-context'
import { authorityKey } from '../auth/institution-authority'
import { isUuid } from './validation'

export const USAGE_ALERT_EVENT = 'llm.usage.threshold'

/** A new usage read may navigate only to its ordinary key detail route. */
export function usageNotificationPath(notification: NotificationView): string | null {
  if (notification.event !== USAGE_ALERT_EVENT || !notification.linkPath) return null
  const match = /^\/console\/llm-keys\/([^/?#]+)$/.exec(notification.linkPath)
  return match && isUuid(match[1]) ? notification.linkPath : null
}

export interface NotificationReader { account: string; context: string }

/** Context isolates responses; it does not attest the freshness of a resource ACL. */
export function useNotificationReader(): NotificationReader | null {
  const { user, status } = useAuth()
  if (status !== 'authenticated' || !user) return null
  const memberships = user.memberships.map((row) => [row.workspaceId, row.role])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return { account: JSON.stringify([user.id, getSessionGeneration()]),
    context: JSON.stringify([user.status, authorityKey(user), memberships, getAuthorityGeneration()]) }
}

export function sameNotificationReader(a: NotificationReader | null | undefined, b: NotificationReader | null | undefined): boolean {
  return a != null && b != null && a.account === b.account && a.context === b.context
}

export function useCurrentNotificationReader(reader: NotificationReader | null) {
  const current = useRef(reader)
  useLayoutEffect(() => {
    current.current = reader
    return () => { current.current = null }
  }, [reader])
  return current
}

export const notificationKeys = {
  reader: (reader: NotificationReader | null) => ['notifications', reader?.account, reader?.context] as const,
  list: (reader: NotificationReader | null, params: Parameters<typeof fetchNotifications>[0]) =>
    [...notificationKeys.reader(reader), 'list', params] as const,
  unread: (reader: NotificationReader | null) => [...notificationKeys.reader(reader), 'unread-count'] as const,
  read: (reader: NotificationReader | null) => [...notificationKeys.reader(reader), 'read-command'] as const,
}

interface OwnedList { reader: NotificationReader; response: NotificationPage }

/** Only usage events require renewed resource access; legacy inbox policy is preserved. */
export function useNotificationList(reader: NotificationReader | null,
  params: Parameters<typeof fetchNotifications>[0], enabled = true) {
  const current = useCurrentNotificationReader(reader)
  const readPending = useIsMutating({ mutationKey: notificationKeys.read(reader) }) > 0
  const legacy = useRef<OwnedList | null>(null)
  const query = useQuery({
    queryKey: notificationKeys.list(reader, params),
    queryFn: async () => {
      if (reader == null || !sameNotificationReader(current.current, reader)) throw new Error('로그인 상태를 확인해 주세요.')
      const response = await fetchNotifications(params)
      if (!sameNotificationReader(current.current, reader)) throw new Error('알림 조회 상태가 바뀌었어요. 다시 조회해 주세요.')
      return { reader, response }
    },
    enabled: reader != null && enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  })
  useEffect(() => {
    if (legacy.current?.reader.account !== reader?.account) legacy.current = null
    if (query.data && query.data.reader.account === reader?.account) legacy.current = query.data
  }, [reader?.account, query.data])
  const record = query.data?.reader.account === reader?.account ? query.data
    : legacy.current?.reader.account === reader?.account ? legacy.current : undefined
  const currentResponse = record != null && record === query.data
    && sameNotificationReader(record.reader, reader) && !query.isFetching && !query.isError && !readPending
  const data = record == null || reader == null ? undefined : currentResponse ? record.response
    : { ...record.response, content: record.response.content.filter((row) => row.event !== USAGE_ALERT_EVENT) }
  return { ...query, data, currentResponse, showingLegacySnapshot: record != null && !currentResponse,
    isPending: reader != null && enabled && !currentResponse && !query.isError }
}

export function useNotificationUnread(reader: NotificationReader | null) {
  const current = useCurrentNotificationReader(reader)
  const readPending = useIsMutating({ mutationKey: notificationKeys.read(reader) }) > 0
  const query = useQuery({
    queryKey: notificationKeys.unread(reader),
    queryFn: async () => {
      if (reader == null || !sameNotificationReader(current.current, reader)) throw new Error('로그인 상태를 확인해 주세요.')
      const response = await fetchUnreadCount()
      if (!sameNotificationReader(current.current, reader)) throw new Error('알림 조회 상태가 바뀌었어요. 다시 조회해 주세요.')
      return { reader, response }
    },
    enabled: reader != null,
    refetchInterval: 30_000,
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const data = sameNotificationReader(query.data?.reader, reader)
    && !query.isFetching && !query.isError && !readPending ? query.data?.response : undefined
  const value = data?.unreadCount
  const count = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
  return { ...query, data, count }
}

/** Late mutation outcomes belong only to the reader that started the command. */
export function useNotificationActions(reader: NotificationReader | null) {
  const client = useQueryClient()
  const current = useCurrentNotificationReader(reader)
  const [failure, setFailure] = useState<{ reader: NotificationReader; message: string } | null>(null)
  const success = async (operation: { reader: NotificationReader | null }) => {
    if (!sameNotificationReader(current.current, operation.reader)) return
    setFailure(null)
    await client.invalidateQueries({ queryKey: notificationKeys.reader(operation.reader) })
  }
  const fail = async (error: unknown, operation: { reader: NotificationReader | null }) => {
    if (operation.reader && sameNotificationReader(current.current, operation.reader)) {
      setFailure({ reader: operation.reader, message: toApiError(error, '알림을 읽음으로 표시하지 못했어요.').message })
      await client.invalidateQueries({ queryKey: notificationKeys.reader(operation.reader) })
    }
  }
  const read = useMutation({
    mutationKey: notificationKeys.read(reader),
    mutationFn: (operation: { id: string; reader: NotificationReader | null }) => {
      if (!sameNotificationReader(current.current, operation.reader)) throw new Error('알림 조회 상태가 바뀌었어요.')
      return markNotificationRead(operation.id)
    },
    onSuccess: (_data, operation) => success(operation), onError: fail,
  })
  const all = useMutation({
    mutationKey: notificationKeys.read(reader),
    mutationFn: (operation: { reader: NotificationReader | null }) => {
      if (!sameNotificationReader(current.current, operation.reader)) throw new Error('알림 조회 상태가 바뀌었어요.')
      return markAllNotificationsRead()
    },
    onSuccess: (_data, operation) => success(operation), onError: fail,
  })
  return { markRead: { ...read, isPending: read.isPending && sameNotificationReader(read.variables?.reader, reader) },
    markAll: { ...all, isPending: all.isPending && sameNotificationReader(all.variables?.reader, reader) },
    error: failure && sameNotificationReader(failure.reader, reader) ? failure.message : null,
    reportError: (message: string, candidate: NotificationReader | null) => {
      if (candidate && sameNotificationReader(current.current, candidate)) setFailure({ reader: candidate, message })
    },
    isCurrentReader: (candidate: NotificationReader | null) => sameNotificationReader(current.current, candidate) }
}
