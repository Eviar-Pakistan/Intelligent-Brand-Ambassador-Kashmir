/**
 * Stable BA codes for target/sales upload (e.g. BA-001 = Ayesha Khan).
 */

import { ambassadors } from '../data/mock'

/** Fixed codes for seed ambassadors — order matches Ambassadors table. */
const FIXED_CODES: Record<string, string> = {
  ayesha: 'BA-001',
  hamza: 'BA-002',
  sara: 'BA-003',
  fatima: 'BA-004',
  bilal: 'BA-005',
}

const CODE_RE = /^BA-(\d+)$/i

export type BaCodeRef = {
  id: string
  name: string
  code?: string
  storeId?: number | null
  status?: string
}

export function normalizeBaCode(raw: string) {
  const t = raw.trim().toUpperCase()
  if (!t) return ''
  const m = t.match(/^BA-?0*(\d+)$/i)
  if (m) return `BA-${m[1].padStart(3, '0')}`
  return t
}

export function formatBaCode(n: number) {
  return `BA-${String(n).padStart(3, '0')}`
}

export function baCodeForId(id: string, extras: BaCodeRef[] = []) {
  if (FIXED_CODES[id]) return FIXED_CODES[id]
  const hit = extras.find((a) => a.id === id)
  if (hit?.code) return normalizeBaCode(hit.code)
  return ''
}

function maxCodeNumber(extras: BaCodeRef[]) {
  let max = 0
  for (const code of Object.values(FIXED_CODES)) {
    const m = code.match(CODE_RE)
    if (m) max = Math.max(max, Number(m[1]))
  }
  for (const a of extras) {
    if (!a.code) continue
    const m = normalizeBaCode(a.code).match(CODE_RE)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

/** Next BA-xxx for a newly created account. */
export function allocateBaCode(extras: BaCodeRef[] = []) {
  return formatBaCode(maxCodeNumber(extras) + 1)
}

export type BaDirectoryEntry = { id: string; name: string; code: string }

/** Seed ambassadors + optional created accounts that already have a code. */
export function buildBaDirectory(extras: BaCodeRef[] = []): BaDirectoryEntry[] {
  const seed = ambassadors.map((a) => ({
    id: a.id,
    name: a.name,
    code: FIXED_CODES[a.id] ?? '',
  }))
  const created = extras
    .filter((a) => !FIXED_CODES[a.id] && a.code)
    .map((a) => ({
      id: a.id,
      name: a.name,
      code: normalizeBaCode(a.code!),
    }))
  return [...seed, ...created].filter((b) => b.code)
}

export function resolveBaByCode(
  code: string,
  extras: BaCodeRef[] = [],
): BaDirectoryEntry | null {
  const want = normalizeBaCode(code)
  if (!want) return null
  // Prefer live/HO accounts over seed demos when codes overlap.
  const fromExtras = extras.find((a) => a.code && normalizeBaCode(a.code) === want)
  if (fromExtras) {
    return { id: fromExtras.id, name: fromExtras.name, code: want }
  }
  return buildBaDirectory([]).find((b) => b.code === want) ?? null
}

function normalizeBaName(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

function rankBaDuplicate<T extends { id: string; storeId?: number | null; status?: string }>(a: T, b: T) {
  // Same name can be multiple BAs (different ids/stores). Prefer one with no store yet
  // so each deployment Excel row can fill a different BA.
  const aOpen = a.storeId == null || a.storeId === 0 ? 0 : 1
  const bOpen = b.storeId == null || b.storeId === 0 ? 0 : 1
  if (aOpen !== bOpen) return aOpen - bOpen
  const undeployed = (s?: string) => (s === 'Deployed' ? 1 : 0)
  const ad = undeployed(a.status)
  const bd = undeployed(b.status)
  if (ad !== bd) return ad - bd
  return String(b.id).localeCompare(String(a.id), undefined, { numeric: true })
}

function pickUniqueByName<T extends { name: string; id: string; storeId?: number | null; status?: string }>(
  want: string,
  pool: T[],
  excludeIds?: Set<string>,
): T | null {
  if (!want) return null
  const available = excludeIds?.size
    ? pool.filter((a) => !excludeIds.has(a.id))
    : pool
  const exact = available.filter((a) => normalizeBaName(a.name) === want)
  if (exact.length >= 1) {
    return [...exact].sort(rankBaDuplicate)[0]
  }

  // Prefix match for truncated Excel cells (e.g. "Askari College Ro")
  if (want.length >= 4) {
    const prefix = available.filter((a) => normalizeBaName(a.name).startsWith(want))
    if (prefix.length === 1) return prefix[0]
    if (prefix.length > 1) {
      return [...prefix].sort(
        (a, b) =>
          normalizeBaName(a.name).length - normalizeBaName(b.name).length || rankBaDuplicate(a, b),
      )[0]
    }
    const contains = available.filter((a) => normalizeBaName(a.name).includes(want))
    if (contains.length === 1) return contains[0]
    const reverse = available.filter(
      (a) => want.startsWith(normalizeBaName(a.name)) && normalizeBaName(a.name).length >= 4,
    )
    if (reverse.length >= 1) {
      return [...reverse].sort(rankBaDuplicate)[0]
    }
  }
  return null
}

/** Match ambassador by display name (case-insensitive). Prefers live accounts.
 *  Pass excludeIds so each same-name Excel row can bind to a different BA id. */
export function resolveBaByName(
  name: string,
  extras: BaCodeRef[] = [],
  excludeIds?: Set<string>,
): BaDirectoryEntry | null {
  const want = normalizeBaName(name)
  if (!want) return null

  const fromExtras = pickUniqueByName(want, extras, excludeIds)
  if (fromExtras) {
    return {
      id: fromExtras.id,
      name: fromExtras.name,
      code: fromExtras.code ? normalizeBaCode(fromExtras.code) : baCodeForId(fromExtras.id, extras),
    }
  }

  const fromDir = pickUniqueByName(want, buildBaDirectory(extras), excludeIds)
  return fromDir ? { id: fromDir.id, name: fromDir.name, code: fromDir.code } : null
}
