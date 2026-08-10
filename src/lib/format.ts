/**
 * 계약의 시각·일자 의미는 KST 고정이다 (감사 from/to = KST 해당 일 00:00,
 * 만료 종료일 = KST 달력일). 브라우저 로컬 TZ가 아니라 항상 KST로 표시·산정한다.
 */
const KST_TIME_ZONE = 'Asia/Seoul'

/** KST 달력 날짜(YYYY-MM-DD) 포매터 — en-CA 로케일이 ISO 순서를 보장한다. */
const kstDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: KST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const kstDateTimeFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: KST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** '2026-07-08T05:03:00Z' → '2026-07-08 14:03' (KST 고정). */
export function formatDateTime(iso: string): string {
  return kstDateTimeFormat.format(new Date(iso)).replace(',', '')
}

/** 주어진 시각의 KST 달력 날짜(YYYY-MM-DD). */
export function kstDateString(at: Date = new Date()): string {
  return kstDateFormat.format(at)
}

/** 오늘의 KST 달력 날짜(YYYY-MM-DD) — date 입력의 min 값 등에 쓴다. */
export function todayKstDate(): string {
  return kstDateString()
}

/**
 * 접수 가능한 가장 이른 파기 예정일(YYYY-MM-DD, KST 기준).
 * 폼은 KST 자정으로 제출하므로 "내일"이 항상 미래 시각이다.
 * 최소 통보 기간 하한은 폐지(2026-07-27) — 계약은 미래 시각만 요구한다.
 */
export function minScheduleDate(): string {
  return kstDateString(new Date(Date.now() + 86_400_000))
}

/**
 * 파기 예정일이 권장 통보 기간(7일) 미만인지 — 접수는 허용하되 경고를
 * 표시하는 기준. 폼 제출 시각(KST 자정)이 "지금 + 7일"을 넘는 최소
 * 달력일이 "오늘 + 8일"이므로 그 미만을 짧은 통보로 본다.
 */
export function isShortNotice(ymd: string): boolean {
  return ymd < kstDateString(new Date(Date.now() + 8 * 86_400_000))
}

/** 'YYYY-MM-DD' → 1970-01-01부터의 달력 일수 (TZ 무관, 정수). */
function calendarDayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/**
 * ISO 시각 → 한국어 상대 시간 (예 '7일 후', '3시간 전').
 * 예정/경과 안내용의 대략적 표현이라 분 단위 미만은 '1분'으로 올림한다.
 */
export function formatRelative(iso: string, base: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - base.getTime()
  const abs = Math.abs(diffMs)
  const minutes = Math.round(abs / 60_000)
  const hours = Math.round(abs / 3_600_000)
  const days = Math.round(abs / 86_400_000)
  const amount =
    minutes < 60 ? `${Math.max(minutes, 1)}분` : hours < 48 ? `${hours}시간` : `${days}일`
  return diffMs >= 0 ? `${amount} 후` : `${amount} 전`
}

export interface Dday {
  /** 'D-3' / 'D-Day' / 'D+2' */
  label: string
  /** 배지 톤 — 만료 임박(D-3 이내)·경과는 danger, D-7 이내는 warning */
  tone: 'neutral' | 'warning' | 'danger'
  /** 남은 일수 (0 = 오늘 만료, 음수 = 이미 경과) */
  daysLeft: number
}

/**
 * 사용 종료일('YYYY-MM-DD', inclusive) → D-day 라벨과 톤.
 * 계약상 종료일은 KST 달력일이므로 브라우저 TZ와 무관하게 KST 기준으로 센다.
 */
export function formatDday(endDate: string, base: Date = new Date()): Dday {
  const daysLeft = calendarDayNumber(endDate) - calendarDayNumber(kstDateString(base))
  const label = daysLeft > 0 ? `D-${daysLeft}` : daysLeft === 0 ? 'D-Day' : `D+${-daysLeft}`
  const tone = daysLeft <= 3 ? 'danger' : daysLeft <= 7 ? 'warning' : 'neutral'
  return { label, tone, daysLeft }
}

/** MiB → human-readable GiB/MiB label (e.g. 2048 → '2 GiB'). */
export function formatMemory(memoryMb: number): string {
  if (memoryMb % 1024 === 0) return `${memoryMb / 1024} GiB`
  return `${memoryMb} MiB`
}

/** 이진 단위 계단 — 메모리 표기(formatMemory)의 GiB/MiB 관례를 그대로 잇는다. */
const BINARY_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']

function scaleBinary(value: number): { scaled: number; unit: string } {
  let magnitude = Math.abs(value)
  let step = 0
  while (magnitude >= 1024 && step < BINARY_UNITS.length - 1) {
    magnitude /= 1024
    step += 1
  }
  return { scaled: value < 0 ? -magnitude : magnitude, unit: BINARY_UNITS[step] }
}

/**
 * 바이트 → 사람이 읽는 이진 단위 라벨 (예 1536 → '1.5 KiB').
 * 자릿수는 값의 크기에 맞춘다 — 큰 값에 소수점을 붙이면 축 라벨이 길어진다.
 */
export function formatBytes(bytes: number): string {
  const { scaled, unit } = scaleBinary(bytes)
  const magnitude = Math.abs(scaled)
  const digits = unit === 'B' || magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2
  return `${scaled.toFixed(digits)} ${unit}`
}

/** 초당 바이트 → 전송 속도 라벨 (예 1_572_864 → '1.50 MiB/s'). */
export function formatByteRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`
}

/** 0~100 백분율 → 라벨 (예 42.35 → '42.4%', 7.2 → '7.2%'). */
export function formatPercent(percent: number): string {
  return `${percent.toFixed(Math.abs(percent) >= 100 ? 0 : 1)}%`
}

/** Compact spec summary: '2 vCPU · 2 GiB · 20 GiB'. */
/**
 * 접근 권한이 없는 VM은 사양을 내려받지 못한다(서버가 지움). 그런 행에서는
 * 각 값이 없으므로 사양 자리에 대시를 표시한다.
 */
export function formatSpec(
  vcpu: number | null | undefined,
  memoryMb: number | null | undefined,
  diskGb: number | null | undefined,
): string {
  if (vcpu == null || memoryMb == null || diskGb == null) return '—'
  return `${vcpu} vCPU · ${formatMemory(memoryMb)} · ${diskGb} GiB`
}
