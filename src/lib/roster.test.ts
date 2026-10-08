import { describe, expect, test } from 'vitest'
import { parseRoster, ROSTER_NO_STUDENT_NO } from './roster'

describe('parseRoster', () => {
  test('reads the student number out of tab-separated attendance rows', () => {
    expect(parseRoster('1\t정보컴퓨터공학부\t202312345\t김철수\t3')).toEqual([
      { line: 1, raw: '1\t정보컴퓨터공학부\t202312345\t김철수\t3', studentNo: '202312345' },
    ])
  })

  test('a header line fixes the student-number and name columns and is not a row', () => {
    const text = ['번호\t학과\t학번\t이름\t학년', '1\t정보컴퓨터공학부\t202312345\t김철수\t3', '2\t정보컴퓨터공학부\tA1234\t이영희\t2'].join('\n')
    expect(parseRoster(text)).toEqual([
      { line: 2, raw: '1\t정보컴퓨터공학부\t202312345\t김철수\t3', studentNo: '202312345', name: '김철수' },
      // The header column is read as is; the server judges the format.
      { line: 3, raw: '2\t정보컴퓨터공학부\tA1234\t이영희\t2', studentNo: 'A1234', name: '이영희' },
    ])
  })

  test('성명 also names the name column', () => {
    expect(parseRoster('학번,성명\n202312345,김철수')).toEqual([
      { line: 2, raw: '202312345,김철수', studentNo: '202312345', name: '김철수' },
    ])
  })

  test('comma-separated rows without a header', () => {
    expect(parseRoster('3, 202399999, 박민수')).toEqual([
      { line: 1, raw: '3, 202399999, 박민수', studentNo: '202399999' },
    ])
  })

  test('a single cell is a student number, or an email when it holds @', () => {
    expect(parseRoster('  202312345  \n\ncheolsu.kim@pusan.ac.kr')).toEqual([
      { line: 1, raw: '202312345', studentNo: '202312345' },
      { line: 3, raw: 'cheolsu.kim@pusan.ac.kr', email: 'cheolsu.kim@pusan.ac.kr' },
    ])
  })

  test('a multi-cell line without a student number is an error row', () => {
    expect(parseRoster('1\t정보컴퓨터공학부\t김철수')).toEqual([
      { line: 1, raw: '1\t정보컴퓨터공학부\t김철수', error: ROSTER_NO_STUDENT_NO },
    ])
  })

  test('CRLF line endings and blank lines keep the original line numbers', () => {
    expect(parseRoster('202312345\r\n\r\n202312346\r\n')).toEqual([
      { line: 1, raw: '202312345', studentNo: '202312345' },
      { line: 3, raw: '202312346', studentNo: '202312346' },
    ])
  })
})
