/**
 * Kashmir targets bulk upload: download template → fill → upload.
 * Columns: BA Code, BA Name, Month, Category, SKU, Target
 * BA Code is required and uniquely identifies the ambassador (same names are OK).
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
  { key: 'code', header: 'BA Code', width: 12 },
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
  /** Pack labels assigned under this category/SKU target row. */
  assignedSkus: string[]
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
    t === 'kashmir banaspati oil' ||
    t === 'kbp' ||
    t === 'banaspati' ||
    t === 'kashmir ghee'
  ) {
    return 'Kashmir Banaspati'
  }
  if (
    t === 'waadi banaspati' ||
    t === 'waadi banaspati oil' ||
    t === 'wbp' ||
    t === 'waadi' ||
    t === 'waadi ghee'
  ) {
    return 'Waadi Banaspati'
  }
  const exact = baPerformanceCategories.find((c) => normalizeLabel(c) === t)
  return exact ?? null
}

/** Split a cell that lists several SKUs (comma / semicolon / newline). */
export function splitSkuCell(raw: string): string[] {
  return String(raw ?? '')
    .split(/[,;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function resolveSkuInCategory(skuRaw: string, category: ProductCategory): string | null {
  const want = normalizeLabel(skuRaw)
  if (!want) return null
  const wantKey = want.replace(/[^a-z0-9]+/g, '')
  const pool = getSkusForCategory(category)
  const exact = pool.find((s) => normalizeLabel(s) === want)
  if (exact) return exact
  const byKey = pool.find((s) => normalizeLabel(s).replace(/[^a-z0-9]+/g, '') === wantKey)
  if (byKey) return byKey
  // Prefix / contains for slightly truncated Excel cells
  const prefix = pool.filter((s) => normalizeLabel(s).startsWith(want) || want.startsWith(normalizeLabel(s)))
  if (prefix.length === 1) return prefix[0]
  const contains = pool.filter((s) => normalizeLabel(s).includes(want) || want.includes(normalizeLabel(s)))
  if (contains.length === 1) return contains[0]
  const keyContains = pool.filter((s) => {
    const k = normalizeLabel(s).replace(/[^a-z0-9]+/g, '')
    return k.includes(wantKey) || wantKey.includes(k)
  })
  if (keyContains.length === 1) return keyContains[0]
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
    [
      '2. BA Code — required. Must match Ambassadors exactly (e.g. BA-016). This uniquely identifies the BA when names are shared.',
    ],
    ['3. BA Name — optional helper (for your reference). Matching uses BA Code, not name.'],
    ['4. Month — full month name (e.g. September) or YYYY-MM. Blank = current month.'],
    [
      '5. Category — one of: Kashmir Cooking Oil (KCO), Kashmir Banaspati (KBP), Waadi Banaspati (WBP).',
    ],
    [
      '6. SKU — one pack from that category, OR several packs in one cell separated by commas (then Target is for the whole category).',
    ],
    [
      '7. Same BA Code can appear on many rows — e.g. three categories (Kashmir Cooking Oil / Kashmir Banaspati / Waadi Banaspati).',
    ],
    ['8. Target — numeric target for that row (required). Do not use 0.'],
    ['9. Save the file, then upload it via Upload targets on Ambassadors.'],
    [],
    COLUMNS.map((c) => c.header),
    [],
    ['Example (three category rows; use the real BA Code from Ambassadors)'],
    [
      opts?.baSamples?.[0]?.code || 'BA-016',
      opts?.baSamples?.[0]?.name || 'Rimsha',
      '2026-10',
      'Kashmir Cooking Oil',
      'KPGO 10 LTR CAN Cons. RED, KPGO 5 LTR TIN Cons. RED',
      120,
    ],
    [
      opts?.baSamples?.[0]?.code || 'BA-016',
      opts?.baSamples?.[0]?.name || 'Rimsha',
      '2026-10',
      'Kashmir Banaspati',
      'KBP GOLD 10 KG BKT',
      80,
    ],
    [
      opts?.baSamples?.[0]?.code || 'BA-016',
      opts?.baSamples?.[0]?.name || 'Rimsha',
      '2026-10',
      'Waadi Banaspati',
      'WBP 5 KG BKT',
      40,
    ],
    [],
    ['BA Code reference (from Ambassadors)'],
    ['BA Code', 'BA Name'],
    ...(opts?.baSamples?.length
      ? opts.baSamples.map((b) => [b.code, b.name])
      : [['BA-001', 'Use codes from Ambassadors']]),
  ])
  help['!cols'] = [
    { wch: 12 },
    { wch: 22 },
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

  if (idx.code < 0) {
    return {
      rows: [],
      errors: [
        'This is not the targets template (need "BA Code"). Download the latest template and fill BA Code for each row.',
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
    const code = String(line[idx.code] ?? '').trim()
    const baName = idx.baName >= 0 ? String(line[idx.baName] ?? '').trim() : ''
    const monthRaw = idx.month >= 0 ? String(line[idx.month] ?? '').trim() : ''
    const month = monthRaw || defaultMonth
    const categoryRaw = idx.category >= 0 ? String(line[idx.category] ?? '').trim() : ''
    const skuRaw = idx.sku >= 0 ? String(line[idx.sku] ?? '').trim() : ''
    const rowErrors: string[] = []

    if (!code) {
      rowErrors.push(`Row ${rowNum}: BA Code is required (e.g. BA-016).`)
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
    let assignedSkus: string[] = []
    if (category && skuRaw) {
      const parts = splitSkuCell(skuRaw)
      if (parts.length > 1) {
        // Category-level target: many SKUs in one cell, one Target for the category.
        const matched: string[] = []
        const bad: string[] = []
        for (const part of parts) {
          const hit = resolveSkuInCategory(part, category)
          if (!hit) bad.push(part)
          else matched.push(hit)
        }
        if (bad.length) {
          rowErrors.push(
            `Row ${rowNum}: SKU(s) not valid for ${category}: ${bad.slice(0, 3).join('; ')}${bad.length > 3 ? '…' : ''}`,
          )
        } else {
          // Store against the category name so monthly totals stay correct (one target, not × SKUs).
          sku = category
          assignedSkus = matched
        }
      } else {
        const matched = resolveSkuInCategory(skuRaw, category)
        if (!matched) {
          rowErrors.push(
            `Row ${rowNum}: SKU "${skuRaw}" is not valid for ${category}. See template sheet "Categories & SKUs".`,
          )
        } else {
          sku = matched
          assignedSkus = [matched]
        }
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
        assignedSkus,
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
