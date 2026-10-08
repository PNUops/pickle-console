/**
 * One pasted line of a roster. Rows copied from an attendance sheet carry
 * columns such as 번호, 학과, 학번, 이름; only the student number is sent.
 */
export interface RosterRow {
  /** 1-based line number in the pasted text, counting blank lines. */
  line: number
  raw: string
  studentNo?: string
  email?: string
  /** The name on the sheet, for display only. */
  name?: string
  error?: string
}

export const ROSTER_NO_STUDENT_NO = '학번을 찾지 못했습니다.'
export const ROSTER_AMBIGUOUS_STUDENT_NO =
  '학번 열을 정하지 못했습니다. 머리글 행을 함께 붙여넣어 주세요.'

/** Digits with at most one hyphen, seven digits or more: what a student number cell looks like. */
const STUDENT_NO_CELL = /^\d+(-\d+)?$/
const MIN_STUDENT_NO_DIGITS = 7

/** `학번`, `학 번` and `학번(9자리)` all head the student-number column. */
const STUDENT_NO_HEADER = /^학\s*번/
const NAME_HEADER = /^(이\s*름|성\s*명)/

function cellsOf(line: string): string[] {
  const separator = line.includes('\t') ? '\t' : line.includes(',') ? ',' : /\s+/
  return line
    .trim()
    .split(separator)
    .map((cell) => cell.trim())
}

function looksLikeStudentNo(cell: string): boolean {
  return STUDENT_NO_CELL.test(cell) && cell.replace('-', '').length >= MIN_STUDENT_NO_DIGITS
}

/**
 * Splits pasted text into one row per person. A line with a cell headed 학번
 * fixes the student-number column (and 이름 or 성명 the name column) for the
 * lines after it and is not a row itself. Without a header a line names its
 * student number by being the only cell that looks like one.
 *
 * `allowEmail` lets a line with no student number fall back to a cell holding
 * `@`; a line that is a single cell is read as an email whenever it holds one,
 * so a screen that takes no emails can still list it as such.
 */
export function parseRoster(text: string, { allowEmail = false }: { allowEmail?: boolean } = {}): RosterRow[] {
  const rows: RosterRow[] = []
  let studentNoColumn: number | null = null
  let nameColumn: number | null = null

  text.split(/\r?\n/).forEach((source, index) => {
    const line = index + 1
    const raw = source.trim()
    if (raw.length === 0) return
    const cells = cellsOf(source)
    const header = cells.findIndex((cell) => STUDENT_NO_HEADER.test(cell))
    if (header >= 0) {
      studentNoColumn = header
      const name = cells.findIndex((cell) => NAME_HEADER.test(cell))
      nameColumn = name >= 0 ? name : null
      return
    }

    const name = nameColumn != null ? cells[nameColumn] || undefined : undefined
    const fromHeader = studentNoColumn != null ? cells[studentNoColumn] : undefined
    if (fromHeader) {
      rows.push({ line, raw, studentNo: fromHeader, name })
      return
    }
    const filled = cells.filter((cell) => cell.length > 0)
    if (filled.length === 1) {
      const value = filled[0]
      rows.push(value.includes('@') ? { line, raw, email: value, name } : { line, raw, studentNo: value, name })
      return
    }
    const candidates = filled.filter(looksLikeStudentNo)
    if (candidates.length === 1) {
      rows.push({ line, raw, studentNo: candidates[0], name })
      return
    }
    if (candidates.length > 1) {
      rows.push({ line, raw, name, error: ROSTER_AMBIGUOUS_STUDENT_NO })
      return
    }
    const email = allowEmail ? filled.find((cell) => cell.includes('@')) : undefined
    rows.push(email ? { line, raw, email, name } : { line, raw, name, error: ROSTER_NO_STUDENT_NO })
  })
  return rows
}
