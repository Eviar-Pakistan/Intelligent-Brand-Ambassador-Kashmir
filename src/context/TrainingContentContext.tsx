import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import defaultTrainingVideo from '../assets/kashmir-cooking-oil-.mp4'
import { isApiAuthenticated } from '../lib/api'
import {
  baPublicTrainingVideoUrl,
  deleteTrainingVideoFromApi,
  fetchTrainingVideosFromApi,
  mapApiQuestions,
  uploadTrainingVideoToApi,
} from '../lib/trainingApi'
import {
  getInviteTraining,
  subscribeInviteTraining,
  type InviteTrainingPayload,
} from '../lib/baAccounts'

/** The built-in training video and question. Bundled as a static asset, so it can't be lost
 *  or deleted — it is always available even before Head Office uploads anything of their own. */
export const DEFAULT_MODULE_ID = 'tm-default'

export type AssessmentQuestion = {
  id: string
  prompt: string
}

export type TrainingModule = {
  id: string
  title: string
  description: string
  videoName: string
  videoUrl: string
  questions: AssessmentQuestion[]
  createdAt: string
}

type TrainingContentContextValue = {
  modules: TrainingModule[]
  /** Prefer this for BA onboarding (API invite video → HO upload → default). */
  activeModule: TrainingModule | undefined
  loading: boolean
  refreshFromApi: () => Promise<void>
  addModule: (
    module: Omit<TrainingModule, 'id' | 'createdAt'>,
    videoFile?: File,
  ) => TrainingModule
  uploadModule: (input: {
    title: string
    description: string
    videoFile: File
    questions: string[]
  }) => Promise<{ module: TrainingModule; warning?: string }>
  removeModule: (id: string) => void | Promise<void>
}

const TrainingContentContext = createContext<TrainingContentContextValue | null>(null)

/**
 * The default module is never stored (it's a bundled asset, not an upload), so it can't be
 * lost to a storage clear, corrupted by the IndexedDB round-trip, or removed via the UI — it
 * is appended to `modules` on every render instead of living in provider state.
 */
const DEFAULT_MODULE: TrainingModule = {
  id: DEFAULT_MODULE_ID,
  title: 'Kashmir product knowledge',
  description: 'Core talking points for cooking oil benefits and objections.',
  videoName: 'kashmir-cooking-oil-.mp4',
  videoUrl: defaultTrainingVideo,
  questions: [
    {
      id: 'q1',
      prompt: 'Aap kashmir cooking oil kay baray main kia jantay hain?',
    },
  ],
  createdAt: new Date(0).toISOString(),
}

// ─── Persistence ─────────────────────────────────────────────────────────────
// Module text lives in localStorage; the video files live in IndexedDB. Together they let a
// training link opened in a new tab (or after a reload) still find the uploaded video.

const META_KEY = 'ba-training-modules-v1'
const DB_NAME = 'ba-training-videos'
const STORE = 'videos'

type StoredModule = Omit<TrainingModule, 'videoUrl'> & { hasVideo: boolean }

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const saveVideo = (id: string, file: Blob) => withStore('readwrite', (s) => s.put(file, id))
const loadVideo = (id: string) => withStore<Blob | undefined>('readonly', (s) => s.get(id))
const deleteVideo = (id: string) => withStore('readwrite', (s) => s.delete(id))

function readStoredModules(): StoredModule[] | null {
  try {
    const raw = localStorage.getItem(META_KEY)
    return raw ? (JSON.parse(raw) as StoredModule[]) : null
  } catch {
    return null
  }
}

function moduleFromInvite(training: InviteTrainingPayload | null): TrainingModule | null {
  if (!training?.has_video) return null
  const questions = mapApiQuestions(training.questions)
  return {
    id: 'api-active-invite',
    title: training.original_name || 'BA training video',
    description: training.transcript_preview || '',
    videoName: training.original_name || 'training.mp4',
    videoUrl: training.video_url || baPublicTrainingVideoUrl(),
    questions: questions.length
      ? questions
      : DEFAULT_MODULE.questions,
    createdAt: training.uploaded_at || new Date().toISOString(),
  }
}

