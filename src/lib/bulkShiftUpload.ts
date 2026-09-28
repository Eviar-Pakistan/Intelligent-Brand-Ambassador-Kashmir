/**
 * Bulk shift upload: BA Code, Store Code, Start Date, End Date,
 * Shift Start Date, Shift End Date.
 */

import { stores } from '../data/mock'
import { shiftLabelFromTimes } from '../context/ScheduleContext'

const SHEET = 'Shifts'

const COLUMNS = [
  { key: 'baCode', header: 'BA Code', width: 12 },
  { key: 'storeCode', header: 'Store Code', width: 12 },
  { key: 'startDate', header: 'Start Date', width: 14 },
  { key: 'endDate', header: 'End Date', width: 14 },
  { key: 'shiftStart', header: 'Shift Start Date', width: 16 },
  { key: 'shiftEnd', header: 'Shift End Date', width: 16 },
] as const

export type BulkShiftRow = {
  baCode: string
  storeCode: string
  startDate: string
  endDate: string
  shiftStart: string
  shiftEnd: string
}

export type ParsedBulkShiftRow = { row: number; input: BulkShiftRow }
export type BulkShiftParseResult = { rows: ParsedBulkShiftRow[]; errors: string[] }

export function storeCodeForId(id: number) {
  return `ST-${String(id).padStart(3, '0')}`
}

export function normalizeStoreCode(raw: string) {
  const t = raw.trim().toUpperCase()
  if (!t) return ''
  const m = t.match(/^ST-?0*(\d+)$/i)
  if (m) return `ST-${m[1].padStart(3, '0')}`
  // bare number e.g. 12 → ST-012
  if (/^\d+$/.test(t)) return `ST-${t.padStart(3, '0')}`
  return t
}

export function resolveStoreByCode(code: string) {
  const want = normalizeStoreCode(code)
  if (!want) return null
  const id = Number(want.replace(/^ST-0*/, '') || want.replace(/^ST-/, ''))
  if (!Number.isFinite(id)) return null
  return stores.find((s) => s.id === id) ?? null
}

const headerKey = (h: unknown) =>
  String(h ?? '')
    .replace(/\*/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

/** Excel serial date → YYYY-MM-DD */
function excelSerialToYmd(n: number): string | null {
  if (!Number.isFinite(n) || n < 1) return null
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000)
  if (Number.isNaN(utc.getTime())) return null
  return utc.toISOString().slice(0, 10)
}

function parseDateValue(value: unknown): string | null {
  if (value === '' || value == null) return null
  if (typeof value === 'number') return excelSerialToYmd(value)
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  // Excel may give date as number string
  const n = Number(s)
  if (Number.isFinite(n) && n > 20000) return excelSerialToYmd(n)
  return null
}

