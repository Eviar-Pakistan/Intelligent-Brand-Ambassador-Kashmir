/**
 * Bulk monthly shift upload: BA Code, Store Code, Start Time, End Time, Month.
 * Each Excel row creates one ShiftAssignment for that whole month (same hours all month).
 */

import { stores } from '../data/mock'
import { shiftLabelFromTimes } from '../context/ScheduleContext'

const SHEET = 'Shifts'

const COLUMNS = [
  { key: 'baCode', header: 'BA Code or Name', width: 22 },
  { key: 'storeCode', header: 'Store Code or Name', width: 28 },
  { key: 'startTime', header: 'Start Time', width: 14 },
  { key: 'endTime', header: 'End Time', width: 14 },
  { key: 'month', header: 'Month', width: 14 },
] as const

export type BulkShiftRow = {
  baCode: string
  storeCode: string
  /** 24h HH:mm */
  startTime: string
  /** 24h HH:mm */
  endTime: string
  /** YYYY-MM */
  month: string
}

export type ParsedBulkShiftRow = { row: number; input: BulkShiftRow }
export type BulkShiftParseResult = { rows: ParsedBulkShiftRow[]; errors: string[] }

export type StoreCodeSample = { id: number; name: string; city: string; code?: string }

export function storeCodeForId(id: number, code?: string) {
  return (code || '').trim() || String(id)
}

export function normalizeStoreCode(raw: string) {
  return raw.trim().toUpperCase()
}

export function resolveStoreByCode(code: string, extras?: StoreCodeSample[]) {
  const want = normalizeStoreCode(code)
  if (!want) return null

  const pool: StoreCodeSample[] =
    extras && extras.length
      ? extras
      : stores.map((s) => ({ id: s.id, name: s.name, city: s.city, code: storeCodeForId(s.id, s.code) }))

  const byExact = pool.find((s) => {
    const c = storeCodeForId(s.id, s.code).toUpperCase()
    return c === want
  })
  if (byExact) {
    return stores.find((s) => s.id === byExact.id) ?? { id: byExact.id, name: byExact.name, city: byExact.city, peak: [] as string[] }
  }
  return null
}

