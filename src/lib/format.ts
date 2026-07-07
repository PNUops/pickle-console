/** '2026-07-08T14:03:00+09:00' → '2026-07-08 14:03' (local time). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
