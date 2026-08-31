export const campaign = {
  id: 'kashmir-oil',
  name: 'Kashmir Cooking Oil — Engagement & Conversion',
  brand: 'Kashmir Cooking Oil',
  status: 'LIVE' as const,
  start: '01 Aug 2026',
  end: '30 Sep 2026',
  progress: 82,
}

export const campaigns = [
  campaign,
  {
    id: 'premium-tea',
    name: 'Premium Tea Push',
    brand: 'Valley Leaf',
    status: 'PLANNING' as const,
    start: '15 Sep 2026',
    end: '15 Oct 2026',
    progress: 22,
  },
  {
    id: 'spice-blend',
    name: 'Heritage Spices',
    brand: 'Masala Co',
    status: 'COMPLETED' as const,
    start: '01 May 2026',
    end: '30 Jun 2026',
    progress: 100,
  },
]

export const engagementSeries = [
  { day: 'Mon', engagement: 820, conversion: 28 },
  { day: 'Tue', engagement: 940, conversion: 31 },
  { day: 'Wed', engagement: 1100, conversion: 33 },
  { day: 'Thu', engagement: 980, conversion: 30 },
  { day: 'Fri', engagement: 1280, conversion: 36 },
  { day: 'Sat', engagement: 1520, conversion: 39 },
  { day: 'Sun', engagement: 1410, conversion: 37 },
]

export const cities = [
  { city: 'Lahore', stores: 8, shoppers: 5240 },
  { city: 'Karachi', stores: 7, shoppers: 4110 },
  { city: 'Islamabad', stores: 5, shoppers: 2890 },
  { city: 'Rawalpindi', stores: 4, shoppers: 602 },
]

export const consumerInsights = {
  preferredOil: [
    { name: 'Kashmir', value: 42 },
    { name: 'Dalda', value: 31 },
    { name: 'Sufi', value: 18 },
    { name: 'Others', value: 9 },
  ],
  familySize: [
    { name: '1–2', value: 18 },
    { name: '3–4', value: 44 },
    { name: '5–6', value: 26 },
    { name: '7+', value: 12 },
  ],
  purchaseFrequency: [
    { name: 'Weekly', value: 28 },
    { name: 'Bi-weekly', value: 41 },
    { name: 'Monthly', value: 31 },
  ],
  priceSensitivity: [
    { name: 'High', value: 22 },
    { name: 'Medium', value: 51 },
    { name: 'Low', value: 27 },
  ],
  healthPreference: [
    { name: 'Heart health', value: 38 },
    { name: 'Taste first', value: 27 },
    { name: 'Price first', value: 21 },
    { name: 'Brand loyalty', value: 14 },
  ],
}

export const shopperIntel = {
  footfall: '48.2k',
  engagementRate: '68.4%',
  purchaseIntent: '44.1%',
  conversionRate: '31.7%',
}

export const operations = {
  activeBas: 41,
  gpsOnline: 38,
  attendance: '94%',
  storeCoverage: '87%',
}

export const storeRanking = [
  { id: 12, name: 'Carrefour DHA', city: 'Lahore', score: 96, conversion: 34 },
  { id: 7, name: 'Imtiaz Clifton', city: 'Karachi', score: 91, conversion: 32 },
  { id: 4, name: 'Metro Lahore', city: 'Lahore', score: 88, conversion: 30 },
  { id: 19, name: 'Al-Fatah Blue Area', city: 'Islamabad', score: 84, conversion: 29 },
]

export const baRanking = [
  { id: 'ayesha', name: 'Ayesha Khan', points: 1240, conversion: 34, city: 'Lahore' },
  { id: 'sara', name: 'Sara Ahmed', points: 1180, conversion: 33, city: 'Islamabad' },
  { id: 'hamza', name: 'Hamza Ali', points: 1050, conversion: 31, city: 'Karachi' },
  { id: 'fatima', name: 'Fatima Noor', points: 980, conversion: 30, city: 'Faisalabad' },
  { id: 'bilal', name: 'Bilal Ahmed', points: 920, conversion: 28, city: 'Karachi' },
]

export const aiRecommendations = [
  {
    id: 1,
    pattern: 'High Engagement / Low Conversion',
    store: 'Store #12 — Lahore',
    engagement: 78,
    conversion: 19,
    action: 'Retrain BA on objection handling and reinforce health comparison script.',
    severity: 'high' as const,
  },
  {
    id: 2,
    pattern: 'High Sales / Low Traffic',
    store: 'Store #07 — Karachi',
    engagement: 52,
    conversion: 41,
    action: 'Increase sampling during weekend peak hours (6–9 PM).',
    severity: 'medium' as const,
  },
  {
    id: 3,
    pattern: 'SKU Opportunity',
    store: 'Campaign-wide',
    engagement: 68,
    conversion: 32,
    action: 'Promote 1L variant — highest intent among family-size households.',
    severity: 'medium' as const,
  },
]

