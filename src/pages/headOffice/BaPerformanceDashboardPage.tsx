import { useMemo, useState, type ReactNode } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { RotateCcw, Search } from 'lucide-react'
import { Card, CardHeader, cn, KpiCard, StatusBadge, TableScroll } from '../../components/ui'
import {
  aggregateBaPerformance,
  baPerformanceMonths,
  baPerformanceTowns,
  filterBaPerformanceRecords,
  getStoresForTown,
} from '../../data/baPerformance'
import {
  activeBasByStore,
  baCheckInOutByStore,
  baCheckInOutTimeline,
} from '../../data/mock'
import {
  categoryColors,
  chartGold,
  chartGreen,
  chartGreenLight,
  chartGrid,
  chartTick,
  defaultChartOptions,
} from '../../lib/chartjs'
import type { ChartData, ChartOptions } from 'chart.js'

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
        'overflow-hidden rounded-xl border border-slate-100 bg-white',
        fill && 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-2">
        <span className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{title}</span>
        <button
          type="button"
          title="Clear filter"
          onClick={() => {
            onChange(allowAll ? null : options[0] ?? null)
            setQuery('')
          }}
          className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-600"
        >
          <RotateCcw size={12} />
        </button>
      </div>
      <div className="border-b border-slate-50 px-2 py-1.5">
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5">
          <Search size={12} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>
      <div
        className={cn(
          'overflow-y-auto overscroll-contain',
          fill ? 'max-h-52 sm:max-h-60 lg:max-h-72' : 'max-h-36',
        )}
      >
        {allowAll && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={`block w-full px-3 py-2 text-left text-xs transition ${
              value === null
                ? 'bg-brand-50/80 text-brand-700'
                : 'text-slate-600 hover:bg-slate-50'
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
                ? 'bg-brand-50/80 text-brand-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {option}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-slate-400">No matches</p>
        )}
      </div>
    </div>
  )
}

const CHART_HEIGHT = 'h-[220px]'

function ChartCard({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <Card padding={false} className={cn('h-full', className)}>
      <div className="flex h-11 shrink-0 items-center border-b border-slate-50 px-4">
        <h3 className="truncate text-sm font-medium text-slate-700">{title}</h3>
      </div>
      <div className="p-3 sm:p-4">
        <div className={cn('relative w-full', CHART_HEIGHT)}>{children}</div>
      </div>
    </Card>
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

const MONTH_ORDER = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function monthNameFromDate(d: Date) {
  return MONTH_ORDER[d.getMonth()]
}

/** Prefer exact month if present in data; otherwise nearest prior available month. */
function resolveDataMonth(monthName: string): string | null {
  if (baPerformanceMonths.includes(monthName)) return monthName
  const idx = MONTH_ORDER.indexOf(monthName)
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (baPerformanceMonths.includes(MONTH_ORDER[i])) return MONTH_ORDER[i]
  }
  return baPerformanceMonths[0] ?? null
}

function monthForPreset(preset: DatePreset, customFrom?: string, customTo?: string): string | null {
  const today = new Date()
  if (preset === 'ytd') return null
  if (preset === 'custom') {
    if (!customFrom || !customTo) return null
    const from = new Date(customFrom)
    const to = new Date(customTo)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
    const fromMonth = monthNameFromDate(from)
    const toMonth = monthNameFromDate(to)
    if (fromMonth === toMonth) return resolveDataMonth(fromMonth)
    return null
  }
  const d =
    preset === 'yesterday' ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1) : today
  return resolveDataMonth(monthNameFromDate(d))
}

export function BaPerformanceDashboardPage() {
  const [town, setTown] = useState<string | null>(null)
  const [month, setMonth] = useState<string | null>(() => monthForPreset('mtd'))
  const [store, setStore] = useState<string | null>(null)
  const [datePreset, setDatePreset] = useState<DatePreset>('mtd')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const storeOptions = useMemo(() => getStoresForTown(town, month), [town, month])

  const filteredRecords = useMemo(
    () => filterBaPerformanceRecords({ town, month, store }),
    [town, month, store],
  )

  const data = useMemo(
    () => aggregateBaPerformance(filteredRecords, town, month),
    [filteredRecords, town, month],
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

  function handleMonthChange(next: string | null) {
    setMonth(next)
    setStore(null)
    setDatePreset('custom')
  }

  const dateRangeLabel = useMemo(() => {
    if (datePreset === 'custom' && customFrom && customTo) {
      return `${customFrom} → ${customTo}`
    }
    return DATE_PRESETS.find((p) => p.id === datePreset)?.label ?? ''
  }, [datePreset, customFrom, customTo])

  const scopeLabel = data.townTargetVsSales.town

  const categoryChart = useMemo<ChartData<'doughnut'>>(
    () => ({
      labels: data.categorySales.map((c) => c.name),
      datasets: [
        {
          data: data.categorySales.map((c) => c.value),
          backgroundColor: categoryColors,
          borderColor: '#fff',
          borderWidth: 2,
        },
      ],
    }),
    [data.categorySales],
  )

  const categoryOptions = useMemo<ChartOptions<'doughnut'>>(
    () => ({
      ...defaultChartOptions,
      plugins: {
        ...defaultChartOptions.plugins,
        legend: { ...defaultChartOptions.plugins.legend, position: 'bottom' },
      },
      cutout: '55%',
    }),
    [],
  )

  const targetSalesChart = useMemo<ChartData<'bar'>>(
    () => ({
      labels: ['Target', 'Sales'],
      datasets: [
        {
          data: [data.townTargetVsSales.target, data.townTargetVsSales.sales],
          backgroundColor: [chartGreenLight, chartGreen],
          borderRadius: 4,
          maxBarThickness: 48,
        },
      ],
    }),
    [data.townTargetVsSales],
  )

  const targetSalesOptions = useMemo<ChartOptions<'bar'>>(
    () => ({
      ...defaultChartOptions,
      plugins: { ...defaultChartOptions.plugins, legend: { display: false } },
      scales: {
        x: scaleDefaults,
        y: { ...scaleDefaults, beginAtZero: true },
      },
    }),
    [],
  )

  const weekChart = useMemo<ChartData<'line'>>(
    () => ({
      labels: data.weekSales.map((w) => `W${w.week}`),
      datasets: [
        {
          label: 'Sales',
          data: data.weekSales.map((w) => w.sales),
          borderColor: chartGreen,
          backgroundColor: chartGreen,
          pointBackgroundColor: chartGreen,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: chartGold,
          tension: 0.35,
          borderWidth: 2,
        },
      ],
    }),
    [data.weekSales],
  )

  const weekOptions = useMemo<ChartOptions<'line'>>(
    () => ({
      ...defaultChartOptions,
      plugins: { ...defaultChartOptions.plugins, legend: { display: false } },
      scales: {
        x: scaleDefaults,
        y: { ...scaleDefaults, beginAtZero: true },
      },
    }),
    [],
  )

  const topStoresChart = useMemo<ChartData<'bar'>>(
    () => ({
      labels: data.topStores.map((s) => s.store),
      datasets: [
        {
          data: data.topStores.map((s) => s.sales),
          backgroundColor: chartGreenLight,
          borderRadius: 3,
          maxBarThickness: 18,
        },
      ],
    }),
    [data.topStores],
  )

  const topSkusChart = useMemo<ChartData<'bar'>>(
    () => ({
      labels: data.topSkus.map((s) => s.sku),
      datasets: [
        {
          data: data.topSkus.map((s) => s.sales),
          backgroundColor: chartGreenLight,
          borderRadius: 3,
          maxBarThickness: 18,
        },
      ],
    }),
    [data.topSkus],
  )

  const horizontalBarOptions = useMemo<ChartOptions<'bar'>>(
    () => ({
      ...defaultChartOptions,
      indexAxis: 'y',
      plugins: { ...defaultChartOptions.plugins, legend: { display: false } },
      scales: {
        x: { ...scaleDefaults, beginAtZero: true },
        y: {
          ...scaleDefaults,
          ticks: { ...scaleDefaults.ticks, font: { size: 9 } },
        },
      },
    }),
    [],
  )

  const checkInOutChart = useMemo<ChartData<'bar'>>(
    () => ({
      labels: baCheckInOutTimeline.map((r) => r.time),
      datasets: [
        {
          label: 'Check-in',
          data: baCheckInOutTimeline.map((r) => r.checkIn),
          backgroundColor: chartGreen,
          borderRadius: 4,
          maxBarThickness: 28,
        },
        {
          label: 'Check-out',
          data: baCheckInOutTimeline.map((r) => r.checkOut),
          backgroundColor: chartGold,
          borderRadius: 4,
          maxBarThickness: 28,
        },
      ],
    }),
    [],
  )

  const checkInOutOptions = useMemo<ChartOptions<'bar'>>(
    () => ({
      ...defaultChartOptions,
      scales: {
        x: scaleDefaults,
        y: { ...scaleDefaults, beginAtZero: true, ticks: { ...scaleDefaults.ticks, precision: 0 } },
      },
    }),
    [],
  )

  return (
    <div className="space-y-5">
      <Card className="!p-3 sm:!p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
              Date range
            </div>
            <div className="text-xs text-slate-400">{dateRangeLabel}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
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
          </div>
        </div>
        {datePreset === 'custom' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">From</span>
              <input
                type="date"
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
                onChange={(e) => handleCustomTo(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </label>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Customers Intercepted" value={data.customersIntercepted.toLocaleString()} />
        <KpiCard label="Productive Calls" value={data.productiveCalls.toLocaleString()} />
        <KpiCard label="Productive %" value={`${data.productivePct}%`} />
        <KpiCard label="Target (Ltr/Kg)" value={data.targetLtrKg.toLocaleString()} />
        <KpiCard label="Sales (Ltr/Kg)" value={data.salesLtrKg.toLocaleString()} />
        <KpiCard label="Achievement" value={`${data.achievementPct}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)] lg:grid-rows-[auto_auto]">
        <aside className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:flex lg:min-h-0 lg:flex-col">
          <FilterPanel
            title="Town"
            options={baPerformanceTowns}
            value={town}
            onChange={handleTownChange}
            allowAll
            allLabel="All towns"
          />
          <FilterPanel
            title="Month"
            options={baPerformanceMonths}
            value={month}
            onChange={handleMonthChange}
            allowAll
            allLabel="All months"
          />
          <FilterPanel
            title="Store"
            options={storeOptions}
            value={store}
            onChange={setStore}
            allowAll
            allLabel="All stores"
            fill
          />
        </aside>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-start-2 lg:row-start-1 lg:items-stretch">
          <ChartCard title="Category-wise sales">
            <Doughnut data={categoryChart} options={categoryOptions} />
          </ChartCard>

          <ChartCard title={`Target vs sales — ${scopeLabel}`}>
            <Bar data={targetSalesChart} options={targetSalesOptions} />
          </ChartCard>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-start-2 lg:row-start-2 lg:grid-cols-3 lg:items-stretch">
          <ChartCard title="Week-wise sales (Ltr/Kg)">
            <Line data={weekChart} options={weekOptions} />
          </ChartCard>

          <ChartCard title="Top 5 stores">
            <Bar data={topStoresChart} options={horizontalBarOptions} />
          </ChartCard>

          <ChartCard title="Top 5 SKUs">
            <Bar data={topSkusChart} options={horizontalBarOptions} />
          </ChartCard>
        </div>
      </div>

      <Card padding={false}>
        <div className="border-b border-slate-50 px-4 py-3 sm:px-5">
          <CardHeader title="Active BAs by store" subtitle="Live status today" />
        </div>
        <TableScroll minWidth={520}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Break</th>
                <th className="px-4 py-3">Offline</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {activeBasByStore.map((row) => (
                <tr key={row.storeId} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    #{row.storeId} {row.store}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.city}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">{row.active}</td>
                  <td className="px-4 py-3 text-amber-600">{row.break}</td>
                  <td className="px-4 py-3 text-slate-500">{row.offline}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Card padding={false}>
        <div className="border-b border-slate-50 px-4 py-3 sm:px-5">
          <CardHeader title="BA check-in / check-out" subtitle="Store-wise today" />
        </div>
        <TableScroll minWidth={640}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">BA</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Check-out</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {baCheckInOutByStore.map((row) => (
                <tr key={`${row.ba}-${row.store}-${row.checkIn}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.ba}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{row.store}</div>
                    <div className="text-xs text-slate-400">{row.city}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.checkIn}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{row.checkOut}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Card>
        <CardHeader title="BA check-in & check-out by time" subtitle="Hourly activity today" />
        <div className="relative h-56 sm:h-72">
          <Bar data={checkInOutChart} options={checkInOutOptions} />
        </div>
      </Card>
    </div>
  )
}
