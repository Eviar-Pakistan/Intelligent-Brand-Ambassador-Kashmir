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
  addModule: (
    module: Omit<TrainingModule, 'id' | 'createdAt'>,
    videoFile?: File,
  ) => TrainingModule
  removeModule: (id: string) => void
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

export function TrainingContentProvider({ children }: { children: ReactNode }) {
  // Only Head-Office-uploaded modules live here; the default module is appended below.
  const [customModules, setCustomModules] = useState<TrainingModule[]>([])
  const hydrated = useRef(false)

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

  const removeModule = useCallback((id: string) => {
    // the default module isn't in customModules, so this can never remove it
    deleteVideo(id).catch(() => {})
    setCustomModules((prev) => {
      const target = prev.find((m) => m.id === id)
      if (target?.videoUrl) URL.revokeObjectURL(target.videoUrl)
      return prev.filter((m) => m.id !== id)
    })
  }, [])

  // Newest upload first, so it's what `modules.find((m) => m.videoUrl)` picks; the default
  // module is always last, so it's the fallback whenever nothing has been uploaded yet.
  const modules = useMemo(() => [...customModules, DEFAULT_MODULE], [customModules])

  const value = useMemo(
    () => ({ modules, addModule, removeModule }),
    [modules, addModule, removeModule],
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
