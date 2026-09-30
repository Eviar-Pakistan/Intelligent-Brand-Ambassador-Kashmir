/**
 * Kashmir targets bulk upload: download template → fill → upload.
 * Columns: BA Name, Month, Category, SKU, Target
 *
 * Categories (LMT):
 *   Kashmir Cooking Oil (KCO / KPGO) · Kashmir Banaspati (KBP) · Waadi Banaspati (WBP)
 * One row = one BA + month + category + SKU + target.
 * Same BA can appear on many rows (e.g. all three categories, one or more SKUs each).
 */

import {
  baPerformanceCategories,
  getSkusForCategory,
  type ProductCategory,
} from '../data/baPerformance'

const SHEET = 'Targets'

const COLUMNS = [
  { key: 'baName', header: 'BA Name', width: 22 },
  { key: 'month', header: 'Month', width: 14 },
  { key: 'category', header: 'Category', width: 24 },
  { key: 'sku', header: 'SKU', width: 42 },
  { key: 'target', header: 'Target', width: 12 },
] as const

export type SalesBulkRow = {
  code: string
  baName: string
  month: string
  category: ProductCategory
  sku: string
  target: number
  /** Always null from the current template (sales not collected here). */
  sales: number | null
}

export type ParsedSalesRow = { row: number; input: SalesBulkRow }
export type SalesParseResult = { rows: ParsedSalesRow[]; errors: string[] }

const headerKey = (h: unknown) =>
  String(h ?? '')
    .replace(/\*/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

function normalizeLabel(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Accept full names or short codes from the LMT sheet. */
export function resolveProductCategory(raw: string): ProductCategory | null {
  const t = normalizeLabel(raw)
  if (!t) return null
  if (
    t === 'kashmir cooking oil' ||
    t === 'kco' ||
    t === 'kpgo' ||
    t === 'cooking oil' ||
    t === 'kashmir oil'
  ) {
    return 'Kashmir Cooking Oil'
  }
  if (
    t === 'kashmir banaspati' ||
    t === 'kbp' ||
    t === 'banaspati' ||
    t === 'kashmir ghee'
  ) {
    return 'Kashmir Banaspati'
  }
  if (t === 'waadi banaspati' || t === 'wbp' || t === 'waadi' || t === 'waadi ghee') {
    return 'Waadi Banaspati'
  }
  const exact = baPerformanceCategories.find((c) => normalizeLabel(c) === t)
  return exact ?? null
}

function resolveSkuInCategory(skuRaw: string, category: ProductCategory): string | null {
  const want = normalizeLabel(skuRaw)
  if (!want) return null
  const pool = getSkusForCategory(category)
  const exact = pool.find((s) => normalizeLabel(s) === want)
  if (exact) return exact
  // Prefix / contains for slightly truncated Excel cells
  const prefix = pool.filter((s) => normalizeLabel(s).startsWith(want) || want.startsWith(normalizeLabel(s)))
  if (prefix.length === 1) return prefix[0]
  const contains = pool.filter((s) => normalizeLabel(s).includes(want))
  if (contains.length === 1) return contains[0]
  return null
}

function parseNumber(value: unknown, label: string, row: number, errors: string[]) {
  if (value === '' || value == null) {
    errors.push(`Row ${row}: ${label} is required.`)
    return null
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`Row ${row}: ${label} must be a non-negative number.`)
    return null
  }
  return Math.round(n * 10) / 10
}

/** Downloads a blank .xlsx template + category/SKU reference sheets. */
export async function downloadSalesBulkTemplate(opts?: {
  baSamples?: { code: string; name: string }[]
}) {
  const XLSX = await import('xlsx')

  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header)])
  sheet['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill the Kashmir targets upload template'],
    [],
    [`1. Add rows on the "${SHEET}" sheet. Do not change the header row.`],
    ['2. BA Name — required. Must match Ambassadors exactly.'],
    ['3. Month — full month name (e.g. September) or YYYY-MM. Blank = current month.'],
    [
      '4. Category — one of: Kashmir Cooking Oil (KCO), Kashmir Banaspati (KBP), Waadi Banaspati (WBP).',
    ],
    [
      '5. SKU — must belong to that category (see sheet "Categories & SKUs"). One SKU per row; use several rows for several SKUs.',
    ],
    [
      '6. Same BA can appear on many rows — e.g. Kinza × 3 categories, and one or more SKUs under each.',
    ],
    ['7. Target — numeric target for that row (required).'],
    ['8. Save the file, then upload it via Upload targets on Ambassadors.'],
    [],
    COLUMNS.map((c) => c.header),
    [],
    ['Example (Kinza — three categories, one SKU each)'],
    ['Kinza', '2026-09', 'Kashmir Cooking Oil', 'KPGO 10 LTR CAN Cons. RED', 120],
    ['Kinza', '2026-09', 'Kashmir Banaspati', 'KBP GOLD 10 KG BKT', 80],
    ['Kinza', '2026-09', 'Waadi Banaspati', 'WBP 5 KG BKT', 40],
    [],
    ['BA name reference'],
    ['BA Name', 'BA Code'],
    ...(opts?.baSamples?.length
      ? opts.baSamples.map((b) => [b.name, b.code])
      : [['Use names from Ambassadors', '']]),
  ])
  help['!cols'] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 24 },
    { wch: 42 },
    { wch: 12 },
  ]

  const catRows: (string | number)[][] = [
    ['Category', 'Code', 'SKU'],
    ...baPerformanceCategories.flatMap((cat) => {
      const code =
        cat === 'Kashmir Cooking Oil' ? 'KCO' : cat === 'Kashmir Banaspati' ? 'KBP' : 'WBP'
      return getSkusForCategory(cat).map((sku, i) => [i === 0 ? cat : '', i === 0 ? code : '', sku])
    }),
  ]
  const catSheet = XLSX.utils.aoa_to_sheet(catRows)
  catSheet['!cols'] = [{ wch: 24 }, { wch: 8 }, { wch: 48 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, SHEET)
  XLSX.utils.book_append_sheet(wb, help, 'Instructions')
  XLSX.utils.book_append_sheet(wb, catSheet, 'Categories & SKUs')
  XLSX.writeFile(wb, 'Kashmir_Targets_Bulk_Upload_Template.xlsx')
}

