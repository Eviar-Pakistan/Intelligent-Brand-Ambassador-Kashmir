/**
 * BA end-of-shift report: field definitions shared by the manual checkout forms
 * and the Excel template (download → fill → upload).
 */

export type FieldDef = { key: string; label: string }

export type ReportSection = { title: string; fields: FieldDef[] }

export type OtherBrandRow = { id: string; name: string; price: string }

const UNITS = ' (units)'

export const OIL_PACK_KEYS = [
  'kpgoCan10',
  'kpgoBtl3',
  'kpgoBtl45',
  'kpgoTin5',
  'kpgoPouch1x5',
  'kpgoSup1x5',
  'kpgoBkt16',
] as const

export const GHEE_PACK_KEYS = [
  'kbpBkt10',
  'kbpBkt25',
  'kbpBkt5',
  'kbpTin5',
  'kbpPouch1x5',
  'kbpBkt16',
] as const

export const WAADI_PACK_KEYS = [
  'wbpBkt5',
  'wbpPouch1x5',
  'wbpBkt25',
  'wbpBkt16',
] as const

/** kg (or LTR as kg) per form unit — BA still enters units; category totals convert here. */
export const PACK_KG_PER_UNIT: Record<string, number> = {
  kpgoCan10: 10,
  kpgoBtl3: 3,
  kpgoBtl45: 4.5,
  kpgoTin5: 5,
  kpgoPouch1x5: 5,
  kpgoSup1x5: 5,
  kpgoBkt16: 16,
  kbpBkt10: 10,
  kbpBkt25: 2.5,
  kbpBkt5: 5,
  kbpTin5: 5,
  kbpPouch1x5: 5,
  kbpBkt16: 16,
  wbpBkt5: 5,
  wbpPouch1x5: 5,
  wbpBkt25: 2.5,
  wbpBkt16: 16,
}

export const interceptionFields: FieldDef[] = [
  { key: 'totalInterceptions', label: 'Total Interceptions' },
  { key: 'productiveCalls', label: 'Productive Calls' },
  { key: 'nonProductiveCalls', label: 'Non-Productive Calls' },
]

export const competitiveFields: FieldDef[] = [
  { key: 'dalda', label: 'Dalda' },
  { key: 'sufi', label: 'Sufi' },
  { key: 'kisan', label: 'Kisan' },
  { key: 'others', label: 'Others' },
]

export const whyNotFields: FieldDef[] = [
  { key: 'taste', label: 'Taste' },
  { key: 'price', label: 'Price' },
  { key: 'packaging', label: 'Packaging' },
]

export const oilSalesFields: FieldDef[] = [
  { key: 'kpgoCan10', label: `KPGO 10 LTR CAN Cons. RED${UNITS}` },
  { key: 'kpgoBtl3', label: `KPGO 3.0 LTR BOTTLE (3LTR X 6) Cons. RED${UNITS}` },
  { key: 'kpgoBtl45', label: `KPGO 4.5 LTR BOTTLE (4.5LTRX 4) Cons. RED${UNITS}` },
  { key: 'kpgoTin5', label: `KPGO 5 LTR TIN Cons. RED${UNITS}` },
  { key: 'kpgoPouch1x5', label: `KPGO POUCH (1LTR x 5) Cons. RED${UNITS}` },
  { key: 'kpgoSup1x5', label: `KPGO Stand Up Pouch (1LTR x 5)${UNITS}` },
  { key: 'kpgoBkt16', label: `KPGO 16 LTR BKT${UNITS}` },
]

export const gheeSalesFields: FieldDef[] = [
  { key: 'kbpBkt10', label: `KBP GOLD 10 KG BKT${UNITS}` },
  { key: 'kbpBkt25', label: `KBP GOLD 2.5 KG BKT${UNITS}` },
  { key: 'kbpBkt5', label: `KBP GOLD 5 KG BKT${UNITS}` },
  { key: 'kbpTin5', label: `KBP GOLD 5 KG TIN${UNITS}` },
  { key: 'kbpPouch1x5', label: `KBP GOLD POUCH (1KG X 5)${UNITS}` },
  { key: 'kbpBkt16', label: `KBP 16 KG BKT${UNITS}` },
]

