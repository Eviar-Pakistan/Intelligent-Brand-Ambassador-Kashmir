import { useMemo, useState, type ReactNode } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { RotateCcw, Search } from 'lucide-react'
import { Card, CardHeader, cn, KpiCard, StatusBadge, TableScroll } from '../../components/ui'
import {
  aggregateBaPerformance,
  baPerformanceMonths,
  baPerformanceTowns,
  collectPeriodRecords,
  getStoresForTown,
  MONTH_ORDER,
  periodsForRange,
  resolveDataMonth,
  type DataPeriod,
} from '../../data/baPerformance'
import {
  attendanceForRange,
  attendanceRows,
  baCities,
  baStatusByCity,
  daysInRange,
  workingHoursSeries,
} from '../../data/baAttendance'
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
import { IncentiveKpiCard } from './IncentiveKpiSettings'

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr className="border-t border-slate-100">
      <td colSpan={cols} className="px-4 py-6 text-center text-sm text-slate-400">
        No data for this selection
      </td>
    </tr>
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
    if (fromMonth === toMonth) return resolveDataMonth(fromMonth)
    return null
  }
  const d =
    preset === 'yesterday' ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1) : today
  return resolveDataMonth(monthNameFromDate(d))
}

function todayInputValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateInput(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
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
  const [datePreset, setDatePreset] = useState<DatePreset>('mtd')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const range = useMemo(
    () => dateRangeForPreset(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  )

  // Performance data is monthly. A valid date range picks the months (and days of each month)
  // it covers; otherwise the Month panel decides (one month, or all months when empty).
  const rangePeriods = useMemo(
    () => (range ? periodsForRange(range.start, range.end) : null),
    [range],
  )
  const periods = useMemo<DataPeriod[]>(
    () => rangePeriods?.periods ?? [{ month, share: null }],
    [rangePeriods, month],
  )
  const storeOptions = useMemo(
    () => getStoresForTown(town, periods.some((p) => p.month === null) ? null : periods.map((p) => p.month as string)),
    [town, periods],
  )

  const data = useMemo(
    () => aggregateBaPerformance(collectPeriodRecords({ town, store }, periods), town),
    [town, store, periods],
  )

  const dataNote = useMemo(() => {
    if (!rangePeriods) return null
    if (rangePeriods.fallback) {
      return `No ${rangePeriods.fallback.wanted} data yet — showing ${rangePeriods.fallback.used} figures`
    }
    if (rangePeriods.missing.length > 0) return `No sales data for ${rangePeriods.missing.join(', ')}`
    return null
  }, [rangePeriods])

  const attendance = useMemo(() => (range ? attendanceForRange(range) : []), [range])
  const cityStatus = useMemo(() => (range ? baStatusByCity(range) : null), [range])
  const isSingleDay = range ? daysInRange(range) === 1 : false
  const attendanceTable = useMemo(
    () => attendanceRows(attendance, isSingleDay),
    [attendance, isSingleDay],
  )
  const [hoursCity, setHoursCity] = useState<string | null>(null)
  const workingHours = useMemo(
    () => (range ? workingHoursSeries(attendance, range, hoursCity) : null),
    [attendance, range, hoursCity],
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
    // A month picked by hand replaces any date range, so the whole month is shown
    setCustomFrom('')
    setCustomTo('')
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

  const baStatusHint = !cityStatus
    ? 'Select a valid date range'
    : cityStatus.days > 1
      ? `Avg per day · ${cityStatus.days} days`
      : undefined

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
    () => ({
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
              return `${ctx.parsed.y} h avg · ${visits} ${visits === 1 ? 'visit' : 'visits'}`
            },
          },
        },
      },
      scales: {
        x: scaleDefaults,
        y: {
          ...scaleDefaults,
          beginAtZero: true,
          ticks: { ...scaleDefaults.ticks, callback: (v) => `${v}h` },
        },
      },
    }),
    [workingHours],
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
            {dataNote && <div className="text-xs text-amber-600">{dataNote}</div>}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Active BAs" value={cityStatus?.active ?? '—'} hint={baStatusHint} />
        <KpiCard label="Offline BAs" value={cityStatus?.offline ?? '—'} hint={baStatusHint} />
        <KpiCard label="On Break BAs" value={cityStatus?.break ?? '—'} hint={baStatusHint} />
      </div>

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
          <CardHeader
            title="Active BAs by city"
            subtitle={
              cityStatus && cityStatus.days > 1
                ? `${dateRangeLabel} · average per day`
                : dateRangeLabel
            }
          />
        </div>
        <TableScroll minWidth={520}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Stores</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Break</th>
                <th className="px-4 py-3">Offline</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {(cityStatus?.cities ?? []).map((row) => (
                <tr key={row.city} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.city}</td>
                  <td className="px-4 py-3 text-slate-600">{row.stores}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">{row.active}</td>
                  <td className="px-4 py-3 text-amber-600">{row.break}</td>
                  <td className="px-4 py-3 text-slate-500">{row.offline}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.total}</td>
                </tr>
              ))}
              {!cityStatus && <EmptyRow cols={6} />}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Card padding={false}>
        <div className="border-b border-slate-50 px-4 py-3 sm:px-5">
          <CardHeader
            title="BA check-in / check-out"
            subtitle={isSingleDay ? `Store-wise · ${dateRangeLabel}` : `Per BA average · ${dateRangeLabel}`}
          />
        </div>
        <TableScroll minWidth={720}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
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
                <tr key={`${row.ba}-${row.store}-${row.checkIn}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.ba}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{row.store}</div>
                    <div className="text-xs text-slate-400">{row.city}</div>
                  </td>
                  {!isSingleDay && <td className="px-4 py-3 tabular-nums">{row.days}</td>}
                  <td className="px-4 py-3 tabular-nums">{row.checkIn}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{row.checkOut}</td>
                  <td className="px-4 py-3 tabular-nums">{row.hours.toFixed(1)} h</td>
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

      <IncentiveKpiCard />

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
