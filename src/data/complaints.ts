export type ComplaintStatus = 'Open' | 'In Review' | 'Resolved' | 'Rejected'

export type ComplaintCategory =
  | 'Store facilities'
  | 'Product stock'
  | 'Staff / management'
  | 'Safety / security'
  | 'Schedule / deployment'
  | 'Other'

export type Complaint = {
  id: string
  baId: string
  baName: string
  storeId: number
  storeName: string
  city: string
  category: ComplaintCategory
  subject: string
  details: string
  status: ComplaintStatus
  createdAt: string
  updatedAt: string
  hoNote?: string
}

export const complaintCategories: ComplaintCategory[] = [
  'Store facilities',
  'Product stock',
  'Staff / management',
  'Safety / security',
  'Schedule / deployment',
  'Other',
]

export const initialComplaints: Complaint[] = [
  {
    id: 'cmp-1001',
    baId: 'hamza',
    baName: 'Hamza Ali',
    storeId: 7,
    storeName: 'Imtiaz Clifton',
    city: 'Karachi',
    category: 'Product stock',
    subject: 'Cooking Oil 1 LTR pouch out of stock on shelf',
    details:
      'Shelf bay for Kashmir Cooking Oil 1 LTR pouches has been empty since morning. Asked store staff twice; they said refill expected tomorrow. Sampling impacted.',
    status: 'Open',
    createdAt: '2026-09-14T09:20:00',
    updatedAt: '2026-09-14T09:20:00',
  },
  {
    id: 'cmp-1002',
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