export const waadiSalesFields: FieldDef[] = [
  { key: 'wbpBkt5', label: `WBP 5 KG BKT${UNITS}` },
  { key: 'wbpPouch1x5', label: `WBP POUCH (1KG X 5)${UNITS}` },
  { key: 'wbpBkt25', label: `WBP 2.5 KG BKT${UNITS}` },
  { key: 'wbpBkt16', label: `WBP 16 KG BKT${UNITS}` },
]

export const stockOilFields: FieldDef[] = [
  { key: 'stockKpgoCan10', label: 'KPGO 10 LTR CAN Cons. RED' },
  { key: 'stockKpgoBtl3', label: 'KPGO 3.0 LTR BOTTLE (3LTR X 6) Cons. RED' },
  { key: 'stockKpgoBtl45', label: 'KPGO 4.5 LTR BOTTLE (4.5LTRX 4) Cons. RED' },
  { key: 'stockKpgoTin5', label: 'KPGO 5 LTR TIN Cons. RED' },
  { key: 'stockKpgoPouch1x5', label: 'KPGO POUCH (1LTR x 5) Cons. RED' },
  { key: 'stockKpgoSup1x5', label: 'KPGO Stand Up Pouch (1LTR x 5)' },
  { key: 'stockKpgoBkt16', label: 'KPGO 16 LTR BKT' },
]

export const stockGheeFields: FieldDef[] = [
  { key: 'stockKbpBkt10', label: 'KBP GOLD 10 KG BKT' },
  { key: 'stockKbpBkt25', label: 'KBP GOLD 2.5 KG BKT' },
  { key: 'stockKbpBkt5', label: 'KBP GOLD 5 KG BKT' },
  { key: 'stockKbpTin5', label: 'KBP GOLD 5 KG TIN' },
  { key: 'stockKbpPouch1x5', label: 'KBP GOLD POUCH (1KG X 5)' },
  { key: 'stockKbpBkt16', label: 'KBP 16 KG BKT' },
]

export const stockWaadiFields: FieldDef[] = [
  { key: 'stockWbpBkt5', label: 'WBP 5 KG BKT' },
  { key: 'stockWbpPouch1x5', label: 'WBP POUCH (1KG X 5)' },
  { key: 'stockWbpBkt25', label: 'WBP 2.5 KG BKT' },
  { key: 'stockWbpBkt16', label: 'WBP 16 KG BKT' },
]

export const STOCK_OPTIONS = ['In Stock', 'Out of Stock', 'Near Out of Stock'] as const

export const DEFAULT_OTHER_BRANDS: OtherBrandRow[] = [
  { id: '1', name: 'Dalda 1 LTR', price: '' },
  { id: '2', name: 'Dalda 5 LTR', price: '' },
  { id: '3', name: 'Sufi 1 LTR', price: '' },
  { id: '4', name: 'Sufi 5 LTR', price: '' },
  { id: '5', name: 'Kisan 1 LTR', price: '' },
  { id: '6', name: 'Kisan 5 LTR', price: '' },
]

function kgForPackUnits(key: string, raw: string | number | undefined | null) {
  if (raw == null || raw === '') return 0
  const units = Number(raw)
  if (!Number.isFinite(units) || units <= 0) return 0
  const factor = PACK_KG_PER_UNIT[key] ?? 0
  return units * factor
}

function sumPackKg(sales: Record<string, string | number>, keys: readonly string[]) {
  return keys.reduce((total, key) => total + kgForPackUnits(key, sales[key]), 0)
}