export function TrainingContentProvider({ children }: { children: ReactNode }) {
  // Only Head-Office-uploaded modules live here; the default module is appended below.
  const [customModules, setCustomModules] = useState<TrainingModule[]>([])
  const [apiModules, setApiModules] = useState<TrainingModule[]>([])
  const [inviteSnap, setInviteSnap] = useState<InviteTrainingPayload | null>(() => getInviteTraining())
  const [loading, setLoading] = useState(false)
  const hydrated = useRef(false)

  useEffect(() => subscribeInviteTraining(() => setInviteSnap(getInviteTraining())), [])

  const refreshFromApi = useCallback(async () => {
    if (!isApiAuthenticated()) {
      setApiModules([])
      return
    }
    setLoading(true)
    try {
      const list = await fetchTrainingVideosFromApi()
      setApiModules(list)
    } catch {
      // keep previous / local modules
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshFromApi()
  }, [refreshFromApi])

  useEffect(() => {
    let cancelled = false
    const stored = readStoredModules()
    if (!stored) {
      hydrated.current = true
      return
    }
    Promise.all(
      stored.map(async ({ hasVideo, ...m }): Promise<TrainingModule> => {
        let videoUrl = ''
        if (hasVideo) {
          try {
            const blob = await loadVideo(m.id)
            if (blob) videoUrl = URL.createObjectURL(blob)
          } catch {
            // video unavailable — the module still shows without it
          }
        }
        return { ...m, videoUrl }
      }),
    ).then((restored) => {
      if (cancelled) return
      hydrated.current = true
      setCustomModules(restored)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    try {
      const meta: StoredModule[] = customModules.map(({ videoUrl, ...m }) => ({ ...m, hasVideo: !!videoUrl }))
      localStorage.setItem(META_KEY, JSON.stringify(meta))
    } catch {
      // storage unavailable — modules stay in memory for this session
    }
  }, [customModules])

  const addModule = useCallback(
    (module: Omit<TrainingModule, 'id' | 'createdAt'>, videoFile?: File) => {
      const next: TrainingModule = {
        ...module,
        id: `tm-${Date.now()}`,
        createdAt: new Date().toISOString(),
      }
      if (videoFile) saveVideo(next.id, videoFile).catch(() => {})
      setCustomModules((prev) => [next, ...prev])
      return next
    },
    [],
  )

  const uploadModule = useCallback(
    async (input: {
      title: string
      description: string
      videoFile: File
      questions: string[]
    }) => {
      if (isApiAuthenticated()) {
        const { module, warning } = await uploadTrainingVideoToApi({
          file: input.videoFile,
          questions: input.questions,
        })
        // Prefer HO title in the list UI when provided
        const withTitle: TrainingModule = {
          ...module,
          title: input.title.trim() || module.title,
          description: input.description.trim() || module.description,
        }
        await refreshFromApi()
        return { module: withTitle, warning }
      }
      const videoUrl = URL.createObjectURL(input.videoFile)
      const module = addModule(
        {
          title: input.title.trim(),
          description: input.description.trim(),
          videoName: input.videoFile.name,
          videoUrl,
          questions: input.questions.map((prompt, i) => ({
            id: `q-${Date.now()}-${i}`,
            prompt: prompt.trim(),
          })),
        },
        input.videoFile,
      )
      return { module }
    },
    [addModule, refreshFromApi],
  )

  const removeModule = useCallback(
    async (id: string) => {
      if (id === DEFAULT_MODULE_ID) return
      if (id.startsWith('api-')) {
        const numericId = Number(id.replace(/^api-/, ''))
        if (!Number.isFinite(numericId) || numericId < 1) return
        await deleteTrainingVideoFromApi(numericId)
        await refreshFromApi()
        return
      }
      deleteVideo(id).catch(() => {})
      setCustomModules((prev) => {
        const target = prev.find((m) => m.id === id)
        if (target?.videoUrl) URL.revokeObjectURL(target.videoUrl)
        return prev.filter((m) => m.id !== id)
      })
    },
    [refreshFromApi],
  )

  const inviteModule = useMemo(() => moduleFromInvite(inviteSnap), [inviteSnap])

  // API uploads first, then local uploads. Default fallback only when nothing else exists.
  const modules = useMemo(() => {
    const seen = new Set<string>()
    const out: TrainingModule[] = []
    const primary = [...apiModules, ...customModules]
    for (const m of primary) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      out.push(m)
    }
    if (out.length === 0) {
      out.push(DEFAULT_MODULE)
    }
    return out
  }, [apiModules, customModules])

  const activeModule = useMemo(() => {
    if (inviteModule?.videoUrl) return inviteModule
    return modules.find((m) => m.videoUrl) ?? modules[0]
  }, [inviteModule, modules])

  const value = useMemo(
    () => ({
      modules,
      activeModule,
      loading,
      refreshFromApi,
      addModule,
      uploadModule,
      removeModule,
    }),
    [modules, activeModule, loading, refreshFromApi, addModule, uploadModule, removeModule],
  )

  return (
    <TrainingContentContext.Provider value={value}>{children}</TrainingContentContext.Provider>
  )
}

export function useTrainingContent() {
  const ctx = useContext(TrainingContentContext)
  if (!ctx) throw new Error('useTrainingContent must be used within TrainingContentProvider')
  return ctx
}
