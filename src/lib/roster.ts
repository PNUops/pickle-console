/**
 * One pasted line of a roster. Rows copied from an attendance sheet carry
 * columns such as 번호, 학과, 학번, 이름; only the student number is sent.
 */
export interface RosterRow {
  /** 1-based line number in the pasted text, counting blank lines. */
  line: number
  raw: string
  studentNo?: string
  /** Only a single-cell line holding `@` is read as an email. */
  email?: string
  /** The name on the sheet, for display only. */
  name?: string
  error?: string
}

export const ROSTER_NO_STUDENT_NO = '학번을 찾지 못했습니다.'

const STUDENT_NO_CELL = /^\d{7,}$/

function cellsOf(line: string): string[] {
  const separator = line.includes('\t') ? '\t' : line.includes(',') ? ',' : null
  return (separator ? line.split(separator) : [line]).map((cell) => cell.trim())
}

/**
 * Splits pasted text into one row per person. A line with a cell that reads
 * exactly 학번 is a header: it fixes the student-number column (and 이름 or
 * 성명 the name column) for the lines after it and is not a row itself.
 */
export function parseRoster(text: string): RosterRow[] {
  const rows: RosterRow[] = []
  let studentNoColumn: number | null = null
  let nameColumn: number | null = null

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1
    if (raw.trim().length === 0) return
    const cells = cellsOf(raw)
    const header = cells.indexOf('학번')
    if (header >= 0) {
      studentNoColumn = header
      const name = cells.findIndex((cell) => cell === '이름' || cell === '성명')
      nameColumn = name >= 0 ? name : null
      return
    }

    const name = nameColumn != null ? cells[nameColumn] || undefined : undefined
    const fromHeader = studentNoColumn != null ? cells[studentNoColumn] : undefined
    if (fromHeader) {
      rows.push({ line, raw: raw.trim(), studentNo: fromHeader, name })
      return
    }
    const filled = cells.filter((cell) => cell.length > 0)
    if (filled.length === 1) {
      const value = filled[0]
      rows.push(
        value.includes('@')
          ? { line, raw: raw.trim(), email: value, name }
          : { line, raw: raw.trim(), studentNo: value, name },
      )
      return
    }
    const studentNo = cells.find((cell) => STUDENT_NO_CELL.test(cell))
    rows.push(
      studentNo
        ? { line, raw: raw.trim(), studentNo, name }
        : { line, raw: raw.trim(), name, error: ROSTER_NO_STUDENT_NO },
    )
  })
  return rows
}
