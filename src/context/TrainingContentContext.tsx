import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

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
  addModule: (module: Omit<TrainingModule, 'id' | 'createdAt'>) => TrainingModule
  removeModule: (id: string) => void
}

const TrainingContentContext = createContext<TrainingContentContextValue | null>(null)

const seedModules: TrainingModule[] = [
  {
    id: 'tm-seed-1',
    title: 'Kashmir product knowledge',
    description: 'Core talking points for cooking oil benefits and objections.',
    videoName: 'kashmir-product-intro.mp4',
    videoUrl: '',
    questions: [
      {
        id: 'q1',
        prompt: 'What is the primary health benefit to highlight first?',
      },
      {
        id: 'q2',
        prompt: 'When a shopper says they always buy Dalda, how should you respond?',
      },
    ],
    createdAt: new Date().toISOString(),
  },
]

export function TrainingContentProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<TrainingModule[]>(seedModules)

  const addModule = useCallback((module: Omit<TrainingModule, 'id' | 'createdAt'>) => {
    const next: TrainingModule = {
      ...module,
      id: `tm-${Date.now()}`,
      createdAt: new Date().toISOString(),
    }
    setModules((prev) => [next, ...prev])
    return next
  }, [])

  const removeModule = useCallback((id: string) => {
    setModules((prev) => {
      const target = prev.find((m) => m.id === id)
      if (target?.videoUrl) URL.revokeObjectURL(target.videoUrl)
      return prev.filter((m) => m.id !== id)
    })
  }, [])

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
