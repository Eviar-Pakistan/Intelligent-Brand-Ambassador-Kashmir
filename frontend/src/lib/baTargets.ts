/**
 * Per-BA monthly target & sales — backed by Django when HO/BA is online.
 * Keeps an in-memory cache (and optional localStorage mirror) for reactive UI.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { apiRequest, isApiAuthenticated } from './api'

export type BaTargetEntry = {
  id?: number
  baId: string
  baName: string
  baCode?: string
  /** e.g. "2026-09" */
  month: string
  targetKg: number
  /** null/undefined = sales not filled yet */
  salesKg?: number | null
  sku?: string
  /** Pack SKUs under this target row (category / multi-SKU upload). */
  assignedSkus?: string[]
  updatedAt: string
}

const STORAGE_KEY = 'ba-targets-v1'
const listeners = new Set<() => void>()

function loadLocal(): BaTargetEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as BaTargetEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

let targets = loadLocal()
let syncing = false

function notify() {
  listeners.forEach((l) => l())
}

function commit(next: BaTargetEntry[], persistLocal = true) {
  targets = next
  if (persistLocal) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(targets))
    } catch {
      // keep in memory
    }
  }
  notify()
}

function mapApiRow(row: Record<string, unknown>): BaTargetEntry {
  const assigned = row.assignedSkus ?? row.assigned_skus
  return {
    id: typeof row.id === 'number' ? row.id : undefined,
    baId: String(row.baId ?? row.ambassador ?? ''),
    baName: String(row.baName ?? ''),
    baCode: row.baCode ? String(row.baCode) : undefined,
    month: String(row.month ?? ''),
    targetKg: Number(row.targetKg ?? 0),
    salesKg: row.salesKg == null || row.salesKg === '' ? null : Number(row.salesKg),
    sku: row.sku ? String(row.sku) : '',
    assignedSkus: Array.isArray(assigned) ? assigned.map(String) : [],
    updatedAt: String(row.updatedAt ?? row.updated_at ?? new Date().toISOString()),
  }
}