/** Derive category totals in kg from SKU unit fields (matches backend normalize_sales_json). */
export function normalizeSalesPayload(
  sales: Record<string, string | number>,
): Record<string, string | number> {
  const out = { ...sales }
  const oil = sumPackKg(out, OIL_PACK_KEYS)
  const ghee = sumPackKg(out, GHEE_PACK_KEYS)
  const waadi = sumPackKg(out, WAADI_PACK_KEYS)
  const skuSum = oil + ghee + waadi

  out.salesOil = oil > 0 ? String(oil) : ''
  out.salesGhee = ghee > 0 ? String(ghee) : ''
  out.salesWaadi = waadi > 0 ? String(waadi) : ''

  if (skuSum > 0) {
    delete out.totalSalesLtrKg
  }

  return out
}

/** Sections in the same order as the checkout flow: Stock → Daily Sales → Other Brands. */
export const stockSections: ReportSection[] = [
  { title: 'Kashmir Cooking Oil', fields: stockOilFields },
  { title: 'Kashmir Banaspati', fields: stockGheeFields },
  { title: 'Waadi Banaspati', fields: stockWaadiFields },
]

export const salesSections: ReportSection[] = [
  { title: 'Interceptions', fields: interceptionFields },
  { title: 'Competitive User', fields: competitiveFields },
  { title: 'Why Not Kashmir', fields: whyNotFields },
  { title: 'Kashmir Cooking Oil', fields: oilSalesFields },
  { title: 'Kashmir Banaspati', fields: gheeSalesFields },
  { title: 'Waadi Banaspati', fields: waadiSalesFields },
]

export const SESSION_KEYS = {
  stock: 'ba-stock-report',
  sales: 'ba-daily-sales',
  otherBrands: 'ba-other-brands',
  excelName: 'ba-reports-excel',
} as const

const TEMPLATE_SHEET = 'BA Report'
const HEADERS = ['Section', 'Item', 'Value', 'Notes', 'Key'] as const
const COL = { value: 2, key: 4 } as const

const NOTE_STOCK = `Type one of: ${STOCK_OPTIONS.join(' / ')}`
const NOTE_UNITS = 'Units sold (0 or more) — leave blank if none'
const NOTE_PRICE = 'Selling price in Rs.'

const brandKey = (row: OtherBrandRow) => `brand-${row.id}`