/** Reads a filled targets template. Valid rows are returned even when others have problems. */
export async function parseSalesBulkFile(file: File): Promise<SalesParseResult> {
  const XLSX = await import('xlsx')

  let table: unknown[][]
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const name = wb.SheetNames.includes(SHEET)
      ? SHEET
      : wb.SheetNames.includes('Sales')
        ? 'Sales'
        : wb.SheetNames[0]
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

  if (!table.length) {
    return { rows: [], errors: ['The sheet is empty.'] }
  }

  const headers = (table[0] ?? []).map(headerKey)
  const idx = {
    code: headers.findIndex(
      (h) => h === 'ba code' || h === 'code' || h === 'ba' || h === 'ambassador code',
    ),
    baName: headers.findIndex(
      (h) => h === 'ba name' || h === 'name' || h === 'ambassador name' || h === 'ambassador',
    ),
    month: headers.findIndex((h) => h === 'month'),
    category: headers.findIndex(
      (h) => h === 'category' || h === 'product category' || h === 'brand category',
    ),
    sku: headers.findIndex((h) => h === 'sku'),
    target: headers.findIndex((h) => h === 'target'),
  }

  if (idx.baName < 0) {
    return {
      rows: [],
      errors: [
        'This is not the targets template (need "BA Name"). Download the latest template and fill that.',
      ],
    }
  }

  const rows: ParsedSalesRow[] = []
  const errors: string[] = []
  const defaultMonth = new Date().toLocaleString('en-PK', { month: 'long' })

  for (let r = 1; r < table.length; r += 1) {
    const line = table[r] ?? []
    const isBlank = line.every((c) => String(c ?? '').trim() === '')
    if (isBlank) continue

    const rowNum = r + 1
    const code = idx.code >= 0 ? String(line[idx.code] ?? '').trim() : ''
    const baName = String(line[idx.baName] ?? '').trim()
    const monthRaw = idx.month >= 0 ? String(line[idx.month] ?? '').trim() : ''
    const month = monthRaw || defaultMonth
    const categoryRaw = idx.category >= 0 ? String(line[idx.category] ?? '').trim() : ''
    const skuRaw = idx.sku >= 0 ? String(line[idx.sku] ?? '').trim() : ''
    const rowErrors: string[] = []

    if (!baName) {
      rowErrors.push(`Row ${rowNum}: BA Name is required.`)
    }

    const category = resolveProductCategory(categoryRaw)
    if (!categoryRaw) {
      rowErrors.push(
        `Row ${rowNum}: Category is required (Kashmir Cooking Oil / Kashmir Banaspati / Waadi Banaspati).`,
      )
    } else if (!category) {
      rowErrors.push(
        `Row ${rowNum}: unknown Category "${categoryRaw}" — use Kashmir Cooking Oil (KCO), Kashmir Banaspati (KBP), or Waadi Banaspati (WBP).`,
      )
    }

    if (!skuRaw) {
      rowErrors.push(`Row ${rowNum}: SKU is required.`)
    }

    let sku = skuRaw
    if (category && skuRaw) {
      const matched = resolveSkuInCategory(skuRaw, category)
      if (!matched) {
        rowErrors.push(
          `Row ${rowNum}: SKU "${skuRaw}" is not valid for ${category}. See template sheet "Categories & SKUs".`,
        )
      } else {
        sku = matched
      }
    }

    const target = parseNumber(idx.target >= 0 ? line[idx.target] : '', 'Target', rowNum, rowErrors)

    if (rowErrors.length || !category) {
      errors.push(...rowErrors)
      continue
    }

    rows.push({
      row: rowNum,
      input: {
        code,
        baName,
        month,
        category,
        sku,
        target: target as number,
        sales: null,
      },
    })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No data rows found. Add at least one row under the header.')
  }

  return { rows, errors }
}