function normalizeStoreName(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

function pickUniqueStoreByName(want: string, pool: StoreCodeSample[]): StoreCodeSample | null {
  if (!want) return null
  const exact = pool
    .filter((s) => normalizeStoreName(s.name) === want)
    .sort((a, b) => a.id - b.id)
  if (exact.length >= 1) return exact[0] // duplicates: use earliest store

  if (want.length >= 4) {
    const prefix = pool
      .filter((s) => normalizeStoreName(s.name).startsWith(want))
      .sort((a, b) => a.id - b.id)
    if (prefix.length === 1) return prefix[0]
    if (prefix.length > 1) {
      // Prefer shortest name among prefix matches (closest truncation)
      prefix.sort((a, b) => normalizeStoreName(a.name).length - normalizeStoreName(b.name).length || a.id - b.id)
      return prefix[0]
    }
    const contains = pool
      .filter((s) => normalizeStoreName(s.name).includes(want))
      .sort((a, b) => a.id - b.id)
    if (contains.length === 1) return contains[0]
    const reverse = pool
      .filter((s) => want.startsWith(normalizeStoreName(s.name)) && normalizeStoreName(s.name).length >= 4)
      .sort((a, b) => a.id - b.id)
    if (reverse.length >= 1) return reverse[0]
  }
  return null
}

/** Match store by business code or by store name (case-insensitive / truncated). */
export function resolveStoreByCodeOrName(codeOrName: string, extras?: StoreCodeSample[]) {
  const raw = codeOrName.trim()
  if (!raw) return null

  const byCode = resolveStoreByCode(raw, extras)
  if (byCode) return byCode

  const pool: StoreCodeSample[] =
    extras && extras.length
      ? extras
      : stores.map((s) => ({ id: s.id, name: s.name, city: s.city, code: storeCodeForId(s.id) }))

  // "Name (City)" from template reference sheet
  const paren = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  const namePart = paren ? paren[1].trim() : raw
  const nameClean = namePart.replace(/^#\d+\s+/, '').trim()
  const want = normalizeStoreName(nameClean)
  if (!want) return null

  let hit: StoreCodeSample | null = null
  if (paren) {
    const city = normalizeStoreName(paren[2])
    const cityMatches = pool.filter(
      (s) =>
        normalizeStoreName(s.name) === want && normalizeStoreName(s.city) === city,
    )
    if (cityMatches.length === 1) hit = cityMatches[0]
    else hit = pickUniqueStoreByName(want, pool.filter((s) => normalizeStoreName(s.city) === city))
  } else {
    hit = pickUniqueStoreByName(want, pool)
  }

  if (!hit) return null
  return stores.find((s) => s.id === hit!.id) ?? { id: hit.id, name: hit.name, city: hit.city, peak: [] as string[] }
}

const headerKey = (h: unknown) =>
  String(h ?? '')
    .replace(/\*/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

function excelSerialToYmd(n: number): string | null {
  if (!Number.isFinite(n) || n < 1) return null
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000)
  if (Number.isNaN(utc.getTime())) return null
  return utc.toISOString().slice(0, 10)
}

/** Parse Month cell → YYYY-MM */
export function parseMonthValue(value: unknown): string | null {
  if (value === '' || value == null) return null
  if (typeof value === 'number') {
    const ymd = excelSerialToYmd(value)
    return ymd ? ymd.slice(0, 7) : null
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
  }
  const s = String(value).trim()
  if (/^\d{4}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7)
  const named = Date.parse(s.includes(' ') ? `1 ${s}` : s)
  if (!Number.isNaN(named)) {
    const d = new Date(named)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const n = Number(s)
  if (Number.isFinite(n) && n > 20000) {
    const ymd = excelSerialToYmd(n)
    return ymd ? ymd.slice(0, 7) : null
  }
  return null
}

/** Parse time → 24h HH:mm (supports 10:00 AM, 6:00 PM, HH:mm). */
export function parseTimeValue(value: unknown): string | null {
  if (value === '' || value == null) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  }
  if (typeof value === 'number') {
    const frac = value % 1
    const totalMins = Math.round((frac < 0 ? frac + 1 : frac) * 24 * 60)
    const h = Math.floor(totalMins / 60) % 24
    const m = totalMins % 60
    if (frac === 0 && value >= 0 && value < 24) {
      return `${String(Math.floor(value)).padStart(2, '0')}:00`
    }
    if (frac === 0 && value >= 1) return null
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const s = String(value).trim()
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (m12) {
    let h = Number(m12[1])
    const m = Number(m12[2])
    const ap = m12[3].toUpperCase()
    if (ap === 'PM' && h < 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*$/)
  if (m24) {
    const h = Number(m24[1])
    const m = Number(m24[2])
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }
  return null
}

function formatTime12Label(hhmm: string) {
  const [hRaw, mRaw] = hhmm.split(':')
  const h = Number(hRaw)
  const m = Number(mRaw)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function daysInMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)
}

export async function downloadBulkShiftTemplate(opts?: {
  baSamples?: { code: string; name: string }[]
  storeSamples?: StoreCodeSample[]
  defaultMonth?: string
}) {
  const XLSX = await import('xlsx')
  const month =
    opts?.defaultMonth && /^\d{4}-\d{2}$/.test(opts.defaultMonth)
      ? opts.defaultMonth
      : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  const storeList =
    opts?.storeSamples?.length
      ? opts.storeSamples
      : stores.map((s) => ({ id: s.id, name: s.name, city: s.city, code: storeCodeForId(s.id) }))
  const s0 = storeList[0]
  const s1 = storeList[1] ?? storeList[0]
  const s2 = storeList[2] ?? storeList[0]

  const ba0 = opts?.baSamples?.[0]?.code || 'BA-001'
  const ba1 = opts?.baSamples?.[1]?.code || opts?.baSamples?.[0]?.code || 'BA-002'
  const ba2 = opts?.baSamples?.[2]?.code || opts?.baSamples?.[0]?.code || 'BA-003'

  const sampleRows = [
    [ba0, s0 ? storeCodeForId(s0.id, s0.code) : '33991', '10:00 AM', '6:00 PM', month],
    [ba1, s1 ? storeCodeForId(s1.id, s1.code) : 'DTR000297', '9:00 AM', '5:00 PM', month],
    [ba2, s2 ? storeCodeForId(s2.id, s2.code) : '90168', '12:00 PM', '8:00 PM', month],
  ]

  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header), ...sampleRows])
  sheet['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const baHelp =
    opts?.baSamples?.length
      ? opts.baSamples.map((b) => [b.code, b.name])
      : [['BA-001', 'Use codes from Ambassadors (e.g. BA-005)']]

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill the bulk shift template'],
    [],
    [`1. Edit the "${SHEET}" sheet — sample rows use ${month}.`],
    ['2. BA Code or Name — BA-001 style code OR ambassador name (must match Ambassadors).'],
    ['3. Store Code or Name — business store code (e.g. 33991, DTR000297) OR store name.'],
    ['4. Start Time / End Time — 12-hour Karachi time, e.g. 10:00 AM and 6:00 PM.'],
    ['5. Month — YYYY-MM (e.g. 2026-09). Each row creates one assignment for the whole month.'],
    ['6. Save, then upload via Create shifts → Bulk (Excel).'],
    [],
    COLUMNS.map((c) => c.header),
    ...sampleRows,
    [],
    ['BA code reference'],
    ['BA Code', 'Name'],
    ...baHelp,
    [],
    ['Store code reference'],
    ['Store Code', 'Store'],
    ...storeList.map((s) => [
      storeCodeForId(s.id, s.code),
      `#${s.id} ${s.name} (${s.city})`,
    ]),
  ])
  help['!cols'] = [{ wch: 18 }, { wch: 48 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, SHEET)
  XLSX.utils.book_append_sheet(wb, help, 'Instructions')
  XLSX.writeFile(wb, 'Kashmir_Bulk_Shift_Template.xlsx')
}

