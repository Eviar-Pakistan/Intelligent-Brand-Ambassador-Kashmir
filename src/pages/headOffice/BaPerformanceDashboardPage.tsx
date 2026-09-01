import { useMemo, useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { RotateCcw, Search } from 'lucide-react'
import { Card, cn, KpiCard } from '../../components/ui'
import {
  aggregateBaPerformance,
  baPerformanceMonths,
  baPerformanceTowns,
  filterBaPerformanceRecords,
  getStoresForTown,
} from '../../data/baPerformance'

const CATEGORY_COLORS = ['#7ec99a', '#0b7a3e', '#d4a017']
const CHART_GREEN = '#0b7a3e'
const CHART_GREEN_LIGHT = '#7ec99a'
const CHART_GOLD = '#d4a017'
const GRID_STROKE = '#f1f5f9'
const AXIS_TICK = '#94a3b8'

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
  fontSize: 12,
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
          'overflow-y-auto',
          fill ? 'max-h-36 lg:max-h-none lg:min-h-0 lg:flex-1' : 'max-h-36',
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
        <div className={cn('w-full', CHART_HEIGHT)}>{children}</div>
      </div>
    </Card>
  )
}

export function BaPerformanceDashboardPage() {
  const [town, setTown] = useState('Faisalabad')
  const [month, setMonth] = useState('August')
  const [store, setStore] = useState<string | null>(null)

  const storeOptions = useMemo(() => getStoresForTown(town, month), [town, month])

  const filteredRecords = useMemo(
    () => filterBaPerformanceRecords({ town, month, store }),
    [town, month, store],
  )

  const data = useMemo(
    () => aggregateBaPerformance(filteredRecords, town, month),
    [filteredRecords, town, month],
  )

  function handleTownChange(next: string | null) {
    if (!next) return
    setTown(next)
    setStore(null)
  }

  function handleMonthChange(next: string | null) {
    if (!next) return
    setMonth(next)
    setStore(null)
  }

  const townBarData = [
    { name: 'Target', value: data.townTargetVsSales.target, fill: CHART_GREEN_LIGHT },
    { name: 'Sales', value: data.townTargetVsSales.sales, fill: CHART_GREEN },
  ]

  return (
    <div className="space-y-5">
  

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
          />
          <FilterPanel
            title="Month"
            options={baPerformanceMonths}
            value={month}
            onChange={handleMonthChange}
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
            <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.categorySales}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius="72%"
                      stroke="#fff"
                      strokeWidth={2}
                      label={({ name, value }) =>
                        `${name}\n${Number(value).toLocaleString()}`
                      }
                      labelLine={{ stroke: AXIS_TICK, strokeWidth: 1 }}
                    >
                      {data.categorySales.map((_, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => v.toLocaleString()}
                      contentStyle={tooltipStyle}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#64748b' }} />
                  </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`Target vs sales — ${town}`}>
            <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={townBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: AXIS_TICK }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: AXIS_TICK }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: number) => v.toLocaleString()}
                      contentStyle={tooltipStyle}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {townBarData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-start-2 lg:row-start-2 lg:grid-cols-3 lg:items-stretch">
          <ChartCard title="Week-wise sales (Ltr/Kg)">
            <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.weekSales}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: AXIS_TICK }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: AXIS_TICK }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: number) => v.toLocaleString()}
                      contentStyle={tooltipStyle}
                    />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke={CHART_GREEN}
                      strokeWidth={2}
                      dot={{ fill: CHART_GREEN, r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 4, fill: CHART_GOLD, strokeWidth: 0 }}
                    />
                  </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Top 5 stores">
            <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={data.topStores}
                    margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: AXIS_TICK }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="store"
                      width={88}
                      tick={{ fontSize: 9, fill: AXIS_TICK }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: number) => v.toLocaleString()}
                      contentStyle={tooltipStyle}
                    />
                    <Bar dataKey="sales" fill={CHART_GREEN_LIGHT} radius={[0, 3, 3, 0]} maxBarSize={20} />
                  </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Top 5 SKUs">
            <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={data.topSkus}
                    margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: AXIS_TICK }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="sku"
                      width={88}
                      tick={{ fontSize: 9, fill: AXIS_TICK }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: number) => v.toLocaleString()}
                      contentStyle={tooltipStyle}
                    />
                    <Bar dataKey="sales" fill={CHART_GREEN_LIGHT} radius={[0, 3, 3, 0]} maxBarSize={20} />
                  </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
