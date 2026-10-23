import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { ChevronDown, Download, RotateCcw, Search } from 'lucide-react'
import { Button, Card, CardHeader, cn, StatusBadge, TableScroll } from '../../components/ui'
import {
  MONTH_ORDER,
  baPerformanceCategories,
  demoBrandTargetVsSalesForFilters,
  demoCategorySalesForFilters,
  demoTargetVsSalesForFilters,
  demoTopSkusForFilters,
  demoTopStoresForFilters,
  getAllSkus,
  getSkusForCategory,
  type ProductCategory,
  type SalesPeriodMode,
} from '../../data/baPerformance'
import {
  downloadBaPerformanceExcel,
  fetchBaPerformanceDashboard,
  type ActiveBaRow,
  type BaPerformanceDashboard,
} from '../../lib/baPerformanceApi'
import {
  dashboardCacheKey,
  peekDashboardCache,
  setDashboardCache,
} from '../../lib/hoDataCache'
import {
  chartGold,
  chartGreen,
  chartGrid,
  chartTick,
  colorsForSkuLabels,
  defaultChartOptions,
} from '../../lib/chartjs'
import type { ChartData, ChartOptions } from 'chart.js'

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr className="border-t border-slate-100">
      <td colSpan={cols} className="px-4 py-6 text-center text-sm text-slate-400">
        No data for this selection
      </td>
    </tr>
  )
}

