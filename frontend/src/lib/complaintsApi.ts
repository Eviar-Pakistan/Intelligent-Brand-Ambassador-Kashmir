/**
 * API helpers for HO complaint / insights inbox and BA field reports.
 */

import { apiRequest, isApiAuthenticated } from './api'
import type {
  Complaint,
  ComplaintCategory,
  ComplaintKind,
  ComplaintStatus,
  ProductComplaintCategory,
} from '../data/complaints'

export type ApiComplaint = Complaint & { imageUrl?: string | null }

export type SubmitComplaintPayload = {
  token: string
  kind: ComplaintKind
  storeId: number
  category?: ComplaintCategory | string
  subject?: string
  details: string
  productCategory?: ProductComplaintCategory | string
  brand?: string
  sku?: string
  customerName?: string
  customerPhone?: string
  image?: File | null
}

export async function fetchComplaints(params?: {
  kind?: ComplaintKind | 'All'
  status?: ComplaintStatus | 'All'
}): Promise<ApiComplaint[]> {
  if (!isApiAuthenticated()) return []
  const qs = new URLSearchParams()
  if (params?.kind && params.kind !== 'All') qs.set('kind', params.kind)
  if (params?.status && params.status !== 'All') qs.set('status', params.status)
  const suffix = qs.toString() ? `?${qs}` : ''
  const data = await apiRequest<ApiComplaint[] | { results: ApiComplaint[] }>(
    `/api/ambassador-complaints/${suffix}`,
  )
  if (Array.isArray(data)) return data
  return data.results ?? []
}

export async function updateComplaintStatusApi(
  id: string,
  status: ComplaintStatus,
  hoNote?: string,
): Promise<ApiComplaint> {
  // FE id is cmp-123 — strip prefix for DRF pk
  const pk = String(id).replace(/^cmp-/i, '')
  return apiRequest<ApiComplaint>(`/api/ambassador-complaints/${pk}/`, {
    method: 'PATCH',
    body: {
      status,
      ...(hoNote !== undefined ? { hoNote } : {}),
    },
  })
}

export async function submitBaComplaintApi(payload: SubmitComplaintPayload): Promise<ApiComplaint> {
  const form = new FormData()
  form.append('token', payload.token)
  form.append('kind', payload.kind)
  form.append('store_id', String(payload.storeId))
  form.append('details', payload.details)
  if (payload.category) form.append('category', payload.category)
  if (payload.subject) form.append('subject', payload.subject)
  if (payload.productCategory) form.append('product_category', payload.productCategory)
  if (payload.brand) form.append('brand', payload.brand)
  if (payload.sku) form.append('sku', payload.sku)
  if (payload.customerName) form.append('customer_name', payload.customerName)
  if (payload.customerPhone) form.append('customer_phone', payload.customerPhone)
  if (payload.image) form.append('image', payload.image)

  return apiRequest<ApiComplaint>('/api/ba/complaints/', {
    method: 'POST',
    formData: form,
    auth: false,
  })
}