function mergeRows(incoming: BaTargetEntry[]) {
  const byKey = new Map<string, BaTargetEntry>()
  for (const r of targets) {
    byKey.set(`${r.baId}|${r.month}|${r.sku ?? ''}`, r)
  }
  for (const r of incoming) {
    byKey.set(`${r.baId}|${r.month}|${r.sku ?? ''}`, r)
  }
  return Array.from(byKey.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Pull all targets from HO API into cache. */
export async function refreshBaTargetsFromApi(): Promise<BaTargetEntry[]> {
  if (!isApiAuthenticated()) return targets
  if (syncing) return targets
  syncing = true
  try {
    const data = await apiRequest<{ results: Record<string, unknown>[] }>('/api/ba-targets/')
    const rows = (data.results ?? []).map(mapApiRow)
    commit(rows) // replace cache so wiped DB clears local targets too
    return rows
  } catch {
    return targets
  } finally {
    syncing = false
  }
}

/** Upsert one row (HO). Falls back to local-only if not authenticated. */
export async function upsertBaTarget(entry: Omit<BaTargetEntry, 'updatedAt' | 'id'>) {
  const local: BaTargetEntry = {
    ...entry,
    sku: entry.sku ?? '',
    updatedAt: new Date().toISOString(),
  }

  if (isApiAuthenticated()) {
    const saved = await apiRequest<Record<string, unknown>>('/api/ba-targets/', {
      method: 'POST',
      body: {
        ambassador: Number(entry.baId),
        month: entry.month,
        sku: entry.sku ?? '',
        targetKg: entry.targetKg,
        salesKg: entry.salesKg,
        assignedSkus: entry.assignedSkus ?? [],
      },
    })
    const mapped = mapApiRow(saved)
    commit(mergeRows([mapped]))
    return mapped
  }

  commit(mergeRows([local]))
  return local
}

/** Bulk upsert (HO). */
export async function upsertBaTargets(entries: Omit<BaTargetEntry, 'updatedAt' | 'id'>[]) {
  if (!entries.length) return { saved: 0, errors: [] as string[] }

  if (isApiAuthenticated()) {
    const data = await apiRequest<{
      saved: number
      errors: string[]
      results: Record<string, unknown>[]
    }>('/api/ba-targets/bulk/', {
      method: 'POST',
      body: {
        rows: entries.map((e) => ({
          baId: e.baId,
          baName: e.baName,
          code: e.baCode,
          month: e.month,
          sku: e.sku ?? '',
          targetKg: e.targetKg,
          salesKg: e.salesKg ?? null,
          assignedSkus: e.assignedSkus ?? [],
        })),
      },
    })
    const mapped = (data.results ?? []).map(mapApiRow)
    commit(mergeRows(mapped))
    return { saved: data.saved ?? mapped.length, errors: data.errors ?? [] }
  }

  const locals = entries.map((e) => ({
    ...e,
    sku: e.sku ?? '',
    updatedAt: new Date().toISOString(),
  }))
  commit(mergeRows(locals))
  return { saved: locals.length, errors: [] as string[] }
}

export type BaAssignedSkuRow = {
  sku: string
  key: string
  units: number
  kg: number
  kgPerUnit: number
}

/** BA invite-token fetch for current month (or all). */
export async function fetchBaOwnTargets(token: string, month?: string): Promise<{
  targetKg: number
  salesKg: number | null
  achievementPct: number
  skus: string[]
  skuRows: BaAssignedSkuRow[]
  categories: {
    category: string
    targetKg: number
    salesKg: number
    achievementPct: number | null
  }[]
  rows: BaTargetEntry[]
}> {
  const qs = new URLSearchParams({ token })
  if (month) qs.set('month', month)
  const data = await apiRequest<{
    target_kg: number
    sales_kg: number
    achievement_pct?: number
    skus: string[]
    assignedSkus?: string[]
    skuRows?: BaAssignedSkuRow[]
    categories?: {
      category: string
      targetKg: number
      salesKg: number
      achievementPct: number | null
    }[]
    results: Record<string, unknown>[]
  }>(`/api/ba/targets/?${qs}`, { auth: false })

  const rows = (data.results ?? []).map(mapApiRow)
  commit(mergeRows(rows), false)
  const targetKg = Number(data.target_kg ?? 0)
  const salesKg = data.sales_kg == null ? null : Number(data.sales_kg ?? 0)
  const skus = data.assignedSkus ?? data.skus ?? []
  const skuRows: BaAssignedSkuRow[] = Array.isArray(data.skuRows)
    ? data.skuRows.map((r) => ({
        sku: String(r.sku ?? ''),
        key: String(r.key ?? ''),
        units: Number(r.units ?? 0),
        kg: Number(r.kg ?? 0),
        kgPerUnit: Number(r.kgPerUnit ?? 0),
      }))
    : skus.map((sku) => ({ sku, key: '', units: 0, kg: 0, kgPerUnit: 0 }))
  return {
    targetKg,
    salesKg,
    achievementPct: Number(
      data.achievement_pct ?? (targetKg > 0 && salesKg != null ? (salesKg / targetKg) * 100 : 0),
    ),
    skus,
    skuRows,
    categories: Array.isArray(data.categories) ? data.categories : [],
    rows,
  }
}

export function listBaTargets(): BaTargetEntry[] {
  return targets
}

export function getBaTarget(baId: string, month?: string): BaTargetEntry | null {
  const filtered = targets.filter((r) => r.baId === baId)
  if (!filtered.length) return null
  if (month) {
    const forMonth = filtered.filter((r) => r.month === month)
    if (!forMonth.length) return null
    return forMonth.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  }
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

/** Sum all SKU rows for a BA in a given month. */
export function sumBaTargetsForMonth(baId: string, month: string) {
  const rows = targets.filter((r) => r.baId === baId && r.month === month)
  if (!rows.length) return null
  return {
    targetKg: Math.round(rows.reduce((s, r) => s + r.targetKg, 0) * 10) / 10,
    salesKg: Math.round(rows.reduce((s, r) => s + (r.salesKg ?? 0), 0) * 10) / 10,
    skus: rows.map((r) => r.sku).filter(Boolean) as string[],
    rows,
  }
}

export function monthInputValue(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return new Date(y, m - 1, 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      targets = loadLocal()
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Reactive list of all BA target rows. */
export function useBaTargets() {
  return useSyncExternalStore(subscribe, () => targets)
}

/** On Ambassadors / HO screens: load from API once mounted. */
export function useBaTargetsSync() {
  const list = useBaTargets()
  useEffect(() => {
    void refreshBaTargetsFromApi()
  }, [])
  return list
}
