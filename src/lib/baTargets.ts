/**
 * Per-BA monthly target & sales (set individually or via Excel upload).
 */

export type BaTargetEntry = {
  baId: string
  baName: string
  /** e.g. "2026-09" */
  month: string
  targetKg: number
  salesKg: number
  sku?: string
  updatedAt: string
}

const STORAGE_KEY = 'ba-targets-v1'

function readAll(): BaTargetEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as BaTargetEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(list: BaTargetEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

/** Upsert by baId + month (+ sku when present). */
export function upsertBaTarget(entry: Omit<BaTargetEntry, 'updatedAt'>) {
  const list = readAll()
  const idx = list.findIndex(
    (r) =>
      r.baId === entry.baId &&
      r.month === entry.month &&
      (r.sku ?? '') === (entry.sku ?? ''),
  )
  const next: BaTargetEntry = { ...entry, updatedAt: new Date().toISOString() }
  if (idx >= 0) list[idx] = next
  else list.unshift(next)
  writeAll(list)
  return next
}

export function upsertBaTargets(entries: Omit<BaTargetEntry, 'updatedAt'>[]) {
  for (const e of entries) upsertBaTarget(e)
}

export function getBaTarget(baId: string, month?: string): BaTargetEntry | null {
  const list = readAll()
  const filtered = list.filter((r) => r.baId === baId)
  if (!filtered.length) return null
  if (month) return filtered.find((r) => r.month === month) ?? null
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

export function monthInputValue(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return new Date(y, m - 1, 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' })
}