export const mapPins = [
  { x: 28, y: 42, level: 'high' as const, label: '#12 Lahore' },
  { x: 18, y: 68, level: 'high' as const, label: '#7 Karachi' },
  { x: 36, y: 28, level: 'medium' as const, label: '#19 Islamabad' },
  { x: 42, y: 48, level: 'medium' as const, label: '#4 Faisalabad' },
  { x: 48, y: 58, level: 'low' as const, label: '#23 Multan' },
  { x: 22, y: 22, level: 'medium' as const, label: '#31 Peshawar' },
]

export type LifecycleStage =
  | 'Recruited'
  | 'AI Screened'
  | 'Certified'
  | 'Trained'
  | 'Deployed'
  | 'Live'

export const ambassadors = [
  {
    id: 'ayesha',
    name: 'Ayesha Khan',
    city: 'Lahore',
    certification: 'A+',
    status: 'Certified' as const,
    deployed: true,
    storeId: 12,
    store: 'Store #12 — Carrefour DHA',
    score: 92,
    readiness: 94,
    points: 1240,
    experience: '2 yrs',
    scores: { product: 96, communication: 91, selling: 94, objection: 89, interaction: 95 },
    lifecycle: ['Recruited', 'AI Screened', 'Certified', 'Trained', 'Deployed', 'Live'] as LifecycleStage[],
    today: { interactions: 47, conversions: 16, rate: 34 },
  },
  {
    id: 'hamza',
    name: 'Hamza Ali',
    city: 'Karachi',
    certification: 'A',
    status: 'Training' as const,
    deployed: false,
    storeId: null,
    store: '—',
    score: 87,
    readiness: 78,
    points: 1050,
    experience: '1.5 yrs',
    scores: { product: 86, communication: 85, selling: 84, objection: 82, interaction: 88 },
    lifecycle: ['Recruited', 'AI Screened', 'Certified', 'Trained'] as LifecycleStage[],
    today: { interactions: 0, conversions: 0, rate: 0 },
  },
  {
    id: 'sara',
    name: 'Sara Ahmed',
    city: 'Islamabad',
    certification: 'A+',
    status: 'Deployed' as const,
    deployed: true,
    storeId: 19,
    store: 'Store #19 — Al-Fatah',
    score: 95,
    readiness: 96,
    points: 1180,
    experience: '3 yrs',
    scores: { product: 97, communication: 94, selling: 93, objection: 92, interaction: 96 },
    lifecycle: ['Recruited', 'AI Screened', 'Certified', 'Trained', 'Deployed', 'Live'] as LifecycleStage[],
    today: { interactions: 39, conversions: 14, rate: 36 },
  },
  {
    id: 'fatima',
    name: 'Fatima Noor',
    city: 'Faisalabad',
    certification: 'A+',
    status: 'Certified' as const,
    deployed: true,
    storeId: 4,
    store: 'Store #4 — Metro',
    score: 93,
    readiness: 95,
    points: 980,
    experience: '3 yrs',
    scores: { product: 95, communication: 92, selling: 91, objection: 94, interaction: 90 },
    lifecycle: ['Recruited', 'AI Screened', 'Certified', 'Trained', 'Deployed', 'Live'] as LifecycleStage[],
    today: { interactions: 28, conversions: 9, rate: 32 },
  },
  {
    id: 'bilal',
    name: 'Bilal Ahmed',
    city: 'Karachi',
    certification: 'B+',
    status: 'Pending' as const,
    deployed: false,
    storeId: null,
    store: '—',
    score: 79,
    readiness: 64,
    points: 420,
    experience: '8 mo',
    scores: { product: 81, communication: 77, selling: 80, objection: 74, interaction: 82 },
    lifecycle: ['Recruited', 'AI Screened'] as LifecycleStage[],
    today: { interactions: 0, conversions: 0, rate: 0 },
  },
]

