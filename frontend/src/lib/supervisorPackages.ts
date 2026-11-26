/**
 * Per-supervisor monthly package amounts (Incentives).
 * Falls back to global KPI defaults when isCustom is false.
 */

import { useEffect, useState } from 'react'
import { apiRequest, isApiAuthenticated } from './api'
import { getKpiConfig } from './kpiConfig'

export type SupervisorPackageRow = {
  supervisorId: number
  supervisorName: string
  city: string
  salary: number
  fuelDa: number
  discipline: number
  mobile: number
  total: number
  isCustom: boolean
  updatedAt?: string | null
}

type Listener = () => void
const listeners = new Set<Listener>()
let cache: SupervisorPackageRow[] = []

function notify() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* ignore */
    }
  })
}

export function subscribeSupervisorPackages(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSupervisorPackages(): SupervisorPackageRow[] {
  return cache
}

export function getSupervisorPackage(supervisorId: number | string): SupervisorPackageRow | null {
  const id = Number(supervisorId)
  return cache.find((r) => r.supervisorId === id) ?? null
}

/** Amounts for incentive calc: custom package or global KPI defaults. */
export function resolveSupervisorPackageAmounts(supervisorId: number | string) {
  const row = getSupervisorPackage(supervisorId)
  if (row) {
    return {
      salary: row.salary,
      fuelDa: row.fuelDa,
      discipline: row.discipline,
      mobile: row.mobile,
      isCustom: row.isCustom,
    }
  }
  const cfg = getKpiConfig()
  return {
    salary: cfg.supSalary,
    fuelDa: cfg.supFuelDa,
    discipline: cfg.supDiscipline,
    mobile: cfg.supMobile,
    isCustom: false,
  }
}

export async function syncSupervisorPackagesFromApi(): Promise<SupervisorPackageRow[]> {
  if (!isApiAuthenticated()) return cache
  const data = await apiRequest<{ results: SupervisorPackageRow[] }>('/api/supervisor-packages/')
  cache = (data.results ?? []).map((r) => ({
    supervisorId: Number(r.supervisorId),
    supervisorName: String(r.supervisorName ?? ''),
    city: String(r.city ?? ''),
    salary: Number(r.salary) || 0,
    fuelDa: Number(r.fuelDa) || 0,
    discipline: Number(r.discipline) || 0,
    mobile: Number(r.mobile) || 0,
    total: Number(r.total) || 0,
    isCustom: Boolean(r.isCustom),
    updatedAt: r.updatedAt ?? null,
  }))
  notify()
  return cache
}

export async function saveSupervisorPackage(
  supervisorId: number | string,
  fields: { salary: number; fuelDa: number; discipline: number; mobile: number },
): Promise<SupervisorPackageRow> {
  const saved = await apiRequest<SupervisorPackageRow>(`/api/supervisor-packages/${Number(supervisorId)}/`, {
    method: 'PUT',
    body: {
      salary: fields.salary,
      fuelDa: fields.fuelDa,
      discipline: fields.discipline,
      mobile: fields.mobile,
    },
  })
  await syncSupervisorPackagesFromApi().catch(() => {})
  return saved
}

export async function resetSupervisorPackage(supervisorId: number | string): Promise<SupervisorPackageRow> {
  const data = await apiRequest<{ package: SupervisorPackageRow }>(
    `/api/supervisor-packages/${Number(supervisorId)}/reset/`,
    { method: 'DELETE' },
  )
  await syncSupervisorPackagesFromApi().catch(() => {})
  return data.package
}

export function useSupervisorPackagesSync() {
  const [rows, setRows] = useState(cache)
  useEffect(() => {
    setRows(cache)
    const unsub = subscribeSupervisorPackages(() => setRows(getSupervisorPackages()))
    if (isApiAuthenticated()) {
      void syncSupervisorPackagesFromApi().catch(() => {})
    }
    return unsub
  }, [])
  return rows
}
