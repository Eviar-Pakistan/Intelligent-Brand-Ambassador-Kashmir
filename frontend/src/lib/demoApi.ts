/**
 * In-memory API fixtures for Head Office demo mode (no network).
 */

import {
  demoBrandTargetVsSalesForFilters,
  demoCategorySalesForFilters,
  demoTargetVsSalesForFilters,
  demoTopSkusForFilters,
  demoTopStoresForFilters,
} from '../data/baPerformance'
import { ambassadors, baRanking, engagementSeries, stores as mockStoreSeed } from '../data/mock'
import type { BaPerformanceDashboard } from './baPerformanceApi'

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function monthYm() {
  return todayYmd().slice(0, 7)
}

function pathOnly(path: string) {
  return path.split('?')[0]
}

function demoStoresPayload() {
  const seed = [
    {
      id: 12,
      code: 'DEMO012',
      name: 'Carrefour DHA',
      city: 'Lahore',
      address: 'DHA Phase 5, Lahore',
      footfall: 'High',
      peak_hours: '5 PM — 9 PM',
      status: 'LIVE',
      coverage: 92,
      bas: 1,
      today_footfall: 420,
      engagement: 68,
      conversion: 34,
      latitude: 31.47,
      longitude: 74.41,
      qr_slug: 'demo-carrefour-dha',
      assigned: [{ id: 101, name: 'Ayesha Khan', code: 'BA-101', state: 'Active' }],
      assigned_bas: 1,
    },
    {
      id: 7,
      code: 'DEMO007',
      name: 'Imtiaz Clifton',
      city: 'Karachi',
      address: 'Clifton Block 5, Karachi',
      footfall: 'High',
      peak_hours: '6 PM — 10 PM',
      status: 'LIVE',
      coverage: 88,
      bas: 1,
      today_footfall: 380,
      engagement: 62,
      conversion: 31,
      latitude: 24.81,
      longitude: 67.03,
      qr_slug: 'demo-imtiaz-clifton',
      assigned: [{ id: 102, name: 'Bilal Ahmed', code: 'BA-102', state: 'Active' }],
      assigned_bas: 1,
    },
    {
      id: 19,
      code: 'DEMO019',
      name: 'Al-Fatah Blue Area',
      city: 'Islamabad',
      address: 'Blue Area, Islamabad',
      footfall: 'Medium',
      peak_hours: '5 PM — 9 PM',
      status: 'LIVE',
      coverage: 85,
      bas: 1,
      today_footfall: 260,
      engagement: 71,
      conversion: 36,
      latitude: 33.71,
      longitude: 73.06,
      qr_slug: 'demo-alfatah',
      assigned: [{ id: 103, name: 'Sara Ahmed', code: 'BA-103', state: 'Active' }],
      assigned_bas: 1,
    },
    {
      id: 4,
      code: 'DEMO004',
      name: 'Metro Lahore',
      city: 'Lahore',
      address: 'Thokar Niaz Baig, Lahore',
      footfall: 'Medium',
      peak_hours: '4 PM — 8 PM',
      status: 'PARTIAL',
      coverage: 70,
      bas: 1,
      today_footfall: 190,
      engagement: 55,
      conversion: 28,
      latitude: 31.47,
      longitude: 74.24,
      qr_slug: 'demo-metro-lhr',
      assigned: [{ id: 104, name: 'Fatima Noor', code: 'BA-104', state: 'Offline' }],
      assigned_bas: 1,
    },
  ]
  void mockStoreSeed
  return seed
}

function demoAmbassadorsPayload() {
  return [
    {
      id: 101,
      code: 'BA-101',
      name: 'Ayesha Khan',
      email: 'ayesha@kashmir.demo',
      city: 'Lahore',
      status: 'Deployed',
      invite_token: 'demo-ayesha',
      overall_score: 92,
      store: 12,
      store_name: 'Carrefour DHA',
      store_city: 'Lahore',
    },
    {
      id: 102,
      code: 'BA-102',
      name: 'Bilal Ahmed',
      email: 'bilal@kashmir.demo',
      city: 'Karachi',
      status: 'Deployed',
      invite_token: 'demo-bilal',
      overall_score: 88,
      store: 7,
      store_name: 'Imtiaz Clifton',
      store_city: 'Karachi',
    },
    {
      id: 103,
      code: 'BA-103',
      name: 'Sara Ahmed',
      email: 'sara@kashmir.demo',
      city: 'Islamabad',
      status: 'Deployed',
      invite_token: 'demo-sara',
      overall_score: 95,
      store: 19,
      store_name: 'Al-Fatah Blue Area',
      store_city: 'Islamabad',
    },
    {
      id: 104,
      code: 'BA-104',
      name: 'Fatima Noor',
      email: 'fatima@kashmir.demo',
      city: 'Lahore',
      status: 'Deployed',
      invite_token: 'demo-fatima',
      overall_score: 90,
      store: 4,
      store_name: 'Metro Lahore',
      store_city: 'Lahore',
    },
    {
      id: 105,
      code: 'BA-105',
      name: 'Hamza Ali',
      email: 'hamza@kashmir.demo',
      city: 'Karachi',
      status: 'Certified',
      invite_token: 'demo-hamza',
      overall_score: 87,
      store: null,
      store_name: null,
      store_city: null,
    },
  ]
}