export const candidates = [
  {
    id: 'c-ayesha',
    name: 'Ayesha Khan',
    city: 'Lahore',
    knowledge: 92,
    communication: 91,
    selling: 94,
    objection: 89,
    interaction: 95,
    score: 92,
    status: 'Certified' as const,
    recommendation:
      'Candidate demonstrates strong product knowledge and excellent customer interaction skills.',
  },
  {
    id: 'c-hamza',
    name: 'Hamza Ali',
    city: 'Karachi',
    knowledge: 81,
    communication: 85,
    selling: 79,
    objection: 80,
    interaction: 84,
    score: 82,
    status: 'Training' as const,
    recommendation: 'Solid communicator; strengthen selling confidence before floor deployment.',
  },
  {
    id: 'c-sara',
    name: 'Sara Ahmed',
    city: 'Islamabad',
    knowledge: 96,
    communication: 94,
    selling: 92,
    objection: 93,
    interaction: 95,
    score: 94,
    status: 'Certified' as const,
    recommendation: 'Top-tier candidate. Ready for priority store deployment.',
  },
  {
    id: 'c-omar',
    name: 'Omar Sheikh',
    city: 'Lahore',
    knowledge: 74,
    communication: 70,
    selling: 68,
    objection: 65,
    interaction: 72,
    score: 70,
    status: 'Assessed' as const,
    recommendation: 'Below certification threshold. Recommend additional product coaching.',
  },
  {
    id: 'c-nina',
    name: 'Nina Raza',
    city: 'Multan',
    knowledge: 0,
    communication: 0,
    selling: 0,
    objection: 0,
    interaction: 0,
    score: 0,
    status: 'Pending' as const,
    recommendation: 'Awaiting AI assessment session.',
  },
  {
    id: 'c-zain',
    name: 'Zain Malik',
    city: 'Rawalpindi',
    knowledge: 58,
    communication: 62,
    selling: 55,
    objection: 50,
    interaction: 60,
    score: 57,
    status: 'Rejected' as const,
    recommendation: 'Does not meet minimum certification thresholds.',
  },
]

export const stores = [
  {
    id: 12,
    name: 'Carrefour DHA',
    city: 'Lahore',
    footfall: 'High' as const,
    bas: 3,
    coverage: 96,
    status: 'LIVE' as const,
    todayFootfall: 2340,
    engagement: 71,
    conversion: 34,
    peak: ['12 PM — 3 PM', '6 PM — 9 PM'],
    assigned: [
      { id: 'ayesha', name: 'Ayesha Khan', state: 'Active' as const },
      { id: 'hamza', name: 'Hamza Ali', state: 'Active' as const },
      { id: 'sara', name: 'Sara Ahmed', state: 'Break' as const },
    ],
    qrCode: 'KO-STORE-12-LAH',
  },
  {
    id: 7,
    name: 'Imtiaz Clifton',
    city: 'Karachi',
    footfall: 'Medium' as const,
    bas: 2,
    coverage: 82,
    status: 'LIVE' as const,
    todayFootfall: 1810,
    engagement: 64,
    conversion: 32,
    peak: ['5 PM — 9 PM'],
    assigned: [
      { id: 'bilal', name: 'Bilal Ahmed', state: 'Active' as const },
      { id: 'fatima', name: 'Fatima Noor', state: 'Offline' as const },
    ],
    qrCode: 'KO-STORE-07-KHI',
  },
  {
    id: 4,
    name: 'Metro Lahore',
    city: 'Lahore',
    footfall: 'High' as const,
    bas: 4,
    coverage: 91,
    status: 'LIVE' as const,
    todayFootfall: 2100,
    engagement: 69,
    conversion: 30,
    peak: ['11 AM — 2 PM', '6 PM — 9 PM'],
    assigned: [{ id: 'fatima', name: 'Fatima Noor', state: 'Active' as const }],
    qrCode: 'KO-STORE-04-LHR',
  },
  {
    id: 19,
    name: 'Al-Fatah Blue Area',
    city: 'Islamabad',
    footfall: 'Medium' as const,
    bas: 2,
    coverage: 76,
    status: 'PARTIAL' as const,
    todayFootfall: 980,
    engagement: 58,
    conversion: 29,
    peak: ['1 PM — 4 PM', '7 PM — 9 PM'],
    assigned: [{ id: 'sara', name: 'Sara Ahmed', state: 'Active' as const }],
    qrCode: 'KO-STORE-19-ISB',
  },
  {
    id: 23,
    name: 'Hyperstar Multan',
    city: 'Multan',
    footfall: 'Low' as const,
    bas: 1,
    coverage: 41,
    status: 'NEEDS BA' as const,
    todayFootfall: 420,
    engagement: 40,
    conversion: 18,
    peak: ['6 PM — 8 PM'],
    assigned: [],
    qrCode: 'KO-STORE-23-MUL',
  },
]

export type ShiftSlot = {
  id: string
  day: string
  date: string
  storeId: number
  storeName: string
  city: string
  shift: string
  peakRecommended: boolean
  baId: string | null
  baName: string | null
  status: 'Scheduled' | 'Open' | 'Conflict'
}

/** Week of 24–30 Aug 2026 — mock deployment schedule */
export const scheduleDays = [
  { key: 'Mon', label: 'Mon', date: '24 Aug' },
  { key: 'Tue', label: 'Tue', date: '25 Aug' },
  { key: 'Wed', label: 'Wed', date: '26 Aug' },
  { key: 'Thu', label: 'Thu', date: '27 Aug' },
  { key: 'Fri', label: 'Fri', date: '28 Aug' },
  { key: 'Sat', label: 'Sat', date: '29 Aug' },
  { key: 'Sun', label: 'Sun', date: '30 Aug' },
]

