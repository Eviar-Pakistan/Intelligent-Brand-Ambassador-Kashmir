import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  initialComplaints,
  type Complaint,
  type ComplaintCategory,
  type ComplaintStatus,
} from '../data/complaints'

type SubmitComplaintInput = {
  baId: string
  baName: string
  storeId: number
  storeName: string
  city: string
  category: ComplaintCategory
  subject: string
  details: string
}

type ComplaintsContextValue = {
  complaints: Complaint[]
  submitComplaint: (input: SubmitComplaintInput) => Complaint
  updateComplaintStatus: (id: string, status: ComplaintStatus, hoNote?: string) => void
}

const ComplaintsContext = createContext<ComplaintsContextValue | null>(null)

export function ComplaintsProvider({ children }: { children: ReactNode }) {
  const [complaints, setComplaints] = useState<Complaint[]>(initialComplaints)

  const submitComplaint = useCallback((input: SubmitComplaintInput) => {
    const now = new Date().toISOString()
    let created!: Complaint
    setComplaints((prev) => {
      created = {
        id: `cmp-${1000 + prev.length + 1}`,
        ...input,
        status: 'Open',
        createdAt: now,
        updatedAt: now,
      }
      return [created, ...prev]
    })
    return created
  }, [])

  const updateComplaintStatus = useCallback(
    (id: string, status: ComplaintStatus, hoNote?: string) => {
      const now = new Date().toISOString()
      setComplaints((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status,
                updatedAt: now,
                ...(hoNote !== undefined ? { hoNote } : {}),
              }
            : c,
        ),
      )
    },
    [],
  )

  const value = useMemo(
    () => ({ complaints, submitComplaint, updateComplaintStatus }),
    [complaints, submitComplaint, updateComplaintStatus],
  )

  return <ComplaintsContext.Provider value={value}>{children}</ComplaintsContext.Provider>
}

export function useComplaints() {
  const ctx = useContext(ComplaintsContext)
  if (!ctx) throw new Error('useComplaints must be used within ComplaintsProvider')
  return ctx
}
