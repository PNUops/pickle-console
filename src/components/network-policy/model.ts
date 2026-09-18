export const MAX_SOURCE_CIDRS = 128
export const MAX_USER_RULES = 128

export interface SourcePolicyDraft {
  cidrsText: string
}

export interface SourcePolicyValue {
  allowedCidrs: string[]
}

export type NetworkPolicyObservation =
  | { state: 'INACTIVE' }
  | { state: 'PENDING' }
  | { state: 'APPLIED' }
  | { state: 'FAILED'; message: string }

export type RuleDirection = 'IN' | 'OUT'
export type RuleAction = 'ACCEPT' | 'DROP'
export type RuleProtocol = 'ANY' | 'TCP' | 'UDP' | 'ICMP' | 'ICMPV6'

export interface VmRuleDraft {
  id: string
  direction: RuleDirection
  action: RuleAction
  protocol: RuleProtocol
  cidr: string
  ports: string
}

export interface VmRuleValue {
  direction: RuleDirection
  action: RuleAction
  protocol: RuleProtocol
  peer: string
  portStart: number | null
  portEnd: number | null
}

export const DIRECTION_LABELS: Record<RuleDirection, string> = { IN: '수신', OUT: '송신' }
export const ACTION_LABELS: Record<RuleAction, string> = { ACCEPT: '허용', DROP: '차단' }
export const PROTOCOL_LABELS: Record<RuleProtocol, string> = {
  ANY: '전체', TCP: 'TCP', UDP: 'UDP', ICMP: 'ICMP', ICMPV6: 'ICMPv6',
}

/** Convert user-entered addresses to wire CIDRs without silently widening them. */
export function normalizeNetwork(value: string, ipv4Only = false): { cidr: string; family: 4 | 6 } {
  const [address, rawPrefix, ...rest] = value.trim().split('/')
  if (!address || rest.length || rawPrefix !== undefined && !/^(0|[1-9]\d{0,2})$/.test(rawPrefix)) {
    throw new Error('IP 또는 CIDR 형식을 확인해 주세요.')
  }
  const family = address.includes(':') ? 6 : 4
  if (family === 6 && ipv4Only) throw new Error('IPv4 주소만 입력할 수 있습니다.')
  const bits = family === 4 ? 32 : 128
  const prefix = rawPrefix === undefined ? bits : Number(rawPrefix)
  if (prefix > bits) throw new Error(`CIDR 범위는 0–${bits}이어야 합니다.`)
  const parsed = family === 4 ? parseIPv4(address) : parseIPv6(address)
  const mask = ((1n << BigInt(prefix)) - 1n) << BigInt(bits - prefix)
  if ((parsed.value & mask) !== parsed.value) {
    throw new Error('CIDR에는 네트워크 시작 주소를 입력해 주세요.')
  }
  return { cidr: `${parsed.address}/${prefix}`, family }
}

function parseIPv4(address: string) {
  const parts = address.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) {
    throw new Error('올바른 IPv4 주소를 입력해 주세요.')
  }
  return {
    address: parts.join('.'),
    value: parts.reduce((acc, part) => (acc << 8n) + BigInt(part), 0n),
  }
}

function parseIPv6(address: string) {
  if (!/^[\da-f:]+$/i.test(address)) throw new Error('올바른 IPv6 주소를 입력해 주세요.')
  const halves = address.split('::')
  if (halves.length > 2) throw new Error('올바른 IPv6 주소를 입력해 주세요.')
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const count = left.length + right.length
  if ([...left, ...right].some((part) => !/^[\da-f]{1,4}$/i.test(part)) ||
      (halves.length === 1 ? count !== 8 : count >= 8)) {
    throw new Error('올바른 IPv6 주소를 입력해 주세요.')
  }
  const groups = [
    ...left.map((part) => Number.parseInt(part, 16)),
    ...Array<number>(halves.length === 2 ? 8 - count : 0).fill(0),
    ...right.map((part) => Number.parseInt(part, 16)),
  ]
  const value = groups.reduce((acc, part) => (acc << 16n) + BigInt(part), 0n)
  if (value >> 32n === 0xffffn) throw new Error('IPv4 주소를 IPv6 형식으로 바꾸어 입력할 수 없습니다.')
  let bestStart = -1
  let bestLength = 1
  for (let start = 0; start < groups.length; start += 1) {
    if (groups[start] !== 0) continue
    let end = start
    while (end < groups.length && groups[end] === 0) end += 1
    if (end - start > bestLength) {
      bestStart = start
      bestLength = end - start
    }
    start = end - 1
  }
  const words = groups.map((part) => part.toString(16))
  const canonical = bestStart < 0
    ? words.join(':')
    : `${words.slice(0, bestStart).join(':')}::${words.slice(bestStart + bestLength).join(':')}`
  return { address: canonical, value }
}

