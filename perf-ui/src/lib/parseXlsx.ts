import * as XLSX from 'xlsx'
import type { ModelSweep, SweepRow } from '../types'
import { ParseSweepError, cleanUploadFileName, displayFileName, formatSweepLabel } from './uploadErrors'

const HEADER_ALIASES: Record<keyof Omit<SweepRow, never>, string[]> = {
  inputLength: ['input length'],
  outputLength: ['output length'],
  cachePct: ['cache %', 'cache%'],
  batchSize: ['batch size'],
  maxMs: ['max number of milliseconds'],
  targetMaxMs: ['target max number of milliseconds'],
  promptOnlyTps: ['prompt only throughput (t/s)', 'prompt only throughput'],
  genOnlyTps: ['gen only throughput (t/s)', 'gen only throughput'],
  throughputTps: ['throughput (t/s)', 'throughput'],
  throughputPerBox: ['throughput / box (t/s/hardware)', 'throughput / box'],
  uncachedTps: ['uncached throughput (t/s)', 'uncached throughput'],
  uncachedTpsPerBox: ['uncached throughput / box (t/s/hardware)', 'uncached throughput / box'],
  cachedTps: ['cached throughput (t/s)', 'cached throughput'],
  cachedTpsPerBox: ['cached throughput / box (t/s/hardware)', 'cached throughput / box'],
  ttftMs: ['ttft (ms)', 'ttft'],
  realPromptSpeed: ['real prompt speed (t/s/user)', 'real prompt speed'],
  promptSpeedQueued: ['prompt speed with queueing (t/s/user)', 'prompt speed with queueing'],
  genSpeedPerUser: ['gen speed (t/s/user)', 'gen speed'],
  rpm: ['rpm'],
}

const COLUMN_LABELS: Record<keyof SweepRow, string> = {
  inputLength: 'Input Length',
  outputLength: 'Output Length',
  cachePct: 'Cache %',
  batchSize: 'Batch Size',
  maxMs: 'Max number of milliseconds',
  targetMaxMs: 'Target Max number of milliseconds',
  promptOnlyTps: 'Prompt only Throughput (t/s)',
  genOnlyTps: 'Gen only Throughput (t/s)',
  throughputTps: 'Throughput (t/s)',
  throughputPerBox: 'Throughput / box (t/s/hardware)',
  uncachedTps: 'Uncached Throughput (t/s)',
  uncachedTpsPerBox: 'Uncached Throughput / box (t/s/hardware)',
  cachedTps: 'Cached Throughput (t/s)',
  cachedTpsPerBox: 'Cached Throughput / box (t/s/hardware)',
  ttftMs: 'TTFT (ms)',
  realPromptSpeed: 'Real Prompt Speed (t/s/user)',
  promptSpeedQueued: 'Prompt Speed with Queueing (t/s/user)',
  genSpeedPerUser: 'Gen Speed (t/s/user)',
  rpm: 'RPM',
}

const REQUIRED_COLUMNS: (keyof SweepRow)[] = ['batchSize', 'throughputTps', 'ttftMs', 'rpm']

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function findColumnIndex(
  normalized: string[],
  aliases: string[],
  exclude?: (cell: string) => boolean,
): number {
  const skip = exclude ?? (() => false)

  for (const alias of aliases) {
    const exact = normalized.findIndex((cell) => !skip(cell) && cell === alias)
    if (exact >= 0) return exact
  }

  const byLength = [...aliases].sort((a, b) => b.length - a.length)
  for (const alias of byLength) {
    const idx = normalized.findIndex((cell) => !skip(cell) && cell.includes(alias))
    if (idx >= 0) return idx
  }
  return -1
}

/** Skip prompt/gen/uncached/cached/box columns when resolving aggregate throughput. */
function isNonAggregateThroughputHeader(cell: string): boolean {
  return (
    cell.includes('prompt only') ||
    cell.includes('gen only') ||
    cell.includes('uncached') ||
    cell.includes('cached') ||
    cell.includes('/ box') ||
    cell.includes('per box')
  )
}

function buildColumnMap(headerRow: unknown[]): Partial<Record<keyof SweepRow, number>> {
  const map: Partial<Record<keyof SweepRow, number>> = {}
  const normalized = headerRow.map(normalizeHeader)

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof SweepRow, string[]][]) {
    const exclude = field === 'throughputTps' ? isNonAggregateThroughputHeader : undefined
    const index = findColumnIndex(normalized, aliases, exclude)
    if (index >= 0) map[field] = index
  }

  return map
}

function validateRequiredColumns(
  columnMap: Partial<Record<keyof SweepRow, number>>,
  fileName: string,
): void {
  const missing = REQUIRED_COLUMNS.filter((field) => columnMap[field] === undefined)
  if (missing.length === 0) return

  const labels = missing.map((field) => COLUMN_LABELS[field])
  const metadata = parseModelMetadata(fileName)
  const prefix = metadata ? `${formatSweepLabel(metadata.modelId, metadata.profile)}\n\n` : ''
  const columnList = labels.map((label) => `- ${label}`).join('\n')

  throw new ParseSweepError(
    'missing_columns',
    fileName,
    `${prefix}Schema validation failed.\n\nMissing required column${labels.length > 1 ? 's' : ''}:\n${columnList}`,
  )
}

