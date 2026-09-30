/**
 * Kashmir targets bulk upload: download template → fill → upload.
 * Columns: BA Name, Month, SKU, Target
 */

const SHEET = 'Sales'

const COLUMNS = [
  { key: 'baName', header: 'BA Name', width: 22 },
  { key: 'month', header: 'Month', width: 14 },
  { key: 'sku', header: 'SKU', width: 20 },
  { key: 'target', header: 'Target', width: 12 },
] as const

export type SalesBulkRow = {
  code: string
  baName: string
  month: string
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

/** Downloads a blank .xlsx template (headers only — no sample rows). */
export async function downloadSalesBulkTemplate(opts?: {
  baSamples?: { code: string; name: string }[]
}) {
  const XLSX = await import('xlsx')

  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header)])
  sheet['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill the Kashmir targets upload template'],
    [],
    [`1. Add one row per BA Name + Month + SKU on the "${SHEET}" sheet. Do not change the header row.`],
    ['2. BA Name — required. Must match Ambassadors exactly.'],
    ['3. Month — full month name (e.g. September) or YYYY-MM. Blank = current month.'],
    ['4. SKU — pack size label (e.g. Pouch 1LTR, BKT 5KG).'],
    ['5. Target — numeric target for that row (required).'],
    ['6. Save the file, then upload it via Upload targets on Ambassadors.'],
    [],
    COLUMNS.map((c) => c.header),
    [],
    ['BA name reference'],
    ['BA Name', 'BA Code'],
    ...(opts?.baSamples?.length
      ? opts.baSamples.map((b) => [b.name, b.code])
      : [['Use names from Ambassadors', '']]),
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
    const sku = idx.sku >= 0 ? String(line[idx.sku] ?? '').trim() : ''
    const rowErrors: string[] = []

    if (!baName) {
      rowErrors.push(`Row ${rowNum}: BA Name is required.`)
    }
    if (!sku) rowErrors.push(`Row ${rowNum}: SKU is required.`)

    const target = parseNumber(idx.target >= 0 ? line[idx.target] : '', 'Target', rowNum, rowErrors)

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
        sales: null,
      },
    })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No data rows found. Add at least one row under the header.')
  }

  return { rows, errors }
}
