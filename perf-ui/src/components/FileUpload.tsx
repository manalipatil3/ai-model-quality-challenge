import { useMemo } from 'react'
import type { InputHTMLAttributes } from 'react'
import { useModels } from '../context/ModelContext'
import type { ParseErrorCode } from '../lib/uploadErrors'

const folderInputProps = {
  webkitdirectory: '',
  directory: '',
} as InputHTMLAttributes<HTMLInputElement>

const ERROR_ICONS: Record<ParseErrorCode, string> = {
  invalid_filename: '📝',
  invalid_extension: '📎',
  corrupted_file: '⚠️',
  empty_workbook: '📭',
  missing_header: '📋',
  missing_columns: '📋',
  no_data_rows: '📊',
  unknown: '❌',
}

function UploadErrorList({ errors }: { errors: { fileName: string; code: ParseErrorCode; message: string; hint: string }[] }) {
  if (errors.length === 0) return null

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-400/90">
        {errors.length} file{errors.length > 1 ? 's' : ''} skipped
      </p>
      <ul className="space-y-2">
        {errors.map((item) => (
          <li
            key={item.fileName}
            className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-sm"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0" aria-hidden>
                {ERROR_ICONS[item.code]}
              </span>
              <div>
                <p className="font-medium text-amber-100">{item.fileName}</p>
                <p className="mt-0.5 whitespace-pre-line text-amber-200/90">{item.message}</p>
                <p className="mt-1 text-xs text-amber-200/60">{item.hint}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FileUpload() {
  const { uploadFiles, clearUploads, sweeps, uploadResult } = useModels()

  const modelIds = useMemo(
    () => Array.from(new Set(sweeps.map((s) => s.modelId))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [sweeps],
  )

  const defaultModelIds = useMemo(() => new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']), [])
  const uploadedModels = modelIds.filter((id) => !defaultModelIds.has(id))

  const statusBannerClass =
    uploadResult.status === 'success'
      ? 'border-emerald-700/50 bg-emerald-950/30 text-emerald-200'
      : uploadResult.status === 'partial'
        ? 'border-amber-700/50 bg-amber-950/25 text-amber-100'
        : uploadResult.status === 'error'
          ? 'border-red-800/50 bg-red-950/30 text-red-200'
          : ''

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500">
          Upload .xlsx sweeps
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) uploadFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
        <label className="cursor-pointer rounded-lg border border-cyan-700 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-950">
          Upload folder
          <input
            type="file"
            accept=".xlsx"
            multiple
            className="hidden"
            {...folderInputProps}
            onChange={(e) => {
              if (e.target.files) uploadFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
        <button
          type="button"
          onClick={clearUploads}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Reset to defaults
        </button>
        <span className="text-sm text-slate-400">
          {sweeps.length} sweeps · {modelIds.length} models
        </span>
      </div>

      {uploadResult.status === 'uploading' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-cyan-950/40 px-4 py-3 text-sm text-cyan-200">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          {uploadResult.message}
        </div>
      )}

      {uploadResult.message && uploadResult.status !== 'uploading' && uploadResult.status !== 'idle' && (
        <div className={`mt-3 rounded-lg border px-4 py-3 text-sm ${statusBannerClass}`}>
          {uploadResult.message}
        </div>
      )}

      <UploadErrorList errors={uploadResult.failedFiles} />

      {uploadedModels.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Uploaded models:</span>
          {uploadedModels.map((id) => (
            <span
              key={id}
              className="rounded-full bg-violet-600/30 px-2.5 py-0.5 text-xs font-semibold text-violet-200 ring-1 ring-violet-500/40"
            >
              Model {id}
            </span>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-slate-500">
        Valid names: <code className="text-slate-400">Model M profile 2.xlsx</code> or{' '}
        <code className="text-slate-400">MyCustomModel_profile_1.xlsx</code>. Excel content is validated
        before the filename — invalid, empty, or corrupted files are skipped with a clear message.
      </p>
    </div>
  )
}
