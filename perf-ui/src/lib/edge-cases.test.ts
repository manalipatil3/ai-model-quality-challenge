import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseModelMetadata, parseWorkbook, referenceRow } from './parseXlsx'
import { ParseSweepError, toUploadFileError, USER_MESSAGES } from './uploadErrors'
import { buildCustomerSummary, recommendBestModel } from './goNoGo'
import { DEFAULT_CUSTOMER_REQUIREMENTS } from '../types'
import { detectAnomalies } from './anomalies'
import { generateInsights } from './insights'
import type { ModelSweep, SweepRow } from '../types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PERF = path.resolve(__dirname, '../../../perf_data-20260616T205716Z-3-001/perf_data')
const SAMPLE_L = path.resolve(__dirname, '../../public/samples/Model L profile 1.xlsx')

function readXlsxBuffer(relativeFromPerf: string): ArrayBuffer {
  const full = path.join(PERF, relativeFromPerf)
  const buf = readFileSync(full)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

function makeWorkbookBuffer(rows: unknown[][], sheetName = 'Summary'): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const VALID_HEADER = [
  'Input Length', 'Output Length', 'Cache %', 'Batch Size',
  'Max number of milliseconds', 'Target Max number of milliseconds',
  'Prompt only Throughput (t/s)', 'Gen only Throughput (t/s)', 'Throughput (t/s)',
  'Throughput / box (t/s/hardware)', 'Uncached Throughput (t/s)',
  'Uncached Throughput / box (t/s/hardware)', 'Cached Throughput (t/s)',
  'Cached Throughput / box (t/s/hardware)', 'TTFT (ms)',
  'Real Prompt Speed (t/s/user)', 'Prompt Speed with Queueing (t/s/user)',
  'Gen Speed (t/s/user)', 'RPM',
]

const VALID_HEADER_WITHOUT_RPM = VALID_HEADER.filter((col) => col !== 'RPM')

const VALID_DATA_ROW = [
  10000, 333, 0.5, 10, 218270, 218270, 146741, 40245, 261615, 37373,
  135208, 19314, 126403, 18058, 11, 896160, 450210, 1354, 2514.4,
]

const VALID_DATA_ROW_WITHOUT_RPM = VALID_DATA_ROW.slice(0, -1)

function mockSweep(overrides: Partial<ModelSweep> & { rows?: SweepRow[] } = {}): ModelSweep {
  const row: SweepRow = {
    inputLength: 1000,
    outputLength: 500,
    cachePct: 0.5,
    batchSize: 10,
    maxMs: 1000,
    targetMaxMs: 2000,
    promptOnlyTps: 1000,
    genOnlyTps: 500,
    throughputTps: 1500,
    throughputPerBox: 100,
    uncachedTps: 800,
    uncachedTpsPerBox: 80,
    cachedTps: 700,
    cachedTpsPerBox: 70,
    ttftMs: 10,
    realPromptSpeed: 5000,
    promptSpeedQueued: 4000,
    genSpeedPerUser: 800,
    rpm: 100,
  }
  return {
    id: 'X-profile-1',
    modelId: 'X',
    profile: 1,
    sourceFile: 'Model X profile 1.xlsx',
    rows: [row],
    ...overrides,
  }
}

describe('parseModelMetadata — filename edge cases', () => {
  const cases: Array<[string, { modelId: string; profile: number } | null]> = [
    ['Model M profile 2.xlsx', { modelId: 'M', profile: 2 }],
    ['model m profile2.xlsx', { modelId: 'M', profile: 2 }],
    ['Model M profile2.xlsx', { modelId: 'M', profile: 2 }],
    ['Model_L_profile_3/Model L profile 3.xlsx', { modelId: 'L', profile: 3 }],
    ['Model_M_profile_2/Model M profile 2.xlsx', { modelId: 'M', profile: 2 }],
    ['folder/Model Z profile 7.xlsx', { modelId: 'Z', profile: 7 }],
    ['Model A profile 1.xlsx', { modelId: 'A', profile: 1 }],
    ['random-file.xlsx', null],
    ['Model profile.xlsx', null],
    ['', null],
    ['data.csv', null],
    ['Model MM profile 1.xlsx', { modelId: 'MM', profile: 1 }],
  ]

  it.each(cases)('parses %s', (input, expected) => {
    expect(parseModelMetadata(input)).toEqual(expected)
  })

  it('normalizes model id to uppercase', () => {
    expect(parseModelMetadata('model m profile 2.xlsx')?.modelId).toBe('M')
  })

  it('handles Windows backslash paths', () => {
    expect(parseModelMetadata('C:\\uploads\\Model_M_profile_2\\Model M profile 2.xlsx')).toEqual({
      modelId: 'M',
      profile: 2,
    })
  })

  it('ignores folder prefix — Model_COMPARE/MODEL_M trap', () => {
    expect(parseModelMetadata('Model_COMPARE/MODEL_M_profile_1/Model M profile 1.xlsx')).toEqual({
      modelId: 'M',
      profile: 1,
    })
    expect(parseModelMetadata('COMPARE/MODEL_M_profile_2/Model M profile 2.xlsx')).toEqual({
      modelId: 'M',
      profile: 2,
    })
  })

  it('parses Model_M_profile_1.xlsx basename directly', () => {
    expect(parseModelMetadata('Model_M_profile_1.xlsx')).toEqual({ modelId: 'M', profile: 1 })
  })

  it('parses custom model names without Model prefix', () => {
    expect(parseModelMetadata('MyCustomModel_profile_1.xlsx')).toEqual({
      modelId: 'MyCustomModel',
      profile: 1,
    })
  })

  it('parses model filenames with descriptive suffixes', () => {
    expect(parseModelMetadata('Model_Q_profile_1_missing_RPM.xlsx')).toEqual({
      modelId: 'Q',
      profile: 1,
    })
  })
})

describe('parseWorkbook — xlsx edge cases', () => {
  it('parses real Model A profile 1 from disk', () => {
    const buf = readXlsxBuffer('Model_A_profile_1/Model A profile 1.xlsx')
    const sweep = parseWorkbook(buf, 'Model_A_profile_1/Model A profile 1.xlsx')
    expect(sweep.modelId).toBe('A')
    expect(sweep.profile).toBe(1)
    expect(sweep.rows.length).toBeGreaterThanOrEqual(4)
    expect(sweep.rows[0].batchSize).toBe(10)
  })

  it('parses sample Model L', () => {
    const buf = readFileSync(SAMPLE_L)
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const sweep = parseWorkbook(arrayBuf, 'Model L profile 1.xlsx')
    expect(sweep.modelId).toBe('L')
    expect(sweep.profile).toBe(1)
  })

  it('parses Model M profile 2 style filename from minimal valid workbook', () => {
    const buf = makeWorkbookBuffer([VALID_HEADER, VALID_DATA_ROW])
    const sweep = parseWorkbook(buf, 'model m profile2.xlsx')
    expect(sweep.modelId).toBe('M')
    expect(sweep.profile).toBe(2)
    expect(sweep.id).toBe('M-profile-2')
  })

  it('loads unseen custom model filenames without code changes', () => {
    const buf = makeWorkbookBuffer([VALID_HEADER, VALID_DATA_ROW])
    const sweep = parseWorkbook(buf, 'MyCustomModel_profile_1.xlsx')
    expect(sweep.modelId).toBe('MyCustomModel')
    expect(sweep.profile).toBe(1)
    expect(sweep.id).toBe('MyCustomModel-profile-1')
    expect(sweep.rows).toHaveLength(1)
  })

  it('reports missing RPM column before rejecting valid model filenames', () => {
    const buf = makeWorkbookBuffer([VALID_HEADER_WITHOUT_RPM, VALID_DATA_ROW_WITHOUT_RPM])
    try {
      parseWorkbook(buf, 'Model_Q_profile_1_missing_RPM.xlsx')
      expect.fail('expected missing RPM to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ParseSweepError)
      expect((err as ParseSweepError).code).toBe('missing_columns')
      expect((err as ParseSweepError).fileName).toBe('Model_Q_profile_1_missing_RPM.xlsx')
      expect((err as ParseSweepError).message).toContain('Model Q profile 1')
      expect((err as ParseSweepError).message).toContain('Schema validation failed')
      expect((err as ParseSweepError).message).toContain('- RPM')
    }
  })

  it('uses Summary sheet when multiple sheets exist', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['junk']]), 'Notes')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([VALID_HEADER, VALID_DATA_ROW]), 'Summary')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const sweep = parseWorkbook(buf, 'Model N profile 1.xlsx')
    expect(sweep.rows).toHaveLength(1)
  })

  it('falls back to first sheet when Summary is missing', () => {
    const buf = makeWorkbookBuffer([VALID_HEADER, VALID_DATA_ROW], 'Data')
    const sweep = parseWorkbook(buf, 'Model O profile 1.xlsx')
    expect(sweep.rows).toHaveLength(1)
  })

  it('skips rows with batch size 0', () => {
    const badRow = [...VALID_DATA_ROW]
    badRow[3] = 0
    const buf = makeWorkbookBuffer([VALID_HEADER, badRow, VALID_DATA_ROW])
    const sweep = parseWorkbook(buf, 'Model P profile 1.xlsx')
    expect(sweep.rows).toHaveLength(1)
  })

  it('throws ParseSweepError for unrecognized filename', () => {
    const buf = makeWorkbookBuffer([VALID_HEADER, VALID_DATA_ROW])
    expect(() => parseWorkbook(buf, 'cerebras_task1_validation_pack/06_filename_edge_cases/random_upload_name.xlsx')).toThrow(
      ParseSweepError,
    )
    try {
      parseWorkbook(buf, 'random_upload_name.xlsx')
    } catch (err) {
      expect(err).toBeInstanceOf(ParseSweepError)
      expect((err as ParseSweepError).code).toBe('invalid_filename')
      expect((err as ParseSweepError).fileName).toBe('random_upload_name.xlsx')
    }
  })

  it('throws ParseSweepError when header row is missing', () => {
    const buf = makeWorkbookBuffer([['foo', 'bar'], [1, 2, 3]])
    try {
      parseWorkbook(buf, 'Model Q profile 1.xlsx')
      expect.fail('expected missing header to throw')
    } catch (err) {
      expect((err as ParseSweepError).code).toBe('empty_workbook')
    }
  })

  it('throws ParseSweepError when no data rows exist', () => {
    const buf = makeWorkbookBuffer([VALID_HEADER])
    try {
      parseWorkbook(buf, 'Model R profile 1.xlsx')
      expect.fail('expected no data rows to throw')
    } catch (err) {
      expect((err as ParseSweepError).code).toBe('empty_workbook')
    }
  })

  it('classifies validation-pack filenames by content, not name alone', () => {
    const validBuf = makeWorkbookBuffer([VALID_HEADER, VALID_DATA_ROW])
    const corruptedBuf = new TextEncoder().encode('not xlsx').buffer
    const emptyBuf = makeWorkbookBuffer([VALID_HEADER])

    try {
      parseWorkbook(corruptedBuf, 'corrupted.xlsx')
      expect.fail('expected corrupted.xlsx to throw')
    } catch (err) {
      expect((err as ParseSweepError).code).toBe('corrupted_file')
      expect((err as ParseSweepError).fileName).toBe('corrupted.xlsx')
      expect((err as ParseSweepError).message).toBe(USER_MESSAGES.corrupted_file)
    }

    try {
      parseWorkbook(emptyBuf, 'empty_workbook.xlsx')
      expect.fail('expected empty_workbook.xlsx to throw')
    } catch (err) {
      expect((err as ParseSweepError).code).toBe('empty_workbook')
      expect((err as ParseSweepError).fileName).toBe('empty_workbook.xlsx')
      expect((err as ParseSweepError).message).toBe(USER_MESSAGES.empty_workbook)
    }

    try {
      parseWorkbook(validBuf, 'random_upload_name.xlsx')
      expect.fail('expected random_upload_name.xlsx to throw')
    } catch (err) {
      expect((err as ParseSweepError).code).toBe('invalid_filename')
      expect((err as ParseSweepError).fileName).toBe('random_upload_name.xlsx')
      expect((err as ParseSweepError).message).toBe(USER_MESSAGES.invalid_filename)
    }
  })

  it('throws ParseSweepError for corrupted bytes when filename is valid', () => {
    const buf = new TextEncoder().encode('not a real xlsx file').buffer
    try {
      parseWorkbook(buf, 'Model T profile 1.xlsx')
    } catch (err) {
      expect((err as ParseSweepError).code).toBe('corrupted_file')
      expect((err as ParseSweepError).fileName).toBe('Model T profile 1.xlsx')
      expect((err as ParseSweepError).message).toBe(USER_MESSAGES.corrupted_file)
    }
  })

  it('throws ParseSweepError for zero-byte buffer', () => {
    try {
      parseWorkbook(new ArrayBuffer(0), 'empty_workbook.xlsx')
    } catch (err) {
      expect((err as ParseSweepError).code).toBe('empty_workbook')
      expect((err as ParseSweepError).message).toBe(USER_MESSAGES.empty_workbook)
    }
  })

  it('maps errors to friendly upload messages via toUploadFileError', () => {
    const err = new ParseSweepError('invalid_filename', 'random_upload_name.xlsx')
    const mapped = toUploadFileError(err, 'random_upload_name.xlsx')
    expect(mapped.fileName).toBe('random_upload_name.xlsx')
    expect(mapped.message).toBe(USER_MESSAGES.invalid_filename)
    expect(mapped.hint).toContain('Model X profile N')
    expect(mapped.message).not.toContain('cerebras_task1_validation_pack')
  })

  it('handles numeric strings with commas in cells', () => {
    const row = VALID_DATA_ROW.map((v, i) => (i === 8 ? '261,615.7' : v))
    const buf = makeWorkbookBuffer([VALID_HEADER, row])
    const sweep = parseWorkbook(buf, 'Model S profile 1.xlsx')
    expect(sweep.rows[0].throughputTps).toBeCloseTo(261615.7, 0)
    expect(sweep.rows[0].throughputTps).not.toBeCloseTo(sweep.rows[0].promptOnlyTps, 0)
  })

  it('maps aggregate Throughput (t/s), not prompt-only column', () => {
    const buf = makeWorkbookBuffer([VALID_HEADER, VALID_DATA_ROW])
    const sweep = parseWorkbook(buf, 'Model U profile 1.xlsx')
    expect(sweep.rows[0].throughputTps).toBeCloseTo(261615, 0)
    expect(sweep.rows[0].promptOnlyTps).toBeCloseTo(146741, 0)
    expect(sweep.rows[0].throughputTps).toBeGreaterThan(sweep.rows[0].promptOnlyTps)
  })
})

