/** '2026-07-08T14:03:00+09:00' → '2026-07-08 14:03' (local time). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
 * 날짜 전용 값이라 로컬 자정 기준으로 계산한다.
 */
export function formatDday(endDate: string, base: Date = new Date()): Dday {
  const [y, m, d] = endDate.split('-').map(Number)
  const end = new Date(y, m - 1, d)
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const daysLeft = Math.round((end.getTime() - today.getTime()) / 86_400_000)
  const label = daysLeft > 0 ? `D-${daysLeft}` : daysLeft === 0 ? 'D-Day' : `D+${-daysLeft}`
  const tone = daysLeft <= 3 ? 'danger' : daysLeft <= 7 ? 'warning' : 'neutral'
  return { label, tone, daysLeft }
}

/** MiB → human-readable GiB/MiB label (e.g. 2048 → '2 GiB'). */
export function formatMemory(memoryMb: number): string {
  if (memoryMb % 1024 === 0) return `${memoryMb / 1024} GiB`
  return `${memoryMb} MiB`
}

/** Compact spec summary: '2 vCPU · 2 GiB · 20 GiB'. */
export function formatSpec(vcpu: number, memoryMb: number, diskGb: number): string {
  return `${vcpu} vCPU · ${formatMemory(memoryMb)} · ${diskGb} GiB`
}