export async function parseBulkShiftFile(file: File): Promise<BulkShiftParseResult> {
  const XLSX = await import('xlsx')

  let table: unknown[][]
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    const name = wb.SheetNames.includes(SHEET) ? SHEET : wb.SheetNames[0]
    table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      defval: '',
      raw: true,
    })
  } catch {
    return {
      rows: [],
      errors: ['This file could not be read. Please upload the downloaded .xlsx template.'],
    }
  }

  if (!table.length) return { rows: [], errors: ['The sheet is empty.'] }

  const headers = (table[0] ?? []).map(headerKey)
  const idx = {
    baCode: headers.findIndex(
      (h) =>
        h === 'ba code' ||
        h === 'ba code or name' ||
        h === 'ba name' ||
        h === 'ambassador' ||
        h === 'ambassador name' ||
        h === 'code',
    ),
    storeCode: headers.findIndex(
      (h) =>
        h === 'store code' ||
        h === 'store code or name' ||
        h === 'store name' ||
        h === 'store' ||
        h === 'ba store',
    ),
    startTime: headers.findIndex(
      (h) => h === 'start time' || h === 'shift start' || h === 'shift start time',
    ),
    endTime: headers.findIndex(
      (h) => h === 'end time' || h === 'shift end' || h === 'shift end time',
    ),
    month: headers.findIndex((h) => h === 'month' || h === 'month (yyyy-mm)'),
  }

  if (idx.baCode < 0 || idx.storeCode < 0) {
    return {
      rows: [],
      errors: [
        'This is not the bulk shift template (need "BA Code or Name" and "Store Code or Name"). Download the template and fill that.',
      ],
    }
  }
  if (idx.startTime < 0 || idx.endTime < 0 || idx.month < 0) {
    return {
      rows: [],
      errors: [
        'Template needs "Start Time", "End Time", and "Month" columns. Download the latest shift template.',
      ],
    }
  }

  const rows: ParsedBulkShiftRow[] = []
  const errors: string[] = []

  for (let r = 1; r < table.length; r += 1) {
    const line = table[r] ?? []
    if (line.every((c) => String(c ?? '').trim() === '')) continue

    const rowNum = r + 1
    const baCode = String(line[idx.baCode] ?? '').trim()
    const storeCode = String(line[idx.storeCode] ?? '').trim()
    const startTime = parseTimeValue(line[idx.startTime])
    const endTime = parseTimeValue(line[idx.endTime])
    const month = parseMonthValue(line[idx.month])

    const rowErrors: string[] = []
    if (!baCode) rowErrors.push(`Row ${rowNum}: BA Code or Name is required.`)
    if (!storeCode) rowErrors.push(`Row ${rowNum}: Store Code or Name is required.`)
    if (!startTime) {
      rowErrors.push(`Row ${rowNum}: Start Time is invalid — use e.g. 10:00 AM.`)
    }
    if (!endTime) {
      rowErrors.push(`Row ${rowNum}: End Time is invalid — use e.g. 6:00 PM.`)
    }
    if (startTime && endTime && startTime >= endTime) {
      rowErrors.push(`Row ${rowNum}: End Time must be after Start Time.`)
    }
    if (!month) rowErrors.push(`Row ${rowNum}: Month is invalid — use YYYY-MM (e.g. 2026-09).`)

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    rows.push({
      row: rowNum,
      input: {
        baCode,
        storeCode,
        startTime: startTime!,
        endTime: endTime!,
        month: month!,
      },
    })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No data rows found. Add at least one row under the header.')
  }

  return { rows, errors }
}

const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function formatShiftDateLabel(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleString('en-GB', { day: 'numeric', month: 'short' })
}

export function dayKeyFromYmd(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return DAY_KEYS[new Date(y, m - 1, d).getDay()]
}

/** Turn one monthly bulk row into a single month-level shift slot. */
export function expandBulkShiftRow(input: BulkShiftRow, extras?: StoreCodeSample[]) {
  const store = resolveStoreByCodeOrName(input.storeCode, extras)
  if (!store) {
    return {
      slots: [] as const,
      error: `Unknown store "${input.storeCode}" — use a store code or exact store name from Stores.` as string,
    }
  }

  const shift = shiftLabelFromTimes(input.startTime, input.endTime)
  const dates = daysInMonth(input.month)
  if (!dates.length) {
    return { slots: [] as const, error: `Invalid month "${input.month}".` as string }
  }

  // One row for the whole month — anchored on the 1st (hours apply all month).
  const ymd = dates[0]
  const [y, m] = input.month.split('-').map(Number)
  const monthDate = new Date(y, m - 1, 1)
  const monthLabel = monthDate.toLocaleString('en-GB', { month: 'short', year: 'numeric' })

  const slots = [
    {
      day: 'All',
      date: monthLabel,
      storeId: store.id,
      storeName: store.name,
      city: store.city,
      shift,
      peakRecommended: ('peak' in store ? ((store as { peak?: string[] }).peak?.length ?? 0) > 0 : false),
      ymd,
      startLabel: formatTime12Label(input.startTime),
      endLabel: formatTime12Label(input.endTime),
      month: input.month,
    },
  ]

  return { slots, error: null as string | null }
}
