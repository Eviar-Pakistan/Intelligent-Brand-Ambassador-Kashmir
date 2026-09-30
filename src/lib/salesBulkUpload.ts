/**
 * Kashmir targets bulk upload: download template → fill → upload.
 * Columns: BA Code, BA Name, Month, SKU, Target, Sales (Kg)
 */

const SHEET = 'Sales'

const COLUMNS = [
  { key: 'code', header: 'BA Code', width: 12 },
  { key: 'baName', header: 'BA Name', width: 22 },
  { key: 'month', header: 'Month', width: 14 },
  { key: 'sku', header: 'SKU', width: 20 },
  { key: 'target', header: 'Target', width: 12 },
  { key: 'sales', header: 'Sales (Kg)', width: 14 },
] as const

export type SalesBulkRow = {
  code: string
  baName: string
  month: string
  sku: string
  target: number
  /** null = sales cell left blank (not filled). */
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

/** Optional numeric cell — blank stays empty (null), not 0. */
function parseOptionalNumber(value: unknown, label: string, row: number, errors: string[]) {
  if (value === '' || value == null) return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`Row ${row}: ${label} must be a non-negative number.`)
    return null
  }
  return Math.round(n * 10) / 10
}

/** Downloads the .xlsx template for BA target / sales upload. */
export async function downloadSalesBulkTemplate(opts?: {
  baSamples?: { code: string; name: string }[]
}) {
  const XLSX = await import('xlsx')
  const now = new Date()
  const monthName = now.toLocaleString('en-PK', { month: 'long' })
  const codes =
    opts?.baSamples?.length
      ? opts.baSamples
      : [
          { code: 'BA-001', name: 'Sample BA' },
          { code: 'BA-002', name: 'Sample BA' },
          { code: 'BA-003', name: 'Sample BA' },
        ]

  const sampleRows = codes.slice(0, 5).flatMap((b, i) => {
    const skus =
      i % 2 === 0
        ? [
            [b.code, b.name, monthName, 'Pouch 1LTR', 120, ''],
            [b.code, b.name, monthName, 'BKT 5KG', 80, ''],
          ]
        : [[b.code, b.name, monthName, 'Tin 16KG', 60, '']]
    return skus
  })

  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header), ...sampleRows])
  sheet['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill the Kashmir targets upload template'],
    [],
    [`1. The "${SHEET}" sheet already has sample rows — edit or replace them.`],
    ['2. Add one row per BA Code + Month + SKU. Do not change the header row.'],
    ['3. BA Code — optional if BA Name is filled; otherwise required. Matched to Ambassadors.'],
    ['4. BA Name — used to find BA Code when Code is blank. Must match Ambassadors exactly.'],
    ['5. Month — full month name (e.g. September) or YYYY-MM. Blank = current month.'],
    ['6. SKU — pack size label (e.g. Pouch 1LTR, BKT 5KG).'],
    ['7. Target — numeric target for that row (required).'],
    ['8. Sales (Kg) — leave blank if not filled yet (do not put 0).'],
    ['9. Save the file, then upload it via Upload targets on Ambassadors.'],
    [],
    COLUMNS.map((c) => c.header),
    ...sampleRows,
    [],
    ['BA code reference'],
    ['BA Code', 'BA Name'],
    ...(opts?.baSamples?.length
      ? opts.baSamples.map((b) => [b.code, b.name])
      : [['BA-001', 'Replace with real codes from Ambassadors']]),
  ])
  help['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, SHEET)
  XLSX.utils.book_append_sheet(wb, help, 'Instructions')
  XLSX.writeFile(wb, 'Kashmir_Targets_Bulk_Upload_Template.xlsx')
}

/** Reads a filled targets template. Valid rows are returned even when others have problems. */
export async function parseSalesBulkFile(file: File): Promise<SalesParseResult> {
  const XLSX = await import('xlsx')

  let table: unknown[][]
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
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
    sku: headers.findIndex((h) => h === 'sku'),
    target: headers.findIndex((h) => h === 'target'),
    sales: headers.findIndex((h) => h === 'sales (kg)' || h === 'sales'),
  }

  if (idx.code < 0 && idx.baName < 0) {
    return {
      rows: [],
      errors: [
        'This is not the targets template (need "BA Code" or "BA Name"). Download the template and fill that.',
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
    const baName = idx.baName >= 0 ? String(line[idx.baName] ?? '').trim() : ''
    const monthRaw = idx.month >= 0 ? String(line[idx.month] ?? '').trim() : ''
    const month = monthRaw || defaultMonth
    const sku = idx.sku >= 0 ? String(line[idx.sku] ?? '').trim() : ''
    const rowErrors: string[] = []

    if (!code && !baName) {
      rowErrors.push(`Row ${rowNum}: BA Code or BA Name is required.`)
    }
    if (!sku) rowErrors.push(`Row ${rowNum}: SKU is required.`)

    const target = parseNumber(idx.target >= 0 ? line[idx.target] : '', 'Target', rowNum, rowErrors)
    const sales = parseOptionalNumber(
      idx.sales >= 0 ? line[idx.sales] : '',
      'Sales (Kg)',
      rowNum,
      rowErrors,
    )

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    rows.push({
      row: rowNum,
      input: {
        code,
        baName,
        month,
        sku,
        target: target as number,
        sales,
      },
    })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No data rows found. Add at least one row under the header.')
  }

  return { rows, errors }
}
