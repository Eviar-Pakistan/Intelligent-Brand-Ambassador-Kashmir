/**
 * Kashmir targets bulk upload: download template → fill → upload.
 * Columns: BA Code, Month, SKU, Target, Sales (Kg)
 */

const SHEET = 'Sales'

const COLUMNS = [
  { key: 'code', header: 'BA Code', width: 12 },
  { key: 'month', header: 'Month', width: 14 },
  { key: 'sku', header: 'SKU', width: 20 },
  { key: 'target', header: 'Target', width: 12 },
  { key: 'sales', header: 'Sales (Kg)', width: 14 },
] as const

export type SalesBulkRow = {
  code: string
  month: string
  sku: string
  target: number
  sales: number
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

/** Downloads the .xlsx template for BA target / sales upload. */
export async function downloadSalesBulkTemplate() {
  const XLSX = await import('xlsx')
  const sampleRows = [
    ['BA-001', 'September', 'Pouch 1LTR', 120, 96],
    ['BA-001', 'September', 'BKT 5KG', 80, 72],
    ['BA-002', 'September', 'Pouch 1LTR', 100, 88],
    ['BA-003', 'September', 'Tin 16KG', 60, 54],
    ['BA-004', 'September', 'Pouch 1LTR', 110, 102],
  ]
  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header), ...sampleRows])
  sheet['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill the Kashmir targets upload template'],
    [],
    [`1. The "${SHEET}" sheet already has sample rows — edit or replace them.`],
    ['2. Add one row per BA Code + Month + SKU. Do not change the header row.'],
    ['3. BA Code — ambassador code (e.g. BA-001 for Ayesha Khan, BA-002 for Hamza Ali).'],
    ['4. Month — full month name (e.g. January, February) or YYYY-MM.'],
    ['5. SKU — pack size label (e.g. Pouch 1LTR, BKT 5KG).'],
    ['6. Target — numeric target for that row.'],
    ['7. Sales (Kg) — numeric sales in kilograms.'],
    ['8. Save the file, then upload it via Upload targets on Ambassadors.'],
    [],
    COLUMNS.map((c) => c.header),
    ...sampleRows,
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
    month: headers.findIndex((h) => h === 'month'),
    sku: headers.findIndex((h) => h === 'sku'),
    target: headers.findIndex((h) => h === 'target'),
    sales: headers.findIndex((h) => h === 'sales (kg)' || h === 'sales'),
  }

  if (idx.code < 0) {
    return {
      rows: [],
      errors: [
        'This is not the targets template (no "BA Code" column). Download the template and fill that.',
      ],
    }
  }

  const rows: ParsedSalesRow[] = []
  const errors: string[] = []

  for (let r = 1; r < table.length; r += 1) {
    const line = table[r] ?? []
    const isBlank = line.every((c) => String(c ?? '').trim() === '')
    if (isBlank) continue

    const rowNum = r + 1
    const code = String(line[idx.code] ?? '').trim()
    const month = idx.month >= 0 ? String(line[idx.month] ?? '').trim() : ''
    const sku = idx.sku >= 0 ? String(line[idx.sku] ?? '').trim() : ''
    const rowErrors: string[] = []

    if (!code) rowErrors.push(`Row ${rowNum}: BA Code is required.`)
    if (!month) rowErrors.push(`Row ${rowNum}: Month is required.`)
    if (!sku) rowErrors.push(`Row ${rowNum}: SKU is required.`)

    const target = parseNumber(idx.target >= 0 ? line[idx.target] : '', 'Target', rowNum, rowErrors)
    const sales = parseNumber(idx.sales >= 0 ? line[idx.sales] : '', 'Sales (Kg)', rowNum, rowErrors)

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    rows.push({
      row: rowNum,
      input: {
        code,
        month,
        sku,
        target: target as number,
        sales: sales as number,
      },
    })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No data rows found. Add at least one row under the header.')
  }

  return { rows, errors }
}