function rowFromCells(cells: unknown[], columnMap: Partial<Record<keyof SweepRow, number>>): SweepRow | null {
  const batchIndex = columnMap.batchSize
  if (batchIndex === undefined) return null

  const batchSize = toNumber(cells[batchIndex])
  if (!batchSize) return null

  const get = (field: keyof SweepRow): number => {
    const index = columnMap[field]
    return index === undefined ? 0 : toNumber(cells[index])
  }

  return {
    inputLength: get('inputLength'),
    outputLength: get('outputLength'),
    cachePct: get('cachePct'),
    batchSize,
    maxMs: get('maxMs'),
    targetMaxMs: get('targetMaxMs'),
    promptOnlyTps: get('promptOnlyTps'),
    genOnlyTps: get('genOnlyTps'),
    throughputTps: get('throughputTps'),
    throughputPerBox: get('throughputPerBox'),
    uncachedTps: get('uncachedTps'),
    uncachedTpsPerBox: get('uncachedTpsPerBox'),
    cachedTps: get('cachedTps'),
    cachedTpsPerBox: get('cachedTpsPerBox'),
    ttftMs: get('ttftMs'),
    realPromptSpeed: get('realPromptSpeed'),
    promptSpeedQueued: get('promptSpeedQueued'),
    genSpeedPerUser: get('genSpeedPerUser'),
    rpm: get('rpm'),
  }
}

function isLikelyXlsx(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer)
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  )
}

/** Parse model + profile from the base file name only — never from folder paths. */
export function parseModelMetadata(sourceFile: string): { modelId: string; profile: number } | null {
  const basename = displayFileName(sourceFile)

  const modelPrefixedPatterns: Array<{ pattern: RegExp; uppercaseId: boolean }> = [
    { pattern: /^Model[_\s-](.+?)_profile[_\s-](\d+)(?:[_.\s-].*)?\.xlsx$/i, uppercaseId: true },
    { pattern: /^Model\s+(.+?)\s+profile\s*_?(\d+)(?:\s.*)?\.xlsx$/i, uppercaseId: true },
    { pattern: /^model\s*(\w+)\s*profile\s*_?(\d+)\.xlsx$/i, uppercaseId: true },
  ]

  for (const { pattern, uppercaseId } of modelPrefixedPatterns) {
    const match = basename.match(pattern)
    if (match) {
      const rawId = match[1].trim().replace(/_/g, ' ').trim()
      return {
        modelId: uppercaseId ? rawId.toUpperCase() : rawId,
        profile: Number(match[2]),
      }
    }
  }

  const customMatch = basename.match(/^([A-Za-z][\w.-]*)_profile[_\s-](\d+)(?:[_.\s-].*)?\.xlsx$/i)
  if (customMatch) {
    return {
      modelId: customMatch[1],
      profile: Number(customMatch[2]),
    }
  }

  return null
}

/**
 * Parse pipeline:
 * 1. Check file extension
 * 2. Try reading Excel
 * 3. Check workbook has sheets
 * 4. Detect header row
 * 5. Validate required columns (schema)
 * 6. Parse data rows
 * 7. Parse model/profile from filename
 * 8. Return sweep or throw
 */
export function parseWorkbook(buffer: ArrayBuffer, sourceFile: string): ModelSweep {
  const fileName = displayFileName(sourceFile)

  // 1. Extension
  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    throw new ParseSweepError('invalid_extension', fileName)
  }

  if (buffer.byteLength === 0) {
    throw new ParseSweepError('empty_workbook', fileName)
  }

  if (!isLikelyXlsx(buffer)) {
    throw new ParseSweepError('corrupted_file', fileName)
  }

  // 2. Read Excel
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'array' })
  } catch {
    throw new ParseSweepError('corrupted_file', fileName)
  }

  // 3. Sheets
  if (!workbook.SheetNames.length) {
    throw new ParseSweepError('empty_workbook', fileName)
  }

  const sheetName =
    workbook.SheetNames.find((name) => name.toLowerCase().includes('summary')) ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  if (!sheet || !sheet['!ref']) {
    throw new ParseSweepError('empty_workbook', fileName)
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]

  if (matrix.length === 0) {
    throw new ParseSweepError('empty_workbook', fileName)
  }

  // 4. Header row
  const headerIndex = matrix.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell).includes('batch size')),
  )
  if (headerIndex < 0) {
    throw new ParseSweepError('empty_workbook', fileName)
  }

  const columnMap = buildColumnMap(matrix[headerIndex])

  // 5. Required columns
  validateRequiredColumns(columnMap, fileName)

  const rows: SweepRow[] = []
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const parsed = rowFromCells(matrix[i], columnMap)
    if (parsed) rows.push(parsed)
  }

  if (rows.length === 0) {
    throw new ParseSweepError('empty_workbook', fileName)
  }

  // 6. Filename
  const metadata = parseModelMetadata(fileName)
  if (!metadata) {
    throw new ParseSweepError('invalid_filename', fileName)
  }

  const id = `${metadata.modelId}-profile-${metadata.profile}`

  return {
    id,
    modelId: metadata.modelId,
    profile: metadata.profile,
    sourceFile: fileName,
    rows,
  }
}

export async function parseXlsxFile(file: File): Promise<ModelSweep> {
  const buffer = await file.arrayBuffer()
  const cleanName = cleanUploadFileName(file)
  return parseWorkbook(buffer, cleanName)
}

export function parseXlsxFromJson(data: ModelSweep): ModelSweep {
  return {
    ...data,
    rows: data.rows.map((row) => ({ ...row })),
  }
}

export function referenceRow(sweep: ModelSweep): SweepRow {
  return sweep.rows.find((row) => row.batchSize === 10) ?? sweep.rows[0]
}
