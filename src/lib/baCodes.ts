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

export type BaCodeRef = { id: string; name: string; code?: string }

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

function pickUniqueByName<T extends { name: string; id: string }>(
  want: string,
  pool: T[],
): T | null {
  if (!want) return null
  const exact = pool.filter((a) => normalizeBaName(a.name) === want)
  if (exact.length >= 1) {
    // Duplicates: prefer lowest numeric id / stable sort
    return [...exact].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))[0]
  }

  // Prefix match for truncated Excel cells (e.g. "Askari College Ro")
  if (want.length >= 4) {
    const prefix = pool.filter((a) => normalizeBaName(a.name).startsWith(want))
    if (prefix.length === 1) return prefix[0]
    if (prefix.length > 1) {
      return [...prefix].sort(
        (a, b) =>
          normalizeBaName(a.name).length - normalizeBaName(b.name).length ||
          String(a.id).localeCompare(String(b.id), undefined, { numeric: true }),
      )[0]
    }
    const contains = pool.filter((a) => normalizeBaName(a.name).includes(want))
    if (contains.length === 1) return contains[0]
    const reverse = pool.filter((a) => want.startsWith(normalizeBaName(a.name)) && normalizeBaName(a.name).length >= 4)
    if (reverse.length >= 1) {
      return [...reverse].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))[0]
    }
  }
  return null
}

/** Match ambassador by display name (case-insensitive). Prefers live accounts. */
export function resolveBaByName(
  name: string,
  extras: BaCodeRef[] = [],
): BaDirectoryEntry | null {
  const want = normalizeBaName(name)
  if (!want) return null

  const fromExtras = pickUniqueByName(want, extras)
  if (fromExtras) {
    return {
      id: fromExtras.id,
      name: fromExtras.name,
      code: fromExtras.code ? normalizeBaCode(fromExtras.code) : baCodeForId(fromExtras.id, extras),
    }
  }

  const fromDir = pickUniqueByName(want, buildBaDirectory(extras))
  return fromDir ? { id: fromDir.id, name: fromDir.name, code: fromDir.code } : null
}