function mixHex(from: string, to: string, t: number) {
  const parse = (hex: string) => {
    const h = hex.replace('#', '')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const [r1, g1, b1] = parse(from)
  const [r2, g2, b2] = parse(to)
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`
}

/** Battery meter: shortest bar = red, mid = amber, fullest = green. */
function batteryBarColor(ratio: number) {
  const t = Math.max(0, Math.min(1, ratio))
  if (t < 0.5) return mixHex('#e11d48', '#f9b000', t / 0.5)
  return mixHex('#f9b000', '#16a34a', (t - 0.5) / 0.5)
}

type KpiTone = 'forest' | 'gold' | 'cream' | 'sage'

const KPI_TONES: Record<
  KpiTone,
  { card: string; label: string; value: string; hint: string; chevron: string }
> = {
  forest: {
    card: 'bg-gradient-to-r from-[#143528] via-[#1e5540] to-[#2a6b4e] text-white shadow-[0_10px_28px_rgba(20,53,40,0.28)]',
    label: 'text-white/70',
    value: 'text-white',
    hint: 'text-emerald-100/70',
    chevron: 'text-white/45',
  },
  gold: {
    card: 'bg-gradient-to-r from-[#c4921c] via-[#e0b43a] to-[#f3cc55] text-[#16382b] shadow-[0_10px_28px_rgba(180,130,20,0.22)]',
    label: 'text-[#16382b]/70',
    value: 'text-[#16382b]',
    hint: 'text-[#16382b]/55',
    chevron: 'text-[#16382b]/40',
  },
  cream: {
    card: 'bg-gradient-to-r from-[#efe4d0] to-[#faf6ee] text-[#16382b] shadow-[0_6px_18px_rgba(60,50,30,0.08)] ring-1 ring-[#e6d9c4]',
    label: 'text-[#16382b]/65',
    value: 'text-[#16382b]',
    hint: 'text-[#16382b]/50',
    chevron: 'text-[#16382b]/35',
  },
  sage: {
    card: 'bg-gradient-to-r from-[#d4e8d0] to-[#eef6ec] text-[#16382b] shadow-[0_6px_18px_rgba(40,70,40,0.08)] ring-1 ring-[#cfe0cb]',
    label: 'text-[#16382b]/65',
    value: 'text-[#16382b]',
    hint: 'text-[#16382b]/50',
    chevron: 'text-[#16382b]/35',
  },
}

function PremiumKpiCard({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string
  value: string | number
  hint?: string
  tone: KpiTone
  className?: string
}) {
  const t = KPI_TONES[tone]
  return (
    <div
      className={cn(
        'relative flex h-full items-center justify-center overflow-hidden rounded-3xl px-4 py-4 text-center animate-fade-up',
        t.card,
        className,
      )}
    >
      <div className="min-w-0">
        <div className={cn('text-[10px] font-semibold tracking-[0.14em] uppercase', t.label)}>
          {label}
        </div>
        <div className={cn('mt-0.5 text-2xl font-bold tabular-nums leading-none sm:text-[1.7rem]', t.value)}>
          {value}
        </div>
        {hint && <div className={cn('mt-1.5 text-[11px]', t.hint)}>{hint}</div>}
      </div>
    </div>
  )
}

function BasListKpiCard({
  label,
  value,
  hint,
  rows,
  emptyText,
  showTarget,
  tone,
}: {
  label: string
  value: string | number
  hint?: string
  rows: ActiveBaRow[]
  emptyText: string
  showTarget?: boolean
  tone: KpiTone
}) {
  const [open, setOpen] = useState(false)
  const t = KPI_TONES[tone]

  return (
    <div className={cn('relative h-full', open ? 'z-50' : 'z-0')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative flex h-full w-full items-center justify-center overflow-hidden rounded-3xl px-4 py-4 text-center animate-fade-up',
          t.card,
        )}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-white/75">
            {label}
          </div>
          <div className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-white sm:text-[1.7rem]">
            {value}
          </div>
          {hint && <div className="mt-1.5 text-[11px] text-white/70">{hint}</div>}
        </div>
        <ChevronDown
          size={16}
          className={cn(
            'absolute top-1/2 right-3 shrink-0 -translate-y-1/2 text-white/55 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {rows.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-slate-400">{emptyText}</p>
          ) : (
            <ul>
              {rows.map((ba) => (
                <li
                  key={ba.id}
                  className="border-b border-slate-50 px-3 py-2 last:border-b-0"
                >
                  <div className="truncate text-sm font-medium text-slate-900">{ba.name}</div>
                  <div className="truncate text-xs text-slate-500">{ba.store}</div>
                  <div className="truncate text-[11px] text-slate-400">{ba.city}</div>
                  {showTarget && (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] tabular-nums text-slate-500">
                      <span>
                        Target{' '}
                        {ba.target == null ? '—' : ba.target.toLocaleString()}
                      </span>
                      <span className="font-semibold text-slate-700">
                        Ach{' '}
                        {ba.achievement == null ? '—' : `${Math.round(ba.achievement)}%`}
                      </span>
                    </div>
                  )}
                  {ba.reason ? (
                    <div className="mt-1 text-[11px] font-medium text-amber-700">
                      {ba.reason}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

type FilterPanelProps = {
  title: string
  options: string[]
  value: string | null
  onChange: (value: string | null) => void
  allowAll?: boolean
  allLabel?: string
  fill?: boolean
  className?: string
}

function FilterPanel({
  title,
  options,
  value,
  onChange,
  allowAll,
  allLabel = 'All',
  fill,
  className,
}: FilterPanelProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, query])

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl bg-white shadow-[0_6px_18px_rgba(60,50,30,0.06)] ring-1 ring-[#eee4d4]',
        fill && 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-[#eee4d4] bg-white px-3 py-2">
        <span className="text-[11px] font-semibold tracking-wide text-[#16382b]/65 uppercase">
          {title}
        </span>
        <button
          type="button"
          title="Clear filter"
          onClick={() => {
            onChange(allowAll ? null : options[0] ?? null)
            setQuery('')
          }}
          className="rounded-md p-1 text-[#16382b]/40 transition hover:bg-[#f7f1e6] hover:text-[#16382b]"
        >
          <RotateCcw size={12} />
        </button>
      </div>
      <div className="border-b border-[#eee4d4] bg-white px-2 py-1.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-[#eee4d4] bg-white px-2 py-1.5">
          <Search size={12} className="shrink-0 text-[#16382b]/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-transparent text-xs text-[#16382b] outline-none placeholder:text-[#16382b]/35"
          />
        </div>
      </div>
      <div
        className={cn(
          'dashboard-filter-scroll overflow-y-auto overscroll-contain bg-gradient-to-b from-[#f7f1e6] to-[#fffcf7]',
          fill ? 'max-h-80 sm:max-h-96 lg:max-h-none lg:flex-1' : 'max-h-36',
        )}
      >
        {allowAll && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={`block w-full px-3 py-2 text-left text-xs transition ${
              value === null
                ? 'bg-gold-500/20 font-semibold text-[#16382b]'
                : 'text-[#16382b]/80 hover:bg-white/60'
            }`}
          >
            {allLabel}
          </button>
        )}
        {filtered.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`block w-full px-3 py-2 text-left text-xs transition ${
              value === option
                ? 'bg-gold-500/20 font-semibold text-[#16382b]'
                : 'text-[#16382b]/80 hover:bg-white/60'
            }`}
          >
            {option}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-[#16382b]/45">No matches</p>
        )}
      </div>
    </div>
  )
}

type TownStoreFilterPanelProps = {
  towns: string[]
  storesByTown: Record<string, string[]>
  town: string | null
  store: string | null
  onSelectTown: (town: string | null) => void
  onSelectStore: (town: string, store: string) => void
}

function TownStoreFilterPanel({
  towns,
  storesByTown,
  town,
  store,
  onSelectTown,
  onSelectStore,
}: TownStoreFilterPanelProps) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const names = towns.length ? towns : Object.keys(storesByTown).sort((a, b) => a.localeCompare(b))
    return names.map((t) => ({ town: t, stores: storesByTown[t] ?? [] }))
  }, [towns, storesByTown])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => {
        const townHit = g.town.toLowerCase().includes(q)
        const stores = townHit
          ? g.stores
          : g.stores.filter((s) => s.toLowerCase().includes(q))
        if (!townHit && stores.length === 0) return null
        return { town: g.town, stores }
      })
      .filter((g): g is { town: string; stores: string[] } => g !== null)
  }, [groups, query])

  const allSelected = town === null && store === null

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-[0_6px_18px_rgba(60,50,30,0.06)] ring-1 ring-[#eee4d4]">
      <div className="flex items-center justify-between border-b border-[#eee4d4] bg-white px-3 py-2">
        <span className="text-[11px] font-semibold tracking-wide text-[#16382b]/65 uppercase">
          Town / Store
        </span>
        <button
          type="button"
          title="Clear filter"
          onClick={() => {
            onSelectTown(null)
            setQuery('')
          }}
          className="rounded-md p-1 text-[#16382b]/40 transition hover:bg-[#f7f1e6] hover:text-[#16382b]"
        >
          <RotateCcw size={12} />
        </button>
      </div>
      <div className="border-b border-[#eee4d4] bg-white px-2 py-1.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-[#eee4d4] bg-white px-2 py-1.5">
          <Search size={12} className="shrink-0 text-[#16382b]/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search town or store..."
            className="w-full bg-transparent text-xs text-[#16382b] outline-none placeholder:text-[#16382b]/35"
          />
        </div>
      </div>
      <div className="dashboard-filter-scroll h-44 overflow-y-auto overscroll-contain bg-gradient-to-b from-[#f7f1e6] to-[#fffcf7]">
        <button
          type="button"
          onClick={() => onSelectTown(null)}
          className={`block w-full px-3 py-2 text-left text-xs transition ${
            allSelected
              ? 'bg-gold-500/20 font-semibold text-[#16382b]'
              : 'text-[#16382b]/80 hover:bg-white/60'
          }`}
        >
          All towns
        </button>
        {filtered.map((g) => {
          const townSelected = town === g.town && store === null
          return (
            <div key={g.town}>
              <button
                type="button"
                onClick={() => onSelectTown(g.town)}
                className={`block w-full px-3 py-1.5 text-left text-xs font-semibold tracking-wide uppercase transition ${
                  townSelected
                    ? 'bg-gold-500/20 text-[#16382b]'
                    : 'text-[#16382b]/65 hover:bg-white/60'
                }`}
              >
                {g.town}
              </button>
              {g.stores.map((s) => {
                const storeSelected = town === g.town && store === s
                return (
                  <button
                    key={`${g.town}::${s}`}
                    type="button"
                    onClick={() => onSelectStore(g.town, s)}
                    className={`block w-full py-1.5 pr-3 pl-6 text-left text-xs transition ${
                      storeSelected
                        ? 'bg-gold-500/20 font-semibold text-[#16382b]'
                        : 'text-[#16382b]/80 hover:bg-white/60'
                    }`}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-[#16382b]/45">No matches</p>
        )}
      </div>
    </div>
  )
}

const CHART_HEIGHT = 'h-[220px]'
const TOP10_CHART_HEIGHT = 'h-[320px]'
const PERIOD_CHART_HEIGHT = 'h-[260px]'

function ChartCard({
  title,
  children,
  className,
  headerRight,
  chartHeight = CHART_HEIGHT,
}: {
  title: string
  children: ReactNode
  className?: string
  headerRight?: ReactNode
  chartHeight?: string
}) {
  return (
    <Card padding={false} className={cn('h-full', className)}>
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-50 px-4">
        <h3 className="truncate text-sm font-medium text-slate-700">{title}</h3>
        {headerRight}
      </div>
      <div className="p-3 sm:p-4">
        <div className={cn('relative w-full', chartHeight)}>{children}</div>
      </div>
    </Card>
  )
}

function PeriodToggle({
  value,
  onChange,
}: {
  value: SalesPeriodMode
  onChange: (v: SalesPeriodMode) => void
}) {
  const options: { id: SalesPeriodMode; label: string }[] = [
    { id: 'wow', label: 'WoW' },
    { id: 'mom', label: 'MoM' },
    { id: 'yoy', label: 'YoY' },
  ]
  return (
    <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            'rounded-md px-2.5 py-1 text-[11px] font-semibold transition',
            value === o.id
              ? 'bg-white text-navy-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const scaleDefaults = {
  grid: { color: chartGrid },
  ticks: { color: chartTick, font: { size: 11 } },
  border: { display: false },
}

type DatePreset = 'today' | 'yesterday' | 'mtd' | 'ytd' | 'custom'

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'mtd', label: 'Month to date' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'custom', label: 'Custom date' },
]

function monthNameFromDate(d: Date) {
  return MONTH_ORDER[d.getMonth()]
}

function monthForPreset(preset: DatePreset, customFrom?: string, customTo?: string): string | null {
  const today = new Date()
  if (preset === 'ytd') return null
  if (preset === 'custom') {
    if (!customFrom || !customTo) return null
    const from = parseDateInput(customFrom)
    const to = parseDateInput(customTo)
    if (!from || !to) return null
    const fromMonth = monthNameFromDate(from)
    const toMonth = monthNameFromDate(to)
    if (fromMonth === toMonth) return fromMonth
    return null
  }
  const d =
    preset === 'yesterday' ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1) : today
  return monthNameFromDate(d)
}

function dateInputValue(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayInputValue() {
  return dateInputValue(new Date())
}

/** The calendar span of a data month (this year), clamped by dateRangeForPreset to today. */
function dateRangeForMonth(monthName: string) {
  const monthIdx = MONTH_ORDER.indexOf(monthName)
  const now = new Date()
  const from = new Date(now.getFullYear(), monthIdx, 1)
  const to = new Date(now.getFullYear(), monthIdx + 1, 0)
  return { from: dateInputValue(from), to: dateInputValue(to) }
}

function parseDateInput(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Elapsed share of the calendar month that `asOf` falls in (0–100). */
function timeGonePctInMonth(asOf: Date) {
  const year = asOf.getFullYear()
  const month = asOf.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const day = Math.min(Math.max(asOf.getDate(), 1), daysInMonth)
  return {
    pct: Math.round((day / daysInMonth) * 1000) / 10,
    day,
    daysInMonth,
  }
}

/** Inclusive start/end dates for a preset; null while a custom range is incomplete or invalid. */
function dateRangeForPreset(preset: DatePreset, customFrom: string, customTo: string) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (preset) {
    case 'today':
      return { start: today, end: today }
    case 'yesterday': {
      const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
      return { start: y, end: y }
    }
    case 'mtd':
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today }
    case 'ytd':
      return { start: new Date(today.getFullYear(), 0, 1), end: today }
    case 'custom': {
      const start = parseDateInput(customFrom)
      const end = parseDateInput(customTo)
      if (!start || !end || start > end || start > today) return null
      return { start, end: end > today ? today : end }
    }
  }
}

export function BaPerformanceDashboardPage() {
  const [town, setTown] = useState<string | null>(null)
  const [month, setMonth] = useState<string | null>(() => monthForPreset('mtd'))
  const [store, setStore] = useState<string | null>(null)
  const [category, setCategory] = useState<ProductCategory | null>(null)
  const [sku, setSku] = useState<string | null>(null)
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriodMode>('mom')
  const [datePreset, setDatePreset] = useState<DatePreset>('mtd')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [dash, setDash] = useState<BaPerformanceDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [hoursCity, setHoursCity] = useState<string | null>(null)
  const [targetMonth, setTargetMonth] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const range = useMemo(
    () => dateRangeForPreset(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  )

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const from = range ? dateInputValue(range.start) : customFrom || null
    const to = range ? dateInputValue(range.end) : customTo || null
    const apiPeriod = salesPeriod === 'yoy' ? 'ytd' : salesPeriod
    let monthParam: string | null = null
    if (month) {
      const idx = MONTH_ORDER.indexOf(month)
      if (idx >= 0) {
        monthParam = `${new Date().getFullYear()}-${String(idx + 1).padStart(2, '0')}`
      } else {
        monthParam = month
      }
    }
    const params = {
      town,
      store,
      month: from && to ? null : monthParam,
      from: from && to ? from : null,
      to: from && to ? to : null,
      category,
      sku,
      salesPeriod: apiPeriod as 'wow' | 'mom' | 'ytd',
      targetMonth,
    }
    const cacheKey = dashboardCacheKey(params)

    let silent = !!opts?.silent
    if (!silent) {
      const cached = peekDashboardCache(cacheKey)
      if (cached) {
        setDash(cached)
        setLoading(false)
        silent = true
      } else {
        setLoading(true)
        setError(null)
      }
    }

    try {
      const data = await fetchBaPerformanceDashboard(params)
      if (!data) {
        if (!silent) setError('Sign in to load live dashboard data.')
        if (!silent) setDash(null)
      } else {
        setDash(data)
        setDashboardCache(cacheKey, data)
        if (!silent) setError(null)
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Could not load dashboard')
        setDash(null)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [town, store, month, category, sku, salesPeriod, range, customFrom, customTo, targetMonth])

  useEffect(() => {
    void load()
  }, [load])

  // Silent poll so new daily reports show without a full page reload
  useEffect(() => {
    const id = window.setInterval(() => {
      void load({ silent: true })
    }, 30_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load({ silent: true })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load])

  const towns = dash?.filters.towns ?? []
  const storesByTown = dash?.filters.storesByTown ?? {}
  const monthOptions = useMemo(() => {
    const fromApi = dash?.filters.months ?? []
    return fromApi.map((m) => {
      if (m.includes('-')) {
        const mm = Number(m.split('-')[1]) - 1
        return MONTH_ORDER[mm] ?? m
      }
      return m
    })
  }, [dash?.filters.months])

  const storeOptions = useMemo(() => {
    if (town) return storesByTown[town] ?? []
    return Object.values(storesByTown).flat()
  }, [town, storesByTown])

  const skuOptions = useMemo(() => {
    // Always offer the full 14-SKU catalog; category still filters charts.
    return getAllSkus()
  }, [])

  const data = useMemo(() => {
    const liveStores = (dash?.topStores ?? []).filter((s) => s.sales > 0)
    const liveSkus = (dash?.topSkus ?? []).filter((s) => s.sales > 0)
    let liveCats = (dash?.categorySales ?? []).filter((c) => c.value > 0)
    if (category && liveCats.length) {
      liveCats = liveCats.filter((c) => c.name === category)
    }

    const tvs = dash?.townTargetVsSales
    const liveSalesKpi = dash?.kpis.salesLtrKg ?? 0
    const hasLiveSales =
      liveSalesKpi > 0 || liveStores.length > 0 || liveSkus.length > 0 || liveCats.length > 0
    const hasLiveTarget = Boolean(tvs && (tvs.target > 0 || (tvs.sales ?? 0) > 0 || hasLiveSales))

    return {
      customersIntercepted: dash?.kpis.customersIntercepted ?? 0,
      productiveCalls: dash?.kpis.productiveCalls ?? 0,
      productivePct: dash?.kpis.productivePct ?? 0,
      targetLtrKg: dash?.kpis.targetLtrKg ?? 0,
      salesLtrKg: liveSalesKpi,
      achievementPct: dash?.kpis.achievementPct ?? 0,
      categorySales: liveCats.length
        ? liveCats
        : hasLiveSales
          ? []
          : demoCategorySalesForFilters(category, town),
      brandTargetVsSales: (() => {
        const live = (dash?.brandTargetVsSales ?? []).filter(
          (b) => (b.target ?? 0) > 0 || (b.sales ?? 0) > 0,
        )
        if (live.length) return live
        if (hasLiveSales || hasLiveTarget) {
          // Live payload but empty brand split — derive from category sales only
          const fromCats = (dash?.categorySales ?? [])
            .filter((c) => baPerformanceCategories.includes(c.name as ProductCategory))
            .map((c) => ({
              name: c.name,
              target: 0,
              sales: c.value,
              achievement: 0,
            }))
          return fromCats.length ? fromCats : demoBrandTargetVsSalesForFilters(town)
        }
        return demoBrandTargetVsSalesForFilters(town)
      })(),
      townTargetVsSales: hasLiveTarget && tvs
        ? {
            town: tvs.town || town || store || category || 'All towns',
            target: tvs.target,
            // Never invent sales — only show what the API returned
            sales: tvs.sales ?? 0,
          }
        : demoTargetVsSalesForFilters({ town, store, category, sku }),
      topStores: liveStores.length
        ? liveStores.slice(0, 10)
        : hasLiveSales
          ? []
          : demoTopStoresForFilters({ town, store, storeOptions, category }),
      topSkus: liveSkus.length
        ? liveSkus.slice(0, 5)
        : hasLiveSales
          ? []
          : demoTopSkusForFilters({ category, sku, town }),
    }
  }, [dash, town, store, storeOptions, category, sku])

  const salesTargetPoints = useMemo(
    () =>
      (dash?.periodSales ?? []).map((p) => ({
        label: p.label,
        sales: p.sales,
        target: p.target,
      })),
    [dash?.periodSales],
  )

  const periodSalesTitle =
    salesPeriod === 'wow'
      ? 'Week-wise sales (Kg)'
      : salesPeriod === 'mom'
        ? 'Month-wise sales (Kg)'
        : 'Year-to-date sales (Kg)'

  const cityStatus = dash?.baStatus ?? null
  const attendanceTable = dash?.attendance ?? []
  const workingHoursBase = dash?.workingHours ?? null
  const isSingleDay = (dash?.range.days ?? 0) === 1
  const targetVsAchievement = dash?.targetVsAchievement
  const targetRows = targetVsAchievement?.rows ?? []

  const totalBasRows = useMemo(() => {
    const seen = new Map<number, ActiveBaRow>()
    for (const ba of [
      ...(cityStatus?.activeBas ?? []),
      ...(cityStatus?.offlineBas ?? []),
      ...(cityStatus?.breakBas ?? []),
    ]) {
      if (!seen.has(ba.id)) seen.set(ba.id, ba)
    }
    const byId = new Map(targetRows.map((r) => [Number(r.ambassadorId), r]))
    return [...seen.values()]
      .map((ba) => {
        const t = byId.get(ba.id)
        return {
          ...ba,
          target: t?.target ?? null,
          achievement: t?.achievement ?? null,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [cityStatus, targetRows])

  const targetMonthOptions = useMemo(() => {
    const fromApi = dash?.filters.months ?? []
    const labels = dash?.filters.monthLabels ?? {}
    const opts = fromApi.map((m) => ({
      value: m.includes('-') ? m : m,
      label: labels[m] || m,
    }))
    // Ensure current selection is present
    if (targetMonth && !opts.some((o) => o.value === targetMonth)) {
      const [y, mm] = targetMonth.split('-').map(Number)
      const name = MONTH_ORDER[mm - 1] ?? targetMonth
      opts.unshift({ value: targetMonth, label: `${name} ${y}` })
    }
    if (!opts.length) {
      const d = new Date()
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      opts.push({ value: v, label: `${MONTH_ORDER[d.getMonth()]} ${d.getFullYear()}` })
    }
    return opts
  }, [dash?.filters.months, dash?.filters.monthLabels, targetMonth])

  const workingHours = useMemo(() => {
    if (!workingHoursBase || !hoursCity) return workingHoursBase
    const rows = attendanceTable.filter((r) => r.city === hoursCity)
    if (!rows.length) return { avgHours: null as number | null, points: [] as { label: string; hours: number; count: number }[] }
    const byStore = new Map<string, number[]>()
    for (const r of rows) {
      byStore.set(r.store, [...(byStore.get(r.store) ?? []), r.hours])
    }
    const points = [...byStore.entries()].map(([label, hs]) => ({
      label,
      hours: Math.round((hs.reduce((s, x) => s + x, 0) / hs.length) * 100) / 100,
      count: hs.length,
    }))
    const all = rows.map((r) => r.hours)
    return {
      avgHours: Math.round((all.reduce((s, x) => s + x, 0) / all.length) * 100) / 100,
      points,
    }
  }, [workingHoursBase, hoursCity, attendanceTable])

  const baCities = useMemo(
    () => [...new Set(attendanceTable.map((r) => r.city).filter(Boolean))].sort(),
    [attendanceTable],
  )

  function applyDatePreset(preset: DatePreset, from = customFrom, to = customTo) {
    setDatePreset(preset)
    if (preset === 'custom') return
    setMonth(monthForPreset(preset, from, to))
    setStore(null)
  }

  function handleCustomFrom(value: string) {
    setCustomFrom(value)
    setDatePreset('custom')
    if (value && customTo) {
      setMonth(monthForPreset('custom', value, customTo))
      setStore(null)
    }
  }

  function handleCustomTo(value: string) {
    setCustomTo(value)
    setDatePreset('custom')
    if (customFrom && value) {
      setMonth(monthForPreset('custom', customFrom, value))
      setStore(null)
    }
  }

  function handleTownChange(next: string | null) {
    setTown(next)
    setStore(null)
  }

  function handleStoreChange(nextTown: string, nextStore: string) {
    setTown(nextTown)
    setStore(nextStore)
  }

  function handleCategoryChange(next: string | null) {
    const nextCategory = (next as ProductCategory | null) ?? null
    setCategory(nextCategory)
    setSku((current) => {
      if (!current) return null
      return getSkusForCategory(nextCategory).includes(current) ? current : null
    })
  }

  function handleMonthChange(next: string | null) {
    setMonth(next)
    setStore(null)
    setDatePreset('custom')
    if (next) {
      const { from, to } = dateRangeForMonth(next)
      setCustomFrom(from)
      setCustomTo(to)
    } else {
      setCustomFrom('')
      setCustomTo('')
    }
  }

  const dateRangeLabel = useMemo(() => {
    if (datePreset === 'custom' && customFrom && customTo) {
      return `${customFrom} → ${customTo}`
    }
    const label = DATE_PRESETS.find((p) => p.id === datePreset)?.label ?? ''
    if ((datePreset === 'today' || datePreset === 'yesterday') && range) {
      return `${label} · ${range.start.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return label
  }, [datePreset, customFrom, customTo, range])

  async function handleDownload() {
    if (!dash || downloading) return
    setDownloading(true)
    try {
      await downloadBaPerformanceExcel(dash, {
        dateLabel: dateRangeLabel,
        town,
        store,
        category,
        sku,
        targetMonth,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.')
    } finally {
      setDownloading(false)
    }
  }

  const baStatusHint = !cityStatus
    ? loading
      ? 'Loading…'
      : 'Select a valid date range'
    : cityStatus.days > 1
      ? `Avg per day · ${cityStatus.days} days`
      : undefined

  const scopeLabel = data.townTargetVsSales.town
  const targetVsSalesAchievementPct =
    data.townTargetVsSales.target > 0
      ? Math.round((data.townTargetVsSales.sales / data.townTargetVsSales.target) * 1000) / 10
      : 0

  const timeGone = useMemo(() => {
    const asOf = range?.end ?? new Date()
    return timeGonePctInMonth(asOf)
  }, [range])

  const brandShortLabel = (name: string) => {
    if (name === 'Kashmir Cooking Oil') return 'KCO'
    if (name === 'Kashmir Banaspati') return 'KBP'
    if (name === 'Waadi Banaspati') return 'WBP'
    return name
  }

  const brandTargetChart = useMemo<ChartData<'bar'>>(() => {
    const rows = data.brandTargetVsSales
    return {
      labels: rows.map((r) => brandShortLabel(r.name)),
      datasets: [
        {
          label: 'Target',
          data: rows.map((r) => r.target),
          backgroundColor: chartGold,
          hoverBackgroundColor: chartGold,
          borderRadius: 4,
          maxBarThickness: 36,
        },
        {
          label: 'Sales',
          data: rows.map((r) => r.sales),
          backgroundColor: chartGreen,
          hoverBackgroundColor: chartGreen,
          borderRadius: 4,
          maxBarThickness: 36,
        },
      ],
    }
  }, [data.brandTargetVsSales])

  const brandTargetOptions = useMemo<ChartOptions<'bar'>>(
    () => ({
      ...defaultChartOptions,
      plugins: {
        ...defaultChartOptions.plugins,
        legend: {
          ...defaultChartOptions.plugins.legend,
          position: 'bottom',
        },
        tooltip: {
          ...defaultChartOptions.plugins.tooltip,
          callbacks: {
            afterBody: (items) => {
              const idx = items[0]?.dataIndex ?? 0
              const row = data.brandTargetVsSales[idx]
              if (!row) return []
              return [
                `${row.name}`,
                `Achievement: ${row.achievement}% of target`,
              ]
            },
          },
        },
      },
      scales: {
        x: scaleDefaults,
        y: { ...scaleDefaults, beginAtZero: true },
      },
    }),
    [data.brandTargetVsSales],
  )

  const targetSalesChart = useMemo<ChartData<'bar'>>(() => {
    const values = [data.townTargetVsSales.target, data.townTargetVsSales.sales]
    const min = Math.min(...values)
    const max = Math.max(...values, 1)
    const span = max - min
    const colors = values.map((v) => batteryBarColor(span <= 0 ? 1 : (v - min) / span))
    return {
      labels: ['Target', 'Sales'],
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          hoverBackgroundColor: colors,
          borderRadius: 4,
          maxBarThickness: 48,
        },
      ],
    }
  }, [data.townTargetVsSales])

  const targetSalesOptions = useMemo<ChartOptions<'bar'>>(
    () => ({
      ...defaultChartOptions,
      plugins: {
        ...defaultChartOptions.plugins,
        legend: { display: false },
        tooltip: {
          ...defaultChartOptions.plugins.tooltip,
          callbacks: {
            afterBody: () => [
              `Achievement: ${targetVsSalesAchievementPct}% of target`,
            ],
          },
        },
      },
      scales: {
        x: scaleDefaults,
        y: { ...scaleDefaults, beginAtZero: true },
      },
    }),
    [targetVsSalesAchievementPct],
  )

  const periodSalesChart = useMemo<ChartData<'doughnut'>>(() => {
    const salesVal = salesTargetPoints.reduce((sum, p) => sum + (p.sales || 0), 0)
    const targetVal = salesTargetPoints.reduce((sum, p) => sum + (p.target || 0), 0)
    return {
      labels: ['Sales', 'Target'],
      datasets: [
        {
          data: [salesVal, targetVal],
          backgroundColor: [chartGreen, chartGold],
          borderColor: '#fff',
          borderWidth: 2,
        },
      ],
    }
  }, [salesTargetPoints])

  const periodSalesOptions = useMemo<ChartOptions<'doughnut'>>(
    () => ({
      ...defaultChartOptions,
      plugins: {
        ...defaultChartOptions.plugins,
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: false,
            color: chartTick,
            font: { size: 11 },
            padding: 16,
          },
        },
        tooltip: {
          ...defaultChartOptions.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const val = typeof ctx.parsed === 'number' ? ctx.parsed : 0
              const formatted =
                val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(Math.round(val * 10) / 10)
              return ` ${ctx.label}: ${formatted} Kg`
            },
          },
        },
      },
      cutout: '55%',
    }),
    [],
  )

  const topStoresChart = useMemo<ChartData<'bar'>>(() => {
    const values = data.topStores.map((s) => s.sales)
    const min = Math.min(...values)
    const max = Math.max(...values, 1)
    const span = max - min
    const colors = values.map((v) => batteryBarColor(span <= 0 ? 1 : (v - min) / span))
    return {
      labels: data.topStores.map((s) => s.store),
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          hoverBackgroundColor: colors,
          borderRadius: 3,
          maxBarThickness: 16,
        },
      ],
    }
  }, [data.topStores])

  const topSkusChart = useMemo<ChartData<'bar'>>(() => {
    const labels = data.topSkus.map((s) => s.sku)
    const values = data.topSkus.map((s) => s.sales)
    const colors = colorsForSkuLabels(labels)
    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          hoverBackgroundColor: colors,
          borderRadius: 3,
          maxBarThickness: 16,
        },
      ],
    }
  }, [data.topSkus])

  const horizontalBarOptions = useMemo<ChartOptions<'bar'>>(
    () => ({
      ...defaultChartOptions,
      indexAxis: 'y',
      plugins: { ...defaultChartOptions.plugins, legend: { display: false } },
      scales: {
        x: {
          ...scaleDefaults,
          beginAtZero: true,
          ticks: {
            ...scaleDefaults.ticks,
            callback: (v) =>
              typeof v === 'number' && v >= 1000
                ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`
                : String(v),
          },
        },
        y: {
          ...scaleDefaults,
          ticks: {
            ...scaleDefaults.ticks,
            font: { size: 10 },
            autoSkip: false,
          },
        },
      },
    }),
    [],
  )

  const topStoresBarOptions = useMemo<ChartOptions<'bar'>>(
    () => ({
      ...horizontalBarOptions,
      plugins: {
        ...horizontalBarOptions.plugins,
        legend: { display: false },
        tooltip: {
          ...defaultChartOptions.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const row = data.topStores[ctx.dataIndex]
              const sales = row?.sales ?? (typeof ctx.parsed.x === 'number' ? ctx.parsed.x : 0)
              const target = row?.target ?? 0
              const ach = row?.achievement
              const lines = [
                `Sales: ${Number(sales).toLocaleString()}`,
                `Target: ${Number(target).toLocaleString()}`,
              ]
              if (ach != null) {
                lines.push(`Achievement: ${ach}%`)
              }
              return lines
            },
          },
        },
      },
    }),
    [horizontalBarOptions, data.topStores],
  )

  const workingHoursChart = useMemo<ChartData<'bar'>>(
    () => ({
      labels: workingHours?.points.map((p) => p.label) ?? [],
      datasets: [
        {
          label: 'Avg working hours',
          data: workingHours?.points.map((p) => p.hours) ?? [],
          backgroundColor: chartGreen,
          borderRadius: 4,
          maxBarThickness: 36,
        },
      ],
    }),
    [workingHours],
  )

  const workingHoursOptions = useMemo<ChartOptions<'bar'>>(
    () => {
      const maxH = Math.max(0, ...(workingHours?.points.map((p) => p.hours) ?? [0]))
      const suggestedMax = maxH <= 0 ? 1 : Math.ceil(maxH * 1.25 * 10) / 10
      return {
        ...defaultChartOptions,
        plugins: {
          ...defaultChartOptions.plugins,
          legend: { display: false },
          tooltip: {
            ...defaultChartOptions.plugins.tooltip,
            displayColors: false,
            callbacks: {
              label: (ctx) => {
                const visits = workingHours?.points[ctx.dataIndex]?.count ?? 0
                const y = typeof ctx.parsed.y === 'number' ? ctx.parsed.y : 0
                return `${y.toFixed(2)} h avg · ${visits} ${visits === 1 ? 'visit' : 'visits'}`
              },
            },
          },
        },
        scales: {
          x: scaleDefaults,
          y: {
            ...scaleDefaults,
            beginAtZero: true,
            suggestedMax,
            ticks: { ...scaleDefaults.ticks, callback: (v) => `${v}h` },
          },
        },
      }
    },
    [workingHours],
  )

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}
      {loading && !dash && (
        <Card>
          <p className="text-sm text-slate-500">Loading live dashboard…</p>
        </Card>
      )}
      <Card className="!p-3 sm:!p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
              Date range
            </div>
            <div className="text-xs text-slate-400">{dateRangeLabel}</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyDatePreset(p.id)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                  datePreset === p.id
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {p.label}
              </button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              disabled={!dash || loading || downloading}
              onClick={() => void handleDownload()}
              className="ml-1"
            >
              <Download size={16} className="mr-1.5" />
              {downloading ? 'Downloading…' : 'Download'}
            </Button>
          </div>
        </div>
        {datePreset === 'custom' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">From</span>
              <input
                type="date"
                max={todayInputValue()}
                value={customFrom}
                onChange={(e) => handleCustomFrom(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">To</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                max={todayInputValue()}
                onChange={(e) => handleCustomTo(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </label>
          </div>
        )}
      </Card>

      <div className="space-y-3">
          <div className="relative z-10 grid grid-cols-2 gap-3 overflow-visible sm:grid-cols-3 xl:grid-cols-5">
            <BasListKpiCard
              label="Total Deployed BA's"
              value={
                cityStatus?.total ??
                (cityStatus
                  ? cityStatus.active + cityStatus.offline + cityStatus.break
                  : '—')
              }
              hint={baStatusHint}
              rows={totalBasRows}
              emptyText="No BA's"
              tone="forest"
              showTarget
            />
            <BasListKpiCard
              label="Active BA's"
              value={cityStatus?.active ?? '—'}
              hint={baStatusHint}
              rows={cityStatus?.activeBas ?? []}
              emptyText="No active BA's"
              tone="gold"
            />
            <BasListKpiCard
              label="Offline BA's"
              value={cityStatus?.offline ?? '—'}
              hint={baStatusHint}
              rows={cityStatus?.offlineBas ?? []}
              emptyText="No offline BA's"
              tone="forest"
            />
            <BasListKpiCard
              label="On Break BA's"
              value={cityStatus?.break ?? '—'}
              hint={baStatusHint}
              rows={cityStatus?.breakBas ?? []}
              emptyText="No on-break BA's"
              tone="gold"
            />
            <BasListKpiCard
              label="Inactive BA's"
              value={cityStatus?.inactive ?? cityStatus?.inactiveBas?.length ?? '—'}
              hint="Disabled · with reason"
              rows={cityStatus?.inactiveBas ?? []}
              emptyText="No inactive BA's"
              tone="forest"
            />
          </div>

          <div className="relative z-0 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <PremiumKpiCard
              label="Customers Intercepted"
              value={data.customersIntercepted.toLocaleString()}
              tone="cream"
            />
            <PremiumKpiCard
              label="Productive Calls"
              value={data.productiveCalls.toLocaleString()}
              tone="sage"
            />
            <PremiumKpiCard
              label="Productive %"
              value={`${data.productivePct}%`}
              tone="cream"
            />
            <PremiumKpiCard
              label="Target (Ltr/Kg)"
              value={data.targetLtrKg.toLocaleString()}
              tone="sage"
            />
            <PremiumKpiCard
              label="Sales (Ltr/Kg)"
              value={data.salesLtrKg.toLocaleString()}
              tone="cream"
            />
            <PremiumKpiCard
              label="Achievement"
              value={`${data.achievementPct}%`}
              tone="sage"
            />
          </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto]">
        <aside className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:flex lg:min-h-0 lg:flex-col">
          <TownStoreFilterPanel
            towns={towns}
            storesByTown={storesByTown}
            town={town}
            store={store}
            onSelectTown={handleTownChange}
            onSelectStore={handleStoreChange}
          />
          <FilterPanel
            title="Month"
            options={monthOptions}
            value={month}
            onChange={handleMonthChange}
            allowAll
            allLabel="All months"
          />
          <FilterPanel
            title="Brands"
            options={baPerformanceCategories}
            value={category}
            onChange={handleCategoryChange}
            allowAll
            allLabel="All Brands"
          />
          <FilterPanel
            title="SKU"
            options={skuOptions}
            value={sku}
            onChange={setSku}
            allowAll
            allLabel="All SKUs"
          />
        </aside>

        <Card padding={false} className="lg:col-start-2 lg:row-start-1">
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-50 px-4">
            <h3 className="truncate text-sm font-medium text-slate-700">{periodSalesTitle}</h3>
            <PeriodToggle value={salesPeriod} onChange={setSalesPeriod} />
          </div>
          <div className="p-3 sm:p-4">
            <div className={cn('relative mx-auto w-full max-w-sm', PERIOD_CHART_HEIGHT)}>
              <Doughnut data={periodSalesChart} options={periodSalesOptions} />
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-start-2 lg:row-start-2 lg:items-stretch">
          <Card padding={false} className="h-full">
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-50 px-4">
              <h3 className="truncate text-sm font-medium text-slate-700">
                Brand target vs sales
              </h3>
              <span className="shrink-0 text-right leading-tight">
                <span className="block text-xs font-semibold tabular-nums text-slate-600">
                  {timeGone.pct}% time gone
                </span>
                <span className="block text-[11px] tabular-nums text-slate-400">
                  Day {timeGone.day} of {timeGone.daysInMonth}
                </span>
              </span>
            </div>
            <div className="p-3 sm:p-4">
              <div className={cn('relative w-full', CHART_HEIGHT)}>
                <Bar data={brandTargetChart} options={brandTargetOptions} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {data.brandTargetVsSales.map((row) => (
                  <div
                    key={row.name}
                    className="rounded-lg bg-slate-50 px-2 py-1.5 text-center"
                    title={row.name}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {brandShortLabel(row.name)}
                    </div>
                    <div
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        row.achievement >= 100 ? 'text-brand-700' : 'text-slate-700',
                      )}
                    >
                      {row.achievement}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <ChartCard
            title={`Target vs sales ${scopeLabel}`}
            headerRight={
              <span
                className={cn(
                  'shrink-0 text-xs font-semibold tabular-nums',
                  targetVsSalesAchievementPct >= 100 ? 'text-brand-700' : 'text-slate-600',
                )}
                title="Sales ÷ Target"
              >
                {targetVsSalesAchievementPct}% of target
              </span>
            }
          >
            <Bar data={targetSalesChart} options={targetSalesOptions} />
          </ChartCard>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-start-2 lg:row-start-3 lg:items-stretch">
          <ChartCard title="Top 10 stores by performance" chartHeight={TOP10_CHART_HEIGHT}>
            <Bar data={topStoresChart} options={topStoresBarOptions} />
          </ChartCard>

          <ChartCard title="Top 5 selling SKU's" chartHeight={TOP10_CHART_HEIGHT}>
            <Bar data={topSkusChart} options={horizontalBarOptions} />
          </ChartCard>
        </div>
      </div>

      <Card padding={false}>
        <div className="border-b border-slate-50 px-4 py-3 sm:px-5">
          <CardHeader
            title="Active BA's by city"
            subtitle="Live now · checked-in vs offline by city"
          />
        </div>
        <TableScroll minWidth={520}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">S.No</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Stores</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Break</th>
                <th className="px-4 py-3">Offline</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {(cityStatus?.cities ?? []).map((row, index) => (
                <tr key={row.city} className="border-t border-slate-100">
                  <td className="px-4 py-3 tabular-nums text-slate-500">{index + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.city}</td>
                  <td className="px-4 py-3 text-slate-600">{row.stores}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">{row.active}</td>
                  <td className="px-4 py-3 text-amber-600">{row.break}</td>
                  <td className="px-4 py-3 text-slate-500">{row.offline}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.total}</td>
                </tr>
              ))}
              {!cityStatus && <EmptyRow cols={7} />}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Card padding={false}>
        <div className="border-b border-slate-50 px-4 py-3 sm:px-5">
          <CardHeader
            title="BA check-in / check-out"
            subtitle={
              isSingleDay
                ? `Overall BA's · ${dateRangeLabel}`
                : `Overall BA's · averages · ${dateRangeLabel}`
            }
          />
        </div>
        <TableScroll minWidth={720} className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">BA</th>
                <th className="px-4 py-3">Store</th>
                {!isSingleDay && <th className="px-4 py-3">Days worked</th>}
                <th className="px-4 py-3">{isSingleDay ? 'Check-in' : 'Avg check-in'}</th>
                <th className="px-4 py-3">{isSingleDay ? 'Check-out' : 'Avg check-out'}</th>
                <th className="px-4 py-3">{isSingleDay ? 'Working hrs' : 'Avg working hrs'}</th>
                {isSingleDay && <th className="px-4 py-3">Status</th>}
              </tr>
            </thead>
            <tbody>
              {attendanceTable.map((row) => (
                <tr key={`${row.ba}-${row.store}-${row.checkIn}-${row.days}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.ba}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{row.store}</div>
                    <div className="text-xs text-slate-400">{row.city}</div>
                  </td>
                  {!isSingleDay && <td className="px-4 py-3 tabular-nums">{row.days}</td>}
                  <td className="px-4 py-3 tabular-nums">{row.checkIn}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{row.checkOut}</td>
                  <td className="px-4 py-3 tabular-nums">{row.hours.toFixed(2)} h</td>
                  {isSingleDay && (
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status ?? ''} />
                    </td>
                  )}
                </tr>
              ))}
              {attendanceTable.length === 0 && <EmptyRow cols={6} />}
            </tbody>
          </table>
        </TableScroll>
      </Card>


      <Card padding={false}>
        <div className="border-b border-slate-50 px-4 py-3 sm:px-5">
          <CardHeader
            title="Target vs achievement"
            subtitle={
              targetVsAchievement?.monthLabel
                ? `${targetVsAchievement.monthLabel} targets for each store's ambassador`
                : 'BA targets from Ambassadors · sales from checkout forms'
            }
            action={
              <label className="flex items-center gap-2 text-xs">
                <span className="font-medium text-slate-500">Month</span>
                <select
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-brand-500"
                >
                  {targetMonthOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
        </div>
        <TableScroll minWidth={640} className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Ambassador</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Target KG</th>
                <th className="px-4 py-3">Sales KG</th>
                <th className="px-4 py-3">Achievement</th>
              </tr>
            </thead>
            <tbody>
              {targetRows.map((row) => (
                <tr key={row.ambassadorId} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.ambassador}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{row.store}</div>
                    {row.city ? <div className="text-xs text-slate-400">{row.city}</div> : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.target.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums">{row.sales.toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {row.achievement == null ? '—' : `${Math.round(row.achievement)}%`}
                  </td>
                </tr>
              ))}
              {targetRows.length === 0 && <EmptyRow cols={5} />}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Card>
        <CardHeader
          title="Average working hours"
          subtitle={`${dateRangeLabel} · ${
            !workingHours
              ? 'select a valid date range'
              : workingHours.avgHours === null
                ? 'no attendance for this selection'
                : `overall average ${workingHours.avgHours} h per BA visit${
                    range && range.end.toDateString() === new Date().toDateString()
                      ? ' (today counted up to now)'
                      : ''
                  }`
          }`}
          action={
            <label className="flex items-center gap-2 text-xs">
              <span className="font-medium text-slate-500">City</span>
              <select
                value={hoursCity ?? ''}
                onChange={(e) => setHoursCity(e.target.value || null)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-brand-500"
              >
                <option value="">All cities</option>
                {baCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        <div className="relative h-56 sm:h-72">
          {workingHours && workingHours.points.length > 0 ? (
            <Bar data={workingHoursChart} options={workingHoursOptions} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              No data to show
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