export function parseSourcePolicy(draft: SourcePolicyDraft, ipv4Only = false): SourcePolicyValue {
  const lines = draft.cidrsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length > MAX_SOURCE_CIDRS) throw new Error(`출발지는 ${MAX_SOURCE_CIDRS}개까지 입력할 수 있습니다.`)
  const allowedCidrs: string[] = []
  for (const [index, line] of lines.entries()) {
    let cidr: string
    try {
      cidr = normalizeNetwork(line, ipv4Only).cidr
    } catch (error) {
      throw new Error(`${index + 1}번째 주소: ${error instanceof Error ? error.message : '주소를 확인해 주세요.'}`, { cause: error })
    }
    if (allowedCidrs.includes(cidr)) throw new Error(`${index + 1}번째 주소가 중복됩니다.`)
    allowedCidrs.push(cidr)
  }
  return { allowedCidrs }
}

/** Copy the currently confirmed campus networks into the editable policy snapshot. */
export function appendCampusPreset(
  draft: SourcePolicyDraft,
  campusCidrs: readonly string[],
  ipv4Only = false,
): SourcePolicyDraft {
  const allowedCidrs = parseSourcePolicy(draft, ipv4Only).allowedCidrs
  for (const value of campusCidrs) {
    let cidr: string
    try {
      cidr = normalizeNetwork(value, ipv4Only).cidr
    } catch (error) {
      throw new Error(
        `교내 주소 목록: ${error instanceof Error ? error.message : '주소를 확인해 주세요.'}`,
        { cause: error },
      )
    }
    if (!allowedCidrs.includes(cidr)) allowedCidrs.push(cidr)
  }
  if (allowedCidrs.length > MAX_SOURCE_CIDRS) {
    throw new Error(`교내 주소를 추가하면 출발지가 ${MAX_SOURCE_CIDRS}개를 넘습니다.`)
  }
  return { cidrsText: allowedCidrs.join('\n') }
}

export function parseVmRule(draft: VmRuleDraft, ipv4Only = false): VmRuleValue {
  const peer = normalizeNetwork(draft.cidr, ipv4Only)
  if (draft.protocol === 'ICMP' && peer.family !== 4 || draft.protocol === 'ICMPV6' && peer.family !== 6) {
    throw new Error('주소 종류에 맞는 ICMP 프로토콜을 선택해 주세요.')
  }
  let portStart: number | null = null
  let portEnd: number | null = null
  const ports = draft.ports.trim()
  if (ports) {
    if (draft.protocol !== 'TCP' && draft.protocol !== 'UDP') throw new Error('TCP와 UDP에만 포트를 지정할 수 있습니다.')
    const match = /^(\d{1,5})(?:\s*-\s*(\d{1,5}))?$/.exec(ports)
    if (!match) throw new Error('포트 번호 또는 범위를 입력해 주세요. (예: 443, 8000-8010)')
    portStart = Number(match[1])
    portEnd = Number(match[2] ?? match[1])
    if (portStart < 1 || portEnd > 65535 || portStart > portEnd) {
      throw new Error('포트 범위는 1–65535 안에서 작은 번호부터 입력해 주세요.')
    }
  }
  return { direction: draft.direction, action: draft.action, protocol: draft.protocol, peer: peer.cidr, portStart, portEnd }
}