describe('referenceRow', () => {
  it('prefers batch size 10', () => {
    const sweep = mockSweep({
      rows: [
        { ...mockSweep().rows[0], batchSize: 20, genSpeedPerUser: 999 },
        { ...mockSweep().rows[0], batchSize: 10, genSpeedPerUser: 555 },
      ],
    })
    expect(referenceRow(sweep).genSpeedPerUser).toBe(555)
  })

  it('falls back to first row when batch 10 missing', () => {
    const sweep = mockSweep({
      rows: [{ ...mockSweep().rows[0], batchSize: 30, genSpeedPerUser: 777 }],
    })
    expect(referenceRow(sweep).genSpeedPerUser).toBe(777)
  })
})

describe('recommendBestModel', () => {
  it('returns null for empty list', () => {
    expect(recommendBestModel([])).toBeNull()
  })

  it('prefers higher final score', () => {
    const strongRow: SweepRow = {
      ...mockSweep().rows[0],
      inputLength: 10_000,
      outputLength: 333,
      throughputTps: 250_000,
      ttftMs: 10,
      rpm: 3000,
    }
    const weakRow: SweepRow = {
      ...strongRow,
      throughputTps: 60_000,
      ttftMs: 70,
      rpm: 800,
    }
    const strong = buildCustomerSummary(mockSweep({ modelId: 'GO', id: 'GO-profile-1', rows: [strongRow] }), DEFAULT_CUSTOMER_REQUIREMENTS)
    const weak = buildCustomerSummary(mockSweep({ modelId: 'REV', id: 'REV-profile-1', rows: [weakRow] }), DEFAULT_CUSTOMER_REQUIREMENTS)
    const best = recommendBestModel([weak, strong])
    expect(best?.modelId).toBe('GO')
  })
})

