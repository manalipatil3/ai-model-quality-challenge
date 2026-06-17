export type ParseErrorCode =
  | 'invalid_filename'
  | 'invalid_extension'
  | 'corrupted_file'
  | 'empty_workbook'
  | 'missing_header'
  | 'missing_columns'
  | 'no_data_rows'
  | 'unknown'

export interface UploadFileError {
  fileName: string
  code: ParseErrorCode
  message: string
  hint: string
}

/** User-facing messages shown under the filename in the upload error list. */
export const USER_MESSAGES: Record<ParseErrorCode, string> = {
  invalid_filename: 'Unrecognized filename. Expected format: Model X profile N.xlsx',
  invalid_extension: 'Only .xlsx files are supported.',
  corrupted_file: 'Invalid Excel file. Could not read workbook.',
  empty_workbook: 'No valid data found. Workbook has no usable rows or headers.',
  missing_header: 'No valid data found. Workbook has no usable rows or headers.',
  missing_columns: 'Schema validation failed.',
  no_data_rows: 'No valid data found. Workbook has no usable rows or headers.',
  unknown: 'Could not load this file.',
}

const ERROR_HINTS: Record<ParseErrorCode, string> = {
  invalid_filename:
    'Rename to "Model X profile N.xlsx" or "MyModel_profile_N.xlsx" — for example, Model M profile 2.xlsx.',
  invalid_extension: 'Export or save the sweep as an Excel .xlsx workbook.',
  corrupted_file:
    'Re-export from the source tool or pick a different file.',
  empty_workbook:
    'Export a complete perf sweep with a Summary sheet and batch-size rows.',
  missing_header:
    'Expected columns like Batch Size, TTFT (ms), and Throughput (t/s).',
  missing_columns:
    'Workbooks must include Batch Size, Throughput (t/s), TTFT (ms), and RPM columns.',
  no_data_rows:
    'Header row was found but no batch-size data rows exist below it.',
  unknown: 'Check the file format and try again.',
}

export class ParseSweepError extends Error {
  readonly code: ParseErrorCode
  readonly fileName: string
  readonly hint: string

  constructor(code: ParseErrorCode, fileName: string, detail?: string) {
    const message = detail ?? USER_MESSAGES[code]
    super(message)
    this.name = 'ParseSweepError'
    this.code = code
    this.fileName = fileName
    this.hint = ERROR_HINTS[code]
  }
}

export function displayFileName(sourcePath: string): string {
  return sourcePath.replace(/\\/g, '/').split('/').pop() ?? sourcePath
}

export function cleanUploadFileName(file: File): string {
  const pathHint = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
  return displayFileName(pathHint)
}

export function toUploadFileError(err: unknown, fallbackFileName: string): UploadFileError {
  if (err instanceof ParseSweepError) {
    return {
      fileName: err.fileName,
      code: err.code,
      message: err.message,
      hint: err.hint,
    }
  }

  const fileName = displayFileName(fallbackFileName)
  const raw = err instanceof Error ? err.message : String(err)

  if (/corrupt|zip|invalid|unsupported|bad zip|central directory/i.test(raw)) {
    return {
      fileName,
      code: 'corrupted_file',
      message: USER_MESSAGES.corrupted_file,
      hint: ERROR_HINTS.corrupted_file,
    }
  }

  if (/could not parse model|profile from path/i.test(raw)) {
    return {
      fileName,
      code: 'invalid_filename',
      message: USER_MESSAGES.invalid_filename,
      hint: ERROR_HINTS.invalid_filename,
    }
  }

  if (/no header|missing header/i.test(raw)) {
    return {
      fileName,
      code: 'missing_header',
      message: USER_MESSAGES.missing_header,
      hint: ERROR_HINTS.missing_header,
    }
  }

  if (/no data rows/i.test(raw)) {
    return {
      fileName,
      code: 'no_data_rows',
      message: USER_MESSAGES.no_data_rows,
      hint: ERROR_HINTS.no_data_rows,
    }
  }

  return {
    fileName,
    code: 'unknown',
    message: raw || USER_MESSAGES.unknown,
    hint: ERROR_HINTS.unknown,
  }
}

export function formatUploadSummary(
  successCount: number,
  failCount: number,
  successLabels: string[],
): string {
  if (successCount > 0 && failCount > 0) {
    return `Loaded ${successCount} sweep${successCount > 1 ? 's' : ''} (${successLabels.join(', ')}). ${failCount} file${failCount > 1 ? 's' : ''} skipped — see details below.`
  }
  if (successCount > 0) {
    return `Loaded ${successCount} sweep${successCount > 1 ? 's' : ''}: ${successLabels.join(', ')}.`
  }
  return `All ${failCount} file${failCount > 1 ? 's' : ''} could not be loaded.`
}

export function formatModelLabel(modelId: string): string {
  return `Model ${modelId}`
}

export function formatSweepLabel(modelId: string, profile: number): string {
  return `${formatModelLabel(modelId)} profile ${profile}`
}
