import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PERF_DATA = path.resolve(__dirname, '../../perf_data-20260616T205716Z-3-001/perf_data')
const OUT_FILE = path.resolve(__dirname, '../public/default-models.json')
const SAMPLE_DIR = path.resolve(__dirname, '../public/samples')

const HEADER_ALIASES = {
  inputLength: ['input length'],
  outputLength: ['output length'],
  cachePct: ['cache %', 'cache%'],
  batchSize: ['batch size'],
  maxMs: ['max number of milliseconds'],
  targetMaxMs: ['target max number of milliseconds'],
  promptOnlyTps: ['prompt only throughput (t/s)'],
  genOnlyTps: ['gen only throughput (t/s)'],
  throughputTps: ['throughput (t/s)'],
  throughputPerBox: ['throughput / box (t/s/hardware)'],
  uncachedTps: ['uncached throughput (t/s)'],
  uncachedTpsPerBox: ['uncached throughput / box (t/s/hardware)'],
  cachedTps: ['cached throughput (t/s)'],
  cachedTpsPerBox: ['cached throughput / box (t/s/hardware)'],
  ttftMs: ['ttft (ms)'],
  realPromptSpeed: ['real prompt speed (t/s/user)'],
  promptSpeedQueued: ['prompt speed with queueing (t/s/user)'],
  genSpeedPerUser: ['gen speed (t/s/user)'],
  rpm: ['rpm'],
}

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function isNonAggregateThroughputHeader(cell) {
  return (
    cell.includes('prompt only') ||
    cell.includes('gen only') ||
    cell.includes('uncached') ||
    cell.includes('cached') ||
    cell.includes('/ box') ||
    cell.includes('per box')
  )
}

function findColumnIndex(normalized, aliases, exclude) {
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

function buildColumnMap(headerRow) {
  const map = {}
  const normalized = headerRow.map(normalizeHeader)
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const exclude = field === 'throughputTps' ? isNonAggregateThroughputHeader : undefined
    const index = findColumnIndex(normalized, aliases, exclude)
    if (index >= 0) map[field] = index
  }
  return map
}

function parseMetadata(sourcePath) {
  const normalized = sourcePath.replace(/\\/g, '/')
  const folderMatch = normalized.match(/Model[_\s](.+?)_profile[_\s](\d+)/i)
  if (folderMatch) return { modelId: folderMatch[1].trim(), profile: Number(folderMatch[2]) }
  const fileMatch = normalized.match(/Model\s+(.+?)\s+profile\s+(\d+)\.xlsx/i)
  if (fileMatch) return { modelId: fileMatch[1].trim(), profile: Number(fileMatch[2]) }
  return null
}

function parseFile(filePath) {
  const metadata = parseMetadata(filePath)
  if (!metadata) throw new Error(`Bad path: ${filePath}`)

  const wb = XLSX.readFile(filePath)
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('summary')) ?? wb.SheetNames[0]
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })

  const headerIndex = matrix.findIndex((row) => row.some((cell) => normalizeHeader(cell).includes('batch size')))
  if (headerIndex < 0) throw new Error(`No header in ${filePath}`)

  const columnMap = buildColumnMap(matrix[headerIndex])
  const rows = []

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const cells = matrix[i]
    const batchIndex = columnMap.batchSize
    if (batchIndex === undefined) continue
    const batchSize = toNumber(cells[batchIndex])
    if (!batchSize) continue

    const get = (field) => {
      const index = columnMap[field]
      return index === undefined ? 0 : toNumber(cells[index])
    }

    rows.push({
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
    })
  }

  return {
    id: `${metadata.modelId}-profile-${metadata.profile}`,
    modelId: metadata.modelId,
    profile: metadata.profile,
    sourceFile: path.basename(filePath),
    rows,
  }
}

function walkXlsx(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walkXlsx(full))
    else if (entry.name.endsWith('.xlsx')) results.push(full)
  }
  return results
}

if (!fs.existsSync(PERF_DATA)) {
  if (fs.existsSync(OUT_FILE)) {
    console.warn(`Perf data folder missing at ${PERF_DATA}; reusing existing ${OUT_FILE}`)
    process.exit(0)
  }
  throw new Error(`Perf data folder missing at ${PERF_DATA} and no prebuilt default-models.json found`)
}

const allFiles = walkXlsx(PERF_DATA)
const defaultFiles = allFiles.filter((f) => {
  const meta = parseMetadata(f)
  if (!meta) return false
  return meta.modelId.length === 1 && meta.modelId >= 'A' && meta.modelId <= 'K'
})

const sweeps = defaultFiles.map(parseFile).sort((a, b) => {
  const cmp = a.modelId.localeCompare(b.modelId)
  return cmp !== 0 ? cmp : a.profile - b.profile
})

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
fs.writeFileSync(OUT_FILE, JSON.stringify(sweeps))
console.log(`Wrote ${sweeps.length} default sweeps to ${OUT_FILE}`)

// Generate fake Model L sample (derived from Model A profile 1 with boosted speed)
const modelA1 = sweeps.find((s) => s.modelId === 'A' && s.profile === 1)
if (modelA1) {
  fs.mkdirSync(SAMPLE_DIR, { recursive: true })
  const modelL = {
    ...modelA1,
    id: 'L-profile-1',
    modelId: 'L',
    profile: 1,
    sourceFile: 'Model L profile 1.xlsx',
    rows: modelA1.rows.map((row) => ({
      ...row,
      throughputTps: row.throughputTps * 1.35,
      genSpeedPerUser: row.genSpeedPerUser * 1.4,
      ttftMs: row.ttftMs * 0.75,
      throughputPerBox: row.throughputPerBox * 1.2,
    })),
  }

  const header = [
    'Input Length', 'Output Length', 'Cache %', 'Batch Size',
    'Max number of milliseconds', 'Target Max number of milliseconds',
    'Prompt only Throughput (t/s)', 'Gen only Throughput (t/s)', 'Throughput (t/s)',
    'Throughput / box (t/s/hardware)', 'Uncached Throughput (t/s)',
    'Uncached Throughput / box (t/s/hardware)', 'Cached Throughput (t/s)',
    'Cached Throughput / box (t/s/hardware)', 'TTFT (ms)',
    'Real Prompt Speed (t/s/user)', 'Prompt Speed with Queueing (t/s/user)',
    'Gen Speed (t/s/user)', 'RPM',
  ]

  const aoa = [
    header,
    ...modelL.rows.map((r) => [
      r.inputLength, r.outputLength, r.cachePct, r.batchSize,
      r.maxMs, r.targetMaxMs, r.promptOnlyTps, r.genOnlyTps, r.throughputTps,
      r.throughputPerBox, r.uncachedTps, r.uncachedTpsPerBox, r.cachedTps,
      r.cachedTpsPerBox, r.ttftMs, r.realPromptSpeed, r.promptSpeedQueued,
      r.genSpeedPerUser, r.rpm,
    ]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Summary')
  const outXlsx = path.join(SAMPLE_DIR, 'Model L profile 1.xlsx')
  XLSX.writeFile(wb, outXlsx)
  console.log(`Wrote sample Model L file to ${outXlsx}`)
}
