export type ComplaintStatus = 'Open' | 'In Review' | 'Resolved' | 'Rejected'

export type ComplaintKind = 'customer' | 'ba' | 'insights'

export type ComplaintCategory =
  | 'Store facilities'
  | 'Product stock'
  | 'Staff / management'
  | 'Safety / security'
  | 'Schedule / deployment'
  | 'Other'

export type ProductComplaintCategory = 'Cooking Oil' | 'Banaspati Ghee'

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
  'Cooking Oil',
  'Banaspati Ghee',
]

export const complaintBrands = ['Kashmir'] as const

export const initialComplaints: Complaint[] = [
  {
    id: 'cmp-1001',
    kind: 'ba',
    baId: 'hamza',
    baName: 'Hamza Ali',
    storeId: 7,
    storeName: 'Imtiaz Clifton',
    city: 'Karachi',
    category: 'Product stock',
    subject: 'Cooking Oil 1 LTR pouch out of stock on shelf',
    details:
      'Shelf bay for Kashmir Cooking Oil 1 LTR pouches has been empty since morning. Asked store staff twice; they said refill expected tomorrow. Sampling impacted.',
    status: 'Resolved',
    createdAt: '2026-09-14T09:20:00',
    updatedAt: '2026-09-14T09:20:00',
    hoNote: 'Stock replenished same day.',
  },
  {
    id: 'cmp-1002',
    kind: 'ba',
    baId: 'sara',
    baName: 'Sara Ahmed',
    storeId: 19,
    storeName: 'Al-Fatah Blue Area',
    city: 'Islamabad',
    category: 'Store facilities',
    subject: 'Demo counter space removed without notice',
    details:
      'Our branded demo counter was moved behind the aisle. No alternate space provided. Hard to intercept shoppers.',
    status: 'In Review',
    createdAt: '2026-09-13T14:05:00',
    updatedAt: '2026-09-14T08:10:00',
    hoNote: 'Coordinating with store manager for repositioning.',
  },
  {
    id: 'cmp-1003',
    kind: 'ba',
    baId: 'fatima',
    baName: 'Fatima Noor',
    storeId: 4,
    storeName: 'Metro Lahore',
    city: 'Lahore',
    category: 'Schedule / deployment',
    subject: 'Shift clash with store peak hours',
    details:
      'Assigned shift ends at 4 PM but peak footfall starts at 6 PM. Requesting evening slot for better conversion.',
    status: 'Resolved',
    createdAt: '2026-09-11T11:40:00',
    updatedAt: '2026-09-12T16:30:00',
    hoNote: 'Shift updated to 2–8 PM effective next roster.',
  },
  {
    id: 'cmp-1004',
    kind: 'ba',
    baId: 'bilal',
    baName: 'Bilal Ahmed',
    storeId: 7,
    storeName: 'Imtiaz Clifton',
    city: 'Karachi',
    category: 'Safety / security',
    subject: 'Wet floor near demo area',
    details:
      'Leak near the demo spot creates slip risk. Reported to store staff; still not cleaned after 40 minutes.',
    status: 'Open',
    createdAt: '2026-09-14T16:15:00',
    updatedAt: '2026-09-14T16:15:00',
  },
  {
    id: 'cmp-1005',
    kind: 'customer',
    baId: 'ayesha',
    baName: 'Ayesha Khan',
    storeId: 12,
    storeName: 'Carrefour DHA',
    city: 'Lahore',
    category: 'Product stock',
    productCategory: 'Cooking Oil',
    brand: 'Kashmir',
    sku: 'Pouch 1LTR',
    customerName: 'Nadia Rahman',
    customerPhone: '03001234567',
    subject: 'Cooking Oil · Pouch 1LTR',
    details:
      'Seal was already open and the oil smelled off. Customer asked for a replacement pack.',
    status: 'Open',
    createdAt: '2026-09-15T11:05:00',
    updatedAt: '2026-09-15T11:05:00',
  },
  {
    id: 'cmp-1006',
    kind: 'customer',
    baId: 'ayesha',
    baName: 'Ayesha Khan',
    storeId: 12,
    storeName: 'Carrefour DHA',
    city: 'Lahore',
    category: 'Product stock',
    productCategory: 'Banaspati Ghee',
    brand: 'Kashmir',
    sku: 'BKT 5KG',
    customerName: 'Imran Qureshi',
    customerPhone: '03219876543',
    subject: 'Banaspati Ghee · BKT 5KG',
    details: 'Bucket lid was dented and partially loose on the shelf. Customer refused to buy.',
    status: 'In Review',
    createdAt: '2026-09-15T12:40:00',
    updatedAt: '2026-09-15T13:10:00',
    hoNote: 'Checking warehouse batch for packaging issues.',
  },
  {
    id: 'cmp-1007',
    kind: 'insights',
    baId: 'sara',
    baName: 'Sara Ahmed',
    storeId: 19,
    storeName: 'Al-Fatah Blue Area',
    city: 'Islamabad',
    category: 'Other',
    subject: 'Shoppers prefer smaller oil pouches at this store',
    details:
      'Most interceptions ask for 1 LTR pouches. 3 LTR and 4.5 LTR bottles move slowly. Recommend more 1 LTR allocation for next week.',
    status: 'Open',
    createdAt: '2026-09-15T15:20:00',
    updatedAt: '2026-09-15T15:20:00',
  },
  {
    id: 'cmp-1008',
    kind: 'insights',
    baId: 'hamza',
    baName: 'Hamza Ali',
    storeId: 7,
    storeName: 'Imtiaz Clifton',
    city: 'Karachi',
    category: 'Other',
    subject: 'Competitor price gap on 5 KG ghee',
    details:
      'Dalda 5 KG is Rs. 80 cheaper this week. Several productive calls dropped at price comparison. Flagging for trade marketing.',
    status: 'In Review',
    createdAt: '2026-09-14T18:00:00',
    updatedAt: '2026-09-15T09:00:00',
  },
]

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
