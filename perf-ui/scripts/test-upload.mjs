import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PERF = path.resolve(__dirname, '../../perf_data-20260616T205716Z-3-001/perf_data')
const SAMPLE_L = path.resolve(__dirname, '../public/samples/Model L profile 1.xlsx')

function parseMetadata(sourcePath) {
  const normalized = sourcePath.replace(/\\/g, '/')
  const folderMatch = normalized.match(/Model[_\s](.+?)_profile[_\s](\d+)/i)
  if (folderMatch) return { modelId: folderMatch[1].trim(), profile: Number(folderMatch[2]) }
  const fileMatch = normalized.match(/Model\s+(.+?)\s+profile\s+(\d+)\.xlsx/i)
  if (fileMatch) return { modelId: fileMatch[1].trim(), profile: Number(fileMatch[2]) }
  return null
}

function parseFile(filePath) {
  const meta = parseMetadata(path.basename(filePath).includes('Model') ? filePath : filePath)
  const wb = XLSX.readFile(filePath)
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  const dataRows = matrix.filter((row) => row.some((cell) => String(cell).toLowerCase().includes('batch')) === false && Number(row[3]) > 0)
  return { meta, rowCount: dataRows.length }
}

function xlsxIn(dir) {
  const name = fs.readdirSync(dir).find((f) => f.endsWith('.xlsx'))
  return path.join(dir, name)
}

const single = parseFile(xlsxIn(path.join(PERF, 'Model_A_profile_1')))
console.log('Single upload:', single)

const multi = ['Model_B_profile_1', 'Model_C_profile_1'].map((d) => parseFile(xlsxIn(path.join(PERF, d))))
console.log('Multi upload:', multi)

const modelL = parseFile(SAMPLE_L)
console.log('Model L upload:', modelL)

if (!single.meta || single.rowCount < 1) throw new Error('Single file test failed')
if (multi.some((m) => !m.meta)) throw new Error('Multi file test failed')
if (!modelL.meta || modelL.meta.modelId !== 'L') throw new Error('Model L test failed')
console.log('All upload tests passed')