function demoSupervisorsPayload() {
  return {
    results: [
      {
        id: 1,
        name: 'Demo Supervisor North',
        email: 'sup.north@kashmir.demo',
        phone: '0300-1111111',
        city: 'Lahore',
        storeIds: [12, 4],
        createdAt: '2026-01-01T00:00:00.000Z',
        hasPassword: true,
      },
      {
        id: 2,
        name: 'Demo Supervisor South',
        email: 'sup.south@kashmir.demo',
        phone: '0300-2222222',
        city: 'Karachi',
        storeIds: [7],
        createdAt: '2026-01-01T00:00:00.000Z',
        hasPassword: true,
      },
    ],
  }
}

function demoBaPerformance(): BaPerformanceDashboard {
  const month = monthYm()
  const today = todayYmd()
  const town = null
  return {
    filters: {
      towns: ['Lahore', 'Karachi', 'Islamabad', 'Faisalabad'],
      storesByTown: {
        Lahore: ['Carrefour DHA', 'Metro Lahore'],
        Karachi: ['Imtiaz Clifton'],
        Islamabad: ['Al-Fatah Blue Area'],
        Faisalabad: [],
      },
      months: [month, '2026-10', '2026-09'],
      monthLabels: {
        [month]: 'This month',
        '2026-10': 'Oct 2026',
        '2026-09': 'Sep 2026',
      },
      categories: [
        'Kashmir Cooking Oil',
        'Kashmir Banaspati',
        'Waadi Banaspati',
        'Kashmir Canola',
      ],
      brands: ['Kashmir', 'Waadi'],
      skus: ['1L', '5L', '16kg'],
    },
    range: { from: `${month}-01`, to: today, days: 10 },
    kpis: {
      customersIntercepted: 1840,
      productiveCalls: 612,
      productivePct: 33.3,
      targetLtrKg: 42000,
      salesLtrKg: 28650,
      achievementPct: 68.2,
    },
    categorySales: demoCategorySalesForFilters(null, town),
    brandTargetVsSales: demoBrandTargetVsSalesForFilters(town),
    townTargetVsSales: demoTargetVsSalesForFilters({
      town,
      store: null,
      category: null,
      sku: null,
    }),
    topStores: demoTopStoresForFilters({
      town,
      store: null,
      storeOptions: ['Carrefour DHA', 'Imtiaz Clifton', 'Al-Fatah Blue Area', 'Metro Lahore'],
      category: null,
    }),
    topSkus: demoTopSkusForFilters({ category: null, town, sku: null }),
    periodSales: engagementSeries.map((d) => ({
      label: d.day,
      sales: d.engagement * 12,
      target: d.engagement * 14,
    })),
    baStatus: {
      days: 1,
      total: 5,
      active: 3,
      break: 0,
      offline: 1,
      inactive: 1,
      cities: [
        { city: 'Lahore', stores: 2, active: 1, break: 0, offline: 1, total: 2 },
        { city: 'Karachi', stores: 1, active: 1, break: 0, offline: 0, total: 1 },
        { city: 'Islamabad', stores: 1, active: 1, break: 0, offline: 0, total: 1 },
      ],
      activeBas: [
        {
          id: 101,
          name: 'Ayesha Khan',
          store: 'Carrefour DHA',
          city: 'Lahore',
          target: 3000,
          achievement: 72,
        },
        {
          id: 102,
          name: 'Bilal Ahmed',
          store: 'Imtiaz Clifton',
          city: 'Karachi',
          target: 2800,
          achievement: 65,
        },
        {
          id: 103,
          name: 'Sara Ahmed',
          store: 'Al-Fatah Blue Area',
          city: 'Islamabad',
          target: 2600,
          achievement: 81,
        },
      ],
      offlineBas: [
        {
          id: 104,
          name: 'Fatima Noor',
          store: 'Metro Lahore',
          city: 'Lahore',
          target: 2400,
          achievement: 40,
        },
      ],
      breakBas: [],
      inactiveBas: [
        {
          id: 105,
          name: 'Hamza Ali',
          store: '—',
          city: 'Karachi',
          reason: 'Training',
        },
      ],
    },
    attendance: [
      {
        ba: 'Ayesha Khan',
        store: 'Carrefour DHA',
        city: 'Lahore',
        days: 1,
        checkIn: '08:02 AM',
        checkOut: '—',
        hours: 4.2,
        status: 'Active',
      },
      {
        ba: 'Bilal Ahmed',
        store: 'Imtiaz Clifton',
        city: 'Karachi',
        days: 1,
        checkIn: '09:01 AM',
        checkOut: '—',
        hours: 3.1,
        status: 'Active',
      },
      {
        ba: 'Sara Ahmed',
        store: 'Al-Fatah Blue Area',
        city: 'Islamabad',
        days: 1,
        checkIn: '08:18 AM',
        checkOut: '01:05 PM',
        hours: 4.8,
        status: 'Checked Out',
      },
    ],
    supervisorAttendance: [
      {
        id: 1,
        date: today,
        day: 'Today',
        supervisor: 'Demo Supervisor North',
        store: 'Carrefour DHA',
        city: 'Lahore',
        checkIn: '10:15 AM',
        checkOut: '11:40 AM',
        duration: '1h 25m',
        status: 'Completed',
      },
    ],
    workingHours: {
      avgHours: 6.4,
      points: [
        { label: 'Mon', hours: 6.2, count: 4 },
        { label: 'Tue', hours: 6.8, count: 4 },
        { label: 'Wed', hours: 6.1, count: 3 },
        { label: 'Thu', hours: 6.5, count: 4 },
        { label: 'Fri', hours: 7.0, count: 5 },
      ],
    },
    targetVsAchievement: {
      month,
      monthLabel: 'This month',
      rows: baRanking.map((b, i) => ({
        ambassadorId: String(101 + i),
        ambassador: b.name,
        store: ambassadors.find((a) => a.id === b.id)?.store?.replace(/^Store #\d+ — /, '') || '—',
        city: b.city,
        target: 2500 + i * 200,
        sales: 1600 + i * 180,
        achievement: Math.round(55 + i * 5),
      })),
    },
    weeklyOff: {
      weekStart: today,
      weekEnd: today,
      weekLabel: 'This week',
      rows: [
        {
          ambassadorId: 101,
          code: 'BA-101',
          name: 'Ayesha Khan',
          store: 'Carrefour DHA',
          city: 'Lahore',
          offDay: 'Sun',
          offDate: null,
          status: 'Sun',
        },
        {
          ambassadorId: 102,
          code: 'BA-102',
          name: 'Bilal Ahmed',
          store: 'Imtiaz Clifton',
          city: 'Karachi',
          offDay: null,
          offDate: null,
          status: 'Not set',
        },
      ],
      setCount: 1,
      notSetCount: 1,
    },
  }
}

/** Resolve a demo response for an API path. Returns undefined to fall through (should not happen in demo). */
export function resolveDemoApiResponse(
  path: string,
  options: { method?: string; body?: unknown } = {},
): unknown {
  const method = (options.method || 'GET').toUpperCase()
  const clean = pathOnly(path)

  if (clean === '/auth/users/me/' || clean.endsWith('/auth/users/me/')) {
    return {
      id: 0,
      email: 'demo@kashmir.local',
      username: 'demo',
      first_name: 'Demo',
      last_name: 'Head Office',
      user_type: 1,
    }
  }

  if (clean === '/api/stores/' || clean.endsWith('/api/stores/')) {
    if (method === 'GET') return demoStoresPayload()
    return { id: 9001, name: 'Demo Store', city: 'Lahore', code: 'DEMO-NEW' }
  }

  if (clean === '/api/ambassadors/' || clean.endsWith('/api/ambassadors/')) {
    if (method === 'GET') return demoAmbassadorsPayload()
    return { id: 9002, name: 'Demo BA', status: 'Invited' }
  }

  if (clean === '/api/supervisors/' || clean.endsWith('/api/supervisors/')) {
    return demoSupervisorsPayload()
  }

  if (clean.includes('/api/intelligence/ba-performance')) {
    return demoBaPerformance()
  }

  if (clean.includes('/api/intelligence/')) {
    return {
      overview: {
        shoppers: 12842,
        engagement_rate: 68.4,
        conversion_rate: 31.7,
        stores: 4,
      },
      results: [],
      summary: {},
    }
  }

  if (clean.includes('/api/shifts')) {
    return { results: [], count: 0 }
  }

  if (clean.includes('/api/ba-targets') || clean.includes('/api/targets')) {
    if (method === 'GET') return { results: [], count: 0 }
    return { ok: true, saved: 1 }
  }

  if (clean.includes('/api/incentive')) {
    return { results: [], overview: {}, ok: true }
  }

  if (clean.includes('/api/complaints') || clean.includes('/api/user-interceptions')) {
    return { results: [], count: 0, summary: {} }
  }

  if (clean.includes('/api/daily-report') || clean.includes('/api/ba/daily')) {
    return { results: [], count: 0 }
  }

  if (clean.includes('/api/stocks')) {
    return { results: [], matrix: [], count: 0 }
  }

  if (clean.includes('/api/manager/')) {
    return { summary: { avg_coverage: 84 }, stores: demoStoresPayload() }
  }

  if (clean.includes('/api/supervisor')) {
    return {
      stores: demoStoresPayload().slice(0, 2),
      bas: demoAmbassadorsPayload().slice(0, 2),
      teamConversion: 32,
      coverage: 75,
      todayFootfall: 680,
      openVisit: null,
      visits: [],
    }
  }

  if (method === 'GET') {
    return { results: [], count: 0, ok: true }
  }

  // Mutations succeed silently in demo
  return { ok: true, detail: 'Demo mode — change not persisted to server.' }
}