/** Extract HH:mm from time, datetime, or Excel serial (fraction of day). */
function parseTimeValue(value: unknown): string | null {
  if (value === '' || value == null) return null
  if (typeof value === 'number') {
    // Excel time is fraction of day; datetime is serial with fraction
    const frac = value % 1
    const totalMins = Math.round((frac < 0 ? frac + 1 : frac) * 24 * 60)
    const h = Math.floor(totalMins / 60) % 24
    const m = totalMins % 60
    // Whole numbers that look like hours only (e.g. 9) — treat as 09:00
    if (frac === 0 && value >= 0 && value < 24) {
      return `${String(value).padStart(2, '0')}:00`
    }
    if (frac === 0 && value >= 1) {
      // date-only serial — no useful time
      return null
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const s = String(value).trim()
  // HH:mm or H:mm
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*$/)
  if (m24) {
    const h = Number(m24[1])
    const m = Number(m24[2])
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }
  // 9:00 AM / 12:00 PM
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (m12) {
    let h = Number(m12[1])
    const m = Number(m12[2])
    const ap = m12[3].toUpperCase()
    if (ap === 'PM' && h < 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  // datetime string — take time part
  const d = new Date(s)
  if (!Number.isNaN(d.getTime()) && /\d{1,2}:\d{2}/.test(s)) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return null
}

export async function downloadBulkShiftTemplate() {
  const XLSX = await import('xlsx')
  const sampleRows = [
    ['BA-001', 'ST-012', '2026-08-24', '2026-08-30', '12:00', '15:00'],
    ['BA-003', 'ST-019', '2026-08-24', '2026-08-26', '10:00', '14:00'],
    ['BA-004', 'ST-004', '2026-08-25', '2026-08-28', '18:00', '21:00'],
  ]
  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header), ...sampleRows])
  sheet['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill the bulk shift template'],
    [],
    [`1. The "${SHEET}" sheet has sample rows — edit or replace them.`],
    ['2. BA Code — e.g. BA-001 (Ayesha Khan).'],
    ['3. Store Code — e.g. ST-012 (Carrefour DHA), ST-004 (Metro Lahore).'],
    ['4. Start Date / End Date — inclusive date range (YYYY-MM-DD). One shift is created per day in the range.'],
    ['5. Shift Start Date / Shift End Date — daily shift times (HH:mm, e.g. 12:00 and 15:00).'],
    ['6. Save the file, then upload it via Bulk Shift on Deployment.'],
    [],
    COLUMNS.map((c) => c.header),
    ...sampleRows,
    [],
    ['Store code reference'],
    ['Store Code', 'Store'],
    ...stores.map((s) => [storeCodeForId(s.id), `#${s.id} ${s.name} (${s.city})`]),
  ])
  help['!cols'] = [{ wch: 18 }, { wch: 36 }]

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
    baCode: headers.findIndex((h) => h === 'ba code' || h === 'code'),
    storeCode: headers.findIndex((h) => h === 'store code' || h === 'store'),
    startDate: headers.findIndex((h) => h === 'start date' || h === 'start'),
    endDate: headers.findIndex((h) => h === 'end date' || h === 'end'),
    shiftStart: headers.findIndex(
      (h) => h === 'shift start date' || h === 'shift start' || h === 'shift start time',
    ),
    shiftEnd: headers.findIndex(
      (h) => h === 'shift end date' || h === 'shift end' || h === 'shift end time',
    ),
  }

  if (idx.baCode < 0 || idx.storeCode < 0) {
    return {
      rows: [],
      errors: [
        'This is not the bulk shift template (need "BA Code" and "Store Code"). Download the template and fill that.',
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
    const startRaw = idx.startDate >= 0 ? line[idx.startDate] : ''
    const endRaw = idx.endDate >= 0 ? line[idx.endDate] : ''
    const shiftStartRaw = idx.shiftStart >= 0 ? line[idx.shiftStart] : ''
    const shiftEndRaw = idx.shiftEnd >= 0 ? line[idx.shiftEnd] : ''

    const startDate = parseDateValue(startRaw)
    const endDate = parseDateValue(endRaw)
    const shiftStart = parseTimeValue(shiftStartRaw)
    const shiftEnd = parseTimeValue(shiftEndRaw)

    const rowErrors: string[] = []
    if (!baCode) rowErrors.push(`Row ${rowNum}: BA Code is required.`)
    if (!storeCode) rowErrors.push(`Row ${rowNum}: Store Code is required.`)
    if (!startDate) rowErrors.push(`Row ${rowNum}: Start Date is invalid.`)
    if (!endDate) rowErrors.push(`Row ${rowNum}: End Date is invalid.`)
    if (startDate && endDate && startDate > endDate) {
      rowErrors.push(`Row ${rowNum}: Start Date must be on or before End Date.`)
    }
    if (!shiftStart) rowErrors.push(`Row ${rowNum}: Shift Start Date (time) is invalid — use HH:mm.`)
    if (!shiftEnd) rowErrors.push(`Row ${rowNum}: Shift End Date (time) is invalid — use HH:mm.`)

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    rows.push({
      row: rowNum,
      input: {
        baCode,
        storeCode,
        startDate: startDate!,
        endDate: endDate!,
        shiftStart: shiftStart!,
        shiftEnd: shiftEnd!,
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

/** Expand one bulk row into per-day shift slots (without ids). */
export function expandBulkShiftRow(input: BulkShiftRow) {
  const store = resolveStoreByCode(input.storeCode)
  if (!store) return { slots: [] as const, error: `Unknown store code "${input.storeCode}"` as string }

  const shift = shiftLabelFromTimes(input.shiftStart, input.shiftEnd)
  const slots: {
    day: string
    date: string
    storeId: number
    storeName: string
    city: string
    shift: string
    peakRecommended: boolean
    ymd: string
  }[] = []

  const cursor = new Date(input.startDate + 'T12:00:00')
  const end = new Date(input.endDate + 'T12:00:00')
  while (cursor <= end) {
    const ymd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    slots.push({
      day: dayKeyFromYmd(ymd),
      date: formatShiftDateLabel(ymd),
      storeId: store.id,
      storeName: store.name,
      city: store.city,
      shift,
      peakRecommended: store.peak.length > 0,
      ymd,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return { slots, error: null as string | null }
}
