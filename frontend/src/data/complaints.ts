export type ComplaintStatus = 'Open' | 'In Review' | 'Resolved' | 'Rejected'

export type ComplaintKind = 'customer' | 'ba' | 'insights'

export type ComplaintCategory =
  | 'Store facilities'
  | 'Product stock'
  | 'Staff / management'
  | 'Safety / security'
  | 'Schedule / deployment'
  | 'Other'

export type ProductComplaintCategory =
  | 'Kashmir Cooking Oil'
  | 'Kashmir Banaspati'
  | 'Waadi Banaspati'

export type Complaint = {
  id: string
  kind: ComplaintKind
  baId: string
  baName: string
  storeId: number
  storeName: string
  city: string
  /** BA issue category, or "Product stock" for customer product complaints */
  category: ComplaintCategory
  subject: string
  details: string
  status: ComplaintStatus
  createdAt: string
  updatedAt: string
  hoNote?: string
  /** Customer product complaint fields */
  productCategory?: ProductComplaintCategory
  brand?: string
  sku?: string
  customerName?: string
  customerPhone?: string
  imageName?: string
}

export const complaintCategories: ComplaintCategory[] = [
  'Store facilities',
  'Product stock',
  'Staff / management',
  'Safety / security',
  'Schedule / deployment',
  'Other',
]

export const productComplaintCategories: ProductComplaintCategory[] = [
  'Kashmir Cooking Oil',
  'Kashmir Banaspati',
  'Waadi Banaspati',
]

export const complaintBrands = ['Kashmir', 'Waadi'] as const

export function formatComplaintDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function kindLabel(kind: ComplaintKind) {
  if (kind === 'customer') return 'Customer'
  if (kind === 'insights') return 'Insights'
  return 'BA'
}