/** Builds and downloads the .xlsx template with every field of the checkout forms. */
export async function downloadBaReportTemplate() {
  const XLSX = await import('xlsx')

  const rows: (string | number)[][] = [[...HEADERS]]
  for (const s of stockSections) {
    for (const f of s.fields) rows.push([`Stock Report – ${s.title}`, f.label, '', NOTE_STOCK, f.key])
  }
  for (const s of salesSections) {
    for (const f of s.fields) rows.push([`Daily Sales – ${s.title}`, f.label, '', NOTE_UNITS, f.key])
  }
  for (const b of DEFAULT_OTHER_BRANDS) {
    rows.push(['Other Brands', b.name, '', `${NOTE_PRICE} — at least one required`, brandKey(b)])
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = [{ wch: 34 }, { wch: 26 }, { wch: 20 }, { wch: 52 }, { wch: 22 }]

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Kashmir BA Daily Report — how to fill'],
    [],
    [`1. Fill only the "Value" column (column C) on the "${TEMPLATE_SHEET}" sheet.`],
    [`2. Stock Report: every item is required. Type: ${STOCK_OPTIONS.join(' / ')}.`],
    ['3. Daily Sales: enter units sold per SKU (0 or more). Category totals are calculated automatically.'],
    ['4. Other Brands: enter the selling price in Rs. for at least one pack.'],
    ['5. Do not rename, move or delete rows, and do not edit the "Key" column.'],
    ['6. Save the file, then upload it from the BA app home screen after check-in.'],
  ])
  instructions['!cols'] = [{ wch: 96 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, TEMPLATE_SHEET)
  XLSX.utils.book_append_sheet(wb, instructions, 'Instructions')

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Kashmir_BA_Daily_Report_Template_${date}.xlsx`)
}

export type ParsedBaReport = {
  stock: Record<string, string>
  sales: Record<string, string>
  otherBrands: OtherBrandRow[]
}

export type ParseResult = { ok: true; data: ParsedBaReport } | { ok: false; errors: string[] }

/** "in stock", "Out-of-Stock", "NEAR OUT OF STOCK" → canonical option. */
function normalizeStock(raw: string) {
  const squashed = raw.toLowerCase().replace(/[^a-z]/g, '')
  return STOCK_OPTIONS.find((o) => o.toLowerCase().replace(/[^a-z]/g, '') === squashed) ?? null
}

/** Reads a filled template. Returns every problem found so the BA can fix them in one go. */
export async function parseBaReportFile(file: File): Promise<ParseResult> {
  const XLSX = await import('xlsx')

  let table: unknown[][]
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const name = wb.SheetNames.includes(TEMPLATE_SHEET) ? TEMPLATE_SHEET : wb.SheetNames[0]
    table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '', raw: true })
  } catch {
    return { ok: false, errors: ['This file could not be read. Please upload the downloaded .xlsx template.'] }
  }

  const headerAt = table.findIndex((r) => String(r[COL.key] ?? '').trim().toLowerCase() === 'key')
  if (headerAt === -1) {
    return {
      ok: false,
      errors: ['This is not the BA report template (Key column not found). Download the template and fill that.'],
    }
  }

  const cells = new Map<string, { value: string; row: number; item: string }>()
  table.slice(headerAt + 1).forEach((r, i) => {
    const key = String(r[COL.key] ?? '').trim()
    if (!key) return
    const raw = r[COL.value]
    cells.set(key, {
      value: typeof raw === 'number' ? String(raw) : String(raw ?? '').trim(),
      row: headerAt + i + 2,
      item: String(r[1] ?? key),
    })
  })

  const errors: string[] = []
  const at = (key: string, label: string) => {
    const c = cells.get(key)
    if (!c) errors.push(`Row for "${label}" is missing — do not delete rows from the template.`)
    return c
  }

  const stock: Record<string, string> = {}
  for (const s of stockSections) {
    for (const f of s.fields) {
      const c = at(f.key, `Stock – ${f.label}`)
      if (!c) continue
      const status = c.value ? normalizeStock(c.value) : null
      if (!status) {
        errors.push(
          `Row ${c.row} (Stock – ${s.title} – ${f.label}): choose ${STOCK_OPTIONS.join(', ')}${c.value ? ` (found "${c.value}")` : ''}.`,
        )
      } else {
        stock[f.key] = status
      }
    }
  }

  const parseNumber = (c: { value: string; row: number }, where: string) => {
    if (!c.value) return ''
    const n = Number(c.value.replace(/,/g, ''))
    if (!Number.isFinite(n) || n < 0) {
      errors.push(`Row ${c.row} (${where}): enter a number 0 or more (found "${c.value}").`)
      return ''
    }
    return String(n)
  }

  const salesRaw: Record<string, string> = {}
  for (const s of salesSections) {
    for (const f of s.fields) {
      const c = at(f.key, `Daily Sales – ${f.label}`)
      if (c) salesRaw[f.key] = parseNumber(c, `Daily Sales – ${s.title} – ${f.label}`)
    }
  }
  const sales = normalizeSalesPayload(salesRaw) as Record<string, string>

  const otherBrands = DEFAULT_OTHER_BRANDS.map((b) => {
    const c = at(brandKey(b), `Other Brands – ${b.name}`)
    return { ...b, price: c ? parseNumber(c, `Other Brands – ${b.name}`) : '' }
  })
  if (otherBrands.every((b) => !b.price)) {
    errors.push('Other Brands: enter the price for at least one pack.')
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: { stock, sales, otherBrands } }
}

/** Saves a parsed report where the manual checkout flow keeps it. */
export function saveBaReport(data: ParsedBaReport, fileName: string) {
  sessionStorage.setItem(SESSION_KEYS.stock, JSON.stringify(data.stock))
  sessionStorage.setItem(SESSION_KEYS.sales, JSON.stringify(data.sales))
  sessionStorage.setItem(SESSION_KEYS.otherBrands, JSON.stringify(data.otherBrands))
  sessionStorage.setItem(SESSION_KEYS.excelName, fileName)
}
