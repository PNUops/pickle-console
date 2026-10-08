import { describe, expect, test } from 'vitest'
import { recipientBody, rosterCandidates } from './recipients'

describe('rosterCandidates', () => {
  test('a pasted student number keys on its upper-cased form and is sent as pasted', () => {
    const { candidates } = rosterCandidates([
      { row: { line: 1, raw: 'ab12345', studentNo: 'ab12345' }, status: 'NEW', resolution: { studentNo: 'ab12345', status: 'NEW' } },
      { row: { line: 2, raw: 'AB12345', studentNo: 'AB12345' }, status: 'REGISTERED', resolution: { studentNo: 'AB12345', status: 'REGISTERED' } },
    ])
    expect(candidates.map((candidate) => candidate.key)).toEqual(['s:AB12345'])
    expect(recipientBody(candidates[0])).toEqual({ studentNo: 'ab12345' })
  })

  test('members and invitations keep the keys the picker already uses', () => {
    const { candidates, excluded } = rosterCandidates([
      { row: { line: 1, raw: '202312345', studentNo: '202312345' }, status: 'MEMBER', resolution: { studentNo: '202312345', status: 'MEMBER', userId: 'u1', name: '김철수' } },
      { row: { line: 2, raw: '202312346', studentNo: '202312346' }, status: 'INVITED', resolution: { studentNo: '202312346', status: 'INVITED', invitationId: 'i1' } },
      { row: { line: 3, raw: 'x', studentNo: 'x' }, status: 'INVALID', resolution: { studentNo: 'x', status: 'INVALID' } },
    ])
    expect(candidates.map(recipientBody)).toEqual([{ userId: 'u1' }, { invitationId: 'i1' }])
    expect(excluded).toBe(1)
  })
})