export const shiftOptions = [
  '10:00 AM – 2:00 PM',
  '12:00 PM – 3:00 PM',
  '2:00 PM – 6:00 PM',
  '5:00 PM – 9:00 PM',
  '6:00 PM – 9:00 PM',
]

export const initialSchedule: ShiftSlot[] = [
  {
    id: 's1',
    day: 'Mon',
    date: '24 Aug',
    storeId: 12,
    storeName: 'Carrefour DHA',
    city: 'Lahore',
    shift: '12:00 PM – 3:00 PM',
    peakRecommended: true,
    baId: 'ayesha',
    baName: 'Ayesha Khan',
    status: 'Scheduled',
  },
  {
    id: 's2',
    day: 'Mon',
    date: '24 Aug',
    storeId: 12,
    storeName: 'Carrefour DHA',
    city: 'Lahore',
    shift: '6:00 PM – 9:00 PM',
    peakRecommended: true,
    baId: 'ayesha',
    baName: 'Ayesha Khan',
    status: 'Scheduled',
  },
  {
    id: 's3',
    day: 'Mon',
    date: '24 Aug',
    storeId: 4,
    storeName: 'Metro Lahore',
    city: 'Lahore',
    shift: '11:00 AM – 2:00 PM',
    peakRecommended: true,
    baId: 'fatima',
    baName: 'Fatima Noor',
    status: 'Scheduled',
  },
  {
    id: 's4',
    day: 'Tue',
    date: '25 Aug',
    storeId: 7,
    storeName: 'Imtiaz Clifton',
    city: 'Karachi',
    shift: '5:00 PM – 9:00 PM',
    peakRecommended: true,
    baId: null,
    baName: null,
    status: 'Open',
  },
  {
    id: 's5',
    day: 'Wed',
    date: '26 Aug',
    storeId: 19,
    storeName: 'Al-Fatah Blue Area',
    city: 'Islamabad',
    shift: '1:00 PM – 4:00 PM',
    peakRecommended: true,
    baId: 'sara',
    baName: 'Sara Ahmed',
    status: 'Scheduled',
  },
  {
    id: 's6',
    day: 'Thu',
    date: '27 Aug',
    storeId: 23,
    storeName: 'Hyperstar Multan',
    city: 'Multan',
    shift: '6:00 PM – 8:00 PM',
    peakRecommended: true,
    baId: null,
    baName: null,
    status: 'Open',
  },
  {
    id: 's7',
    day: 'Fri',
    date: '28 Aug',
    storeId: 12,
    storeName: 'Carrefour DHA',
    city: 'Lahore',
    shift: '6:00 PM – 9:00 PM',
    peakRecommended: true,
    baId: null,
    baName: null,
    status: 'Open',
  },
  {
    id: 's8',
    day: 'Sat',
    date: '29 Aug',
    storeId: 12,
    storeName: 'Carrefour DHA',
    city: 'Lahore',
    shift: '12:00 PM – 3:00 PM',
    peakRecommended: true,
    baId: 'ayesha',
    baName: 'Ayesha Khan',
    status: 'Scheduled',
  },
  {
    id: 's9',
    day: 'Sat',
    date: '29 Aug',
    storeId: 4,
    storeName: 'Metro Lahore',
    city: 'Lahore',
    shift: '6:00 PM – 9:00 PM',
    peakRecommended: true,
    baId: null,
    baName: null,
    status: 'Open',
  },
  {
    id: 's10',
    day: 'Sun',
    date: '30 Aug',
    storeId: 7,
    storeName: 'Imtiaz Clifton',
    city: 'Karachi',
    shift: '5:00 PM – 9:00 PM',
    peakRecommended: true,
    baId: null,
    baName: null,
    status: 'Open',
  },
]

export const faqs = [
  { q: 'Is Kashmir Cooking Oil healthy?', count: 842 },
  { q: 'Why switch from Dalda?', count: 631 },
  { q: 'Best size for family of 5?', count: 418 },
  { q: 'Good for frying?', count: 390 },
]

export const trainingScenarios = [
  {
    id: 4,
    total: 10,
    prompt: 'Why should I switch from Dalda?',
    model:
      'Lead with respect for habit, then compare health profile, cooking performance, and close with a soft 1L trial ask.',
  },
]

export const settingsSections = [
  'General',
  'Certification Rules',
  'Training Scenarios',
  'AI Knowledge',
  'Rewards',
  'Stores',
  'QR Configuration',
  'Users & Roles',
  'Report Templates',
]
