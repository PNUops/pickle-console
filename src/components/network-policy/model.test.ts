import { describe, expect, test } from 'vitest'
import {
  MAX_SOURCE_CIDRS,
  appendCampusPreset,
  normalizeNetwork,
  parseSourcePolicy,
  parseVmRule,
  type VmRuleDraft,
} from './model'

describe('network input normalization', () => {
  test.each([
    ['192.0.2.7', '192.0.2.7/32'],
    [' 192.0.2.0/24 ', '192.0.2.0/24'],
    ['0.0.0.0/0', '0.0.0.0/0'],
    ['2001:0DB8:0:0:0:0:0:7', '2001:db8::7/128'],
    ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1/128'],
    ['2001:db8:0:1:0:0:0:1', '2001:db8:0:1::1/128'],
    ['2001:db8::/32', '2001:db8::/32'],
    ['::/0', '::/0'],
    ['::1', '::1/128'],
    ['1::', '1::/128'],
  ])('normalizes %s without broadening it', (raw, expected) => {
    expect(normalizeNetwork(raw).cidr).toBe(expected)
  })

  test.each([
    '', 'example.com', '192.0.2.7/24', '192.0.2.0/024', '192.0.2.0/33', '192.0.2.1/32/1',
    '192.00.2.7', '256.0.0.0', '0xC0000207', '192.0.2.0/24; allow all',
    '2001:db8::7/32', '2001:db8::/129', '2001:db8:::/32', '2001::db8::',
    '2001:db8:1:2:3:4:5:6:7', '1:2:3:4:5:6:7:', ':1:2:3:4:5:6:7',
    '::ffff:192.0.2.7', '::ffff:c000:207', 'fe80::1%eth0', '[2001:db8::1]',
  ])('rejects ambiguous or unsafe input %s', (raw) => {
    expect(() => normalizeNetwork(raw)).toThrow()
  })

  test('rejects IPv6 on IPv4-only surfaces', () => {
    expect(() => normalizeNetwork('2001:db8::/32', true)).toThrow('IPv4')
  })
})

describe('source policy input', () => {
  test('keeps an explicit empty list instead of inventing public access', () => {
    expect(parseSourcePolicy({ cidrsText: '\n  \n' })).toEqual({ allowedCidrs: [] })
  })

  test('snapshots normalized preset addresses without duplicating direct input', () => {
    expect(appendCampusPreset(
      { cidrsText: '192.0.2.7\r\n2001:DB8::/32' },
      ['192.0.2.7/32', '10.0.0.0/8'],
    )).toEqual({
      cidrsText: '192.0.2.7/32\n2001:db8::/32\n10.0.0.0/8',
    })
  })

  test('rejects duplicates after normalization', () => {
    expect(() => parseSourcePolicy({ cidrsText: '192.0.2.7\n192.0.2.7/32' })).toThrow('중복')
    expect(() => parseSourcePolicy({ cidrsText: '2001:db8::1\n2001:DB8:0:0:0:0:0:1/128' })).toThrow('중복')
  })

  test('enforces the same direct CIDR limit as the appliers', () => {
    const lines = Array.from({ length: MAX_SOURCE_CIDRS }, (_, i) => `192.0.2.${i}`)
    expect(parseSourcePolicy({ cidrsText: lines.join('\n') }).allowedCidrs).toHaveLength(128)
    expect(() => parseSourcePolicy({ cidrsText: [...lines, '198.51.100.1'].join('\n') })).toThrow('128')
    expect(() => appendCampusPreset({ cidrsText: lines.join('\n') }, ['198.51.100.1'])).toThrow('128')
  })
})

const rule: VmRuleDraft = { id: 'one', direction: 'IN', action: 'ACCEPT', protocol: 'TCP', cidr: '192.0.2.7', ports: '8000-8010' }

describe('VM rule input', () => {
  test('produces paired port bounds and drops the local row identifier', () => {
    expect(parseVmRule(rule)).toEqual({ direction: 'IN', action: 'ACCEPT', protocol: 'TCP', peer: '192.0.2.7/32', portStart: 8000, portEnd: 8010 })
    expect(parseVmRule({ ...rule, ports: '443' })).toMatchObject({ portStart: 443, portEnd: 443 })
    expect(parseVmRule({ ...rule, ports: '' })).toMatchObject({ portStart: null, portEnd: null })
  })

  test.each(['0', '65536', '9000-8000', '1-65536', '80,443', '80;443', '-1', '1.5'])('rejects port input %s', (ports) => {
    expect(() => parseVmRule({ ...rule, ports })).toThrow()
  })

  test('matches ICMP to its address family and refuses ports', () => {
    expect(() => parseVmRule({ ...rule, protocol: 'ANY' })).toThrow('TCP와 UDP')
    expect(() => parseVmRule({ ...rule, protocol: 'ICMP', cidr: '2001:db8::/32', ports: '' })).toThrow('ICMP')
    expect(() => parseVmRule({ ...rule, protocol: 'ICMPV6', ports: '' })).toThrow('ICMP')
    expect(parseVmRule({ ...rule, protocol: 'ICMPV6', cidr: '2001:db8::/32', ports: '' })).toMatchObject({ protocol: 'ICMPV6', portStart: null, portEnd: null })
  })
})