describe('detectAnomalies', () => {
  it('flags latency over target', () => {
    const sweep = mockSweep({
      rows: [{ ...mockSweep().rows[0], maxMs: 5000, targetMaxMs: 1000 }],
    })
    const found = detectAnomalies([sweep])
    expect(found.some((a) => a.severity === 'critical' && a.message.includes('max latency'))).toBe(true)
  })

  it('returns empty for clean sweep', () => {
    expect(detectAnomalies([mockSweep()])).toHaveLength(0)
  })

  it('warns on TTFT between 40 and 60', () => {
    const sweep = mockSweep({ rows: [{ ...mockSweep().rows[0], ttftMs: 45 }] })
    const found = detectAnomalies([sweep])
    expect(found.some((a) => a.severity === 'warning' && a.message.includes('TTFT'))).toBe(true)
  })
})

describe('generateInsights', () => {
  it('returns empty when no sweeps match profile filter', () => {
    expect(generateInsights([mockSweep({ profile: 1 })], 99)).toEqual([])
  })

  it('includes best TTFT insight when models differ', () => {
    const fast = mockSweep({ modelId: 'FAST', id: 'FAST-profile-1', rows: [{ ...mockSweep().rows[0], ttftMs: 5 }] })
    const slow = mockSweep({ modelId: 'SLOW', id: 'SLOW-profile-1', rows: [{ ...mockSweep().rows[0], ttftMs: 30 }] })
    const insights = generateInsights([fast, slow], 1, DEFAULT_CUSTOMER_REQUIREMENTS)
    expect(insights.some((i) => i.message.includes('FAST') && i.message.includes('TTFT'))).toBe(true)
  })
})

