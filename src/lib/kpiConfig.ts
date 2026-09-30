/**
 * Incentive KPI settings — BA + Supervisor monthly packages.
 * Backed by GET/PATCH /api/incentive-kpi/ when HO is authenticated; localStorage is a cache.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { apiRequest, isApiAuthenticated } from './api'

export type KpiConfig = {
  /** BA monthly salary (PKR) */
  baSalary: number
  baDiscipline: number
  baTravelPerDay: number
  baTravelCap: number
  baGrooming: number
  baMobile: number
  /** Target Ach slabs */
  baTargetSlab90: number
  baTargetSlab100: number
  baTargetSlab110: number
  /** Min check-in days this month to earn full discipline */
  baDisciplineMinDays: number
  /** Supervisor monthly package */
  supSalary: number
  supFuelDa: number
  supDiscipline: number
  supMobile: number
}

export const DEFAULT_KPI_CONFIG: KpiConfig = {
  baSalary: 42_000,
  baDiscipline: 1_500,
  baTravelPerDay: 300,
  baTravelCap: 7_800,
  baGrooming: 2_000,
  baMobile: 1_000,
  baTargetSlab90: 2_400,
  baTargetSlab100: 3_000,
  baTargetSlab110: 3_600,
  baDisciplineMinDays: 20,
  supSalary: 50_000,
  supFuelDa: 30_000,
  supDiscipline: 20_000,
  supMobile: 1_000,
}

const STORAGE_KEY = 'ba-kpi-config-v5-packages'

const amount = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback

/** Coerces any stored/edited value into a valid config. */
export function normalizeKpiConfig(raw: unknown): KpiConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<KpiConfig>
  const d = DEFAULT_KPI_CONFIG
  return {
    baSalary: amount(c.baSalary, d.baSalary),
    baDiscipline: amount(c.baDiscipline, d.baDiscipline),
    baTravelPerDay: amount(c.baTravelPerDay, d.baTravelPerDay),
    baTravelCap: amount(c.baTravelCap, d.baTravelCap),
    baGrooming: amount(c.baGrooming, d.baGrooming),
    baMobile: amount(c.baMobile, d.baMobile),
    baTargetSlab90: amount(c.baTargetSlab90, d.baTargetSlab90),
    baTargetSlab100: amount(c.baTargetSlab100, d.baTargetSlab100),
    baTargetSlab110: amount(c.baTargetSlab110, d.baTargetSlab110),
    baDisciplineMinDays: amount(c.baDisciplineMinDays, d.baDisciplineMinDays),
    supSalary: amount(c.supSalary, d.supSalary),
    supFuelDa: amount(c.supFuelDa, d.supFuelDa),
    supDiscipline: amount(c.supDiscipline, d.supDiscipline),
    supMobile: amount(c.supMobile, d.supMobile),
  }
}

export function baPackageTotalAt100(config: KpiConfig = DEFAULT_KPI_CONFIG) {
  return (
    config.baSalary +
    config.baTargetSlab100 +
    config.baDiscipline +
    config.baTravelCap +
    config.baGrooming +
    config.baMobile
  )
}

export function supPackageTotal(config: KpiConfig = DEFAULT_KPI_CONFIG) {
  return config.supSalary + config.supFuelDa + config.supDiscipline + config.supMobile
}

function load(): KpiConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return normalizeKpiConfig(JSON.parse(stored))
  } catch {
    // storage unavailable or corrupt — fall back to defaults
  }
  return DEFAULT_KPI_CONFIG
}

let current = load()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

export function getKpiConfig() {
  return current
}

function commitLocal(next: KpiConfig) {
  current = normalizeKpiConfig(next)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // keep in-memory
  }
  notify()
}

/** Apply config locally (cache). Prefer setKpiConfigAsync when online. */
export function setKpiConfig(next: KpiConfig) {
  commitLocal(next)
}

export async function refreshKpiConfigFromApi(): Promise<KpiConfig> {
  if (!isApiAuthenticated()) return current
  try {
    const data = await apiRequest<Partial<KpiConfig>>('/api/incentive-kpi/')
    const next = normalizeKpiConfig(data)
    commitLocal(next)
    return next
  } catch {
    return current
  }
}

/** Persist to Django when HO is logged in. */
export async function setKpiConfigAsync(next: KpiConfig): Promise<KpiConfig> {
  const normalized = normalizeKpiConfig(next)
  if (!isApiAuthenticated()) {
    commitLocal(normalized)
    return normalized
  }
  const saved = await apiRequest<Partial<KpiConfig>>('/api/incentive-kpi/', {
    method: 'PATCH',
    body: normalized,
  })
  const merged = normalizeKpiConfig(saved)
  commitLocal(merged)
  return merged
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useKpiConfig() {
  return useSyncExternalStore(subscribe, getKpiConfig)
}

/** Load KPI settings from API once on HO incentive screens. */
export function useKpiConfigSync() {
  const config = useKpiConfig()
  useEffect(() => {
    void refreshKpiConfigFromApi()
  }, [])
  return config
}
