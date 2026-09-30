import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  type Complaint,
  type ComplaintCategory,
  type ComplaintKind,
  type ComplaintStatus,
  type ProductComplaintCategory,
} from '../data/complaints'
import { isApiAuthenticated } from '../lib/api'
import {
  fetchComplaints,
  submitBaComplaintApi,
  updateComplaintStatusApi,
} from '../lib/complaintsApi'

export type SubmitComplaintInput = {
  kind: ComplaintKind
  baId: string
  baName: string
  storeId: number
  storeName: string
  city: string
  category: ComplaintCategory
  subject: string
  details: string
  productCategory?: ProductComplaintCategory
  brand?: string
  sku?: string
  customerName?: string
  customerPhone?: string
  imageName?: string
  imageFile?: File | null
  /** BA invite token — required when posting to API */
  token?: string
}

type ComplaintsContextValue = {
  complaints: Complaint[]
  loading: boolean
  refreshComplaints: () => Promise<void>
  submitComplaint: (input: SubmitComplaintInput) => Promise<Complaint>
  updateComplaintStatus: (id: string, status: ComplaintStatus, hoNote?: string) => Promise<void>
}

const ComplaintsContext = createContext<ComplaintsContextValue | null>(null)

export function ComplaintsProvider({ children }: { children: ReactNode }) {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(false)

  const refreshComplaints = useCallback(async () => {
    if (!isApiAuthenticated()) {
      setComplaints([])
      return
    }
    setLoading(true)
    try {
      const list = await fetchComplaints()
      setComplaints(list)
    } catch {
      // Keep last known list on network error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshComplaints()
  }, [refreshComplaints])

  const submitComplaint = useCallback(async (input: SubmitComplaintInput) => {
    if (input.token) {
      const created = await submitBaComplaintApi({
        token: input.token,
        kind: input.kind,
        storeId: input.storeId,
        category: input.category,
        subject: input.subject,
        details: input.details,
        productCategory: input.productCategory,
        brand: input.brand,
        sku: input.sku,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        image: input.imageFile ?? null,
      })
      setComplaints((prev) => [created, ...prev.filter((c) => c.id !== created.id)])
      return created
    }

    // Offline / demo fallback
    const now = new Date().toISOString()
    const created: Complaint = {
      id: `cmp-${Date.now()}`,
      kind: input.kind,
      baId: input.baId,
      baName: input.baName,
      storeId: input.storeId,
      storeName: input.storeName,
      city: input.city,
      category: input.category,
      subject: input.subject,
      details: input.details,
      status: 'Open',
      createdAt: now,
      updatedAt: now,
      productCategory: input.productCategory,
      brand: input.brand,
      sku: input.sku,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      imageName: input.imageName,
    }
    setComplaints((prev) => [created, ...prev])
    return created
  }, [])

  const updateComplaintStatus = useCallback(
    async (id: string, status: ComplaintStatus, hoNote?: string) => {
      if (isApiAuthenticated()) {
        try {
          const updated = await updateComplaintStatusApi(id, status, hoNote)
          setComplaints((prev) => prev.map((c) => (c.id === id || c.id === updated.id ? updated : c)))
          return
        } catch (err) {
          throw err
        }
      }
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
    () => ({
      complaints,
      loading,
      refreshComplaints,
      submitComplaint,
      updateComplaintStatus,
    }),
    [complaints, loading, refreshComplaints, submitComplaint, updateComplaintStatus],
  )

  return <ComplaintsContext.Provider value={value}>{children}</ComplaintsContext.Provider>
}

export function useComplaints() {
  const ctx = useContext(ComplaintsContext)
  if (!ctx) throw new Error('useComplaints must be used within ComplaintsProvider')
  return ctx
}
