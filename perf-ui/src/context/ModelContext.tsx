import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CustomerRequirements, ModelSweep, ViewTab } from '../types'
import { DEFAULT_CUSTOMER_REQUIREMENTS } from '../types'
import { parseXlsxFile, parseXlsxFromJson } from '../lib/parseXlsx'
import {
  cleanUploadFileName,
  formatModelLabel,
  formatUploadSummary,
  toUploadFileError,
  type UploadFileError,
} from '../lib/uploadErrors'

export interface UploadResult {
  status: 'idle' | 'uploading' | 'success' | 'partial' | 'error'
  message: string | null
  uploadedIds: string[]
  failedFiles: UploadFileError[]
  uploadedAt: number | null
}

interface ModelContextValue {
  sweeps: ModelSweep[]
  loading: boolean
  error: string | null
  uploadResult: UploadResult
  activeTab: ViewTab
  selectedProfile: number
  compareIds: string[]
  requirements: CustomerRequirements
  setRequirements: (requirements: CustomerRequirements) => void
  uploadFiles: (files: FileList | File[]) => Promise<void>
  clearUploads: () => void
  setActiveTab: (tab: ViewTab) => void
  setSelectedProfile: (profile: number) => void
  toggleCompare: (id: string) => void
  setCompareIds: (ids: string[]) => void
}

const ModelContext = createContext<ModelContextValue | null>(null)

function mergeSweeps(existing: ModelSweep[], incoming: ModelSweep[]): ModelSweep[] {
  const map = new Map(existing.map((s) => [s.id, s]))
  for (const sweep of incoming) {
    map.set(sweep.id, sweep)
  }
  return Array.from(map.values()).sort((a, b) => {
    const modelCmp = a.modelId.localeCompare(b.modelId, undefined, { numeric: true })
    return modelCmp !== 0 ? modelCmp : a.profile - b.profile
  })
}

export function ModelProvider({ children }: { children: ReactNode }) {
  const [sweeps, setSweeps] = useState<ModelSweep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ViewTab>('customer')
  const [selectedProfile, setSelectedProfile] = useState(1)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult>({
    status: 'idle',
    message: null,
    uploadedIds: [],
    failedFiles: [],
    uploadedAt: null,
  })
  const [requirements, setRequirements] = useState<CustomerRequirements>(DEFAULT_CUSTOMER_REQUIREMENTS)

  useEffect(() => {
    let cancelled = false

    async function loadDefaults() {
      try {
        const response = await fetch('/default-models.json')
        if (!response.ok) throw new Error('Failed to load default model data')
        const data = (await response.json()) as ModelSweep[]
        if (!cancelled) {
          setSweeps(data.map(parseXlsxFromJson))
          setDefaultsLoaded(true)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to preload models')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDefaults()
    return () => {
      cancelled = true
    }
  }, [])

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null)
      setUploadResult({
        status: 'uploading',
        message: 'Parsing uploaded files…',
        uploadedIds: [],
        failedFiles: [],
        uploadedAt: null,
      })

      const list = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.xlsx'))
      if (list.length === 0) {
        const msg = 'No .xlsx files found. Use a file named like "Model M profile 2.xlsx".'
        setUploadResult({
          status: 'error',
          message: msg,
          uploadedIds: [],
          failedFiles: [],
          uploadedAt: Date.now(),
        })
        return
      }

      const parsed: ModelSweep[] = []
      const failedFiles: UploadFileError[] = []

      for (const file of list) {
        try {
          parsed.push(await parseXlsxFile(file))
        } catch (err) {
          failedFiles.push(toUploadFileError(err, cleanUploadFileName(file)))
        }
      }

      if (parsed.length > 0) {
        const uploadedIds = parsed.map((s) => s.id)
        setSweeps((prev) => mergeSweeps(prev, parsed))
        setCompareIds((prev) => {
          const next = new Set(prev)
          parsed.forEach((s) => next.add(s.id))
          return Array.from(next)
        })

        const profile = parsed[0].profile
        if (parsed.length === 1) {
          setSelectedProfile(profile)
        }

        const labels = parsed.map((s) => `${formatModelLabel(s.modelId)} profile ${s.profile}`)
        const summary = formatUploadSummary(parsed.length, failedFiles.length, labels)

        setUploadResult({
          status: failedFiles.length > 0 ? 'partial' : 'success',
          message:
            failedFiles.length === 0 && parsed.length === 1
              ? `${summary} Switched to profile ${profile}.`
              : summary,
          uploadedIds,
          failedFiles,
          uploadedAt: Date.now(),
        })
      } else {
        setUploadResult({
          status: 'error',
          message: formatUploadSummary(0, failedFiles.length, []),
          uploadedIds: [],
          failedFiles,
          uploadedAt: Date.now(),
        })
      }
    },
    [],
  )

  const clearUploads = useCallback(() => {
    if (!defaultsLoaded) return
    fetch('/default-models.json')
      .then((r) => r.json())
      .then((data: ModelSweep[]) => {
        setSweeps(data.map(parseXlsxFromJson))
        setCompareIds([])
        setError(null)
        setUploadResult({ status: 'idle', message: null, uploadedIds: [], failedFiles: [], uploadedAt: null })
      })
      .catch(() => setError('Could not reset to default data'))
  }, [defaultsLoaded])

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const value = useMemo(
    () => ({
      sweeps,
      loading,
      error,
      uploadResult,
      activeTab,
      selectedProfile,
      compareIds,
      requirements,
      setRequirements,
      uploadFiles,
      clearUploads,
      setActiveTab,
      setSelectedProfile,
      toggleCompare,
      setCompareIds,
    }),
    [
      sweeps,
      loading,
      error,
      uploadResult,
      activeTab,
      selectedProfile,
      compareIds,
      requirements,
      uploadFiles,
      clearUploads,
      toggleCompare,
    ],
  )

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>
}

export function useModels() {
  const ctx = useContext(ModelContext)
  if (!ctx) throw new Error('useModels must be used within ModelProvider')
  return ctx
}