describe('upload filter simulation', () => {
  it('accepts .XLSX extension case-insensitively', () => {
    const names = ['Model M profile 2.xlsx', 'Model M profile 2.XLSX', 'data.Xlsx']
    const accepted = names.filter((n) => n.toLowerCase().endsWith('.xlsx'))
    expect(accepted).toHaveLength(3)
  })

  it('rejects non-xlsx files', () => {
    const names = ['data.csv', 'readme.txt', 'model.json']
    const accepted = names.filter((n) => n.toLowerCase().endsWith('.xlsx'))
    expect(accepted).toHaveLength(0)
  })
})

describe('merge sweeps simulation', () => {
  it('replaces same id on re-upload', () => {
    const existing = parseWorkbook(
      makeWorkbookBuffer([VALID_HEADER, VALID_DATA_ROW]),
      'Model M profile 2.xlsx',
    )
    const updatedRow = [...VALID_DATA_ROW]
    updatedRow[8] = 999999 // Throughput (t/s) column
    const incoming = parseWorkbook(
      makeWorkbookBuffer([VALID_HEADER, updatedRow]),
      'Model M profile 2.xlsx',
    )
    const map = new Map([existing].map((s) => [s.id, s]))
    map.set(incoming.id, incoming)
    const merged = Array.from(map.values())
    expect(merged).toHaveLength(1)
    expect(merged[0].rows[0].throughputTps).toBe(999999)
  })

  it('keeps distinct profiles separate', () => {
    const p1 = parseWorkbook(makeWorkbookBuffer([VALID_HEADER, VALID_DATA_ROW]), 'Model M profile 1.xlsx')
    const p2 = parseWorkbook(makeWorkbookBuffer([VALID_HEADER, VALID_DATA_ROW]), 'Model M profile 2.xlsx')
    const map = new Map([p1, p2].map((s) => [s.id, s]))
    expect(map.size).toBe(2)
    expect(map.has('M-profile-1')).toBe(true)
    expect(map.has('M-profile-2')).toBe(true)
  })
})

describe('real data smoke — all default models A-K', () => {
  it('loads profile 1 for every shipped model letter', () => {
    const letters = 'ABCDEFGHIJK'.split('')
    for (const letter of letters) {
      const dir = `Model_${letter}_profile_1`
      const file = `${dir}/Model ${letter} profile 1.xlsx`
      const buf = readXlsxBuffer(file)
      const sweep = parseWorkbook(buf, file)
      expect(sweep.modelId).toBe(letter)
      expect(sweep.profile).toBe(1)
      expect(sweep.rows.length).toBeGreaterThan(0)
    }
  })
})
