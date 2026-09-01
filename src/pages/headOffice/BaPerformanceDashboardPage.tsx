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
import { useBrand } from '../../context/BrandContext'
import {
  aggregateBaPerformance,
  baPerformanceMonths,
  baPerformanceTowns,
  filterBaPerformanceRecords,
  getStoresForTown,
} from '../../data/baPerformance'

const CATEGORY_COLORS = ['#f9b000', '#004d26', '#0b7a3e']
const CHART_GREEN = '#004d26'
const CHART_GOLD = '#f9b000'

type FilterPanelProps = {
  title: string
  options: string[]
  value: string | null
  onChange: (value: string | null) => void
  allowAll?: boolean
  allLabel?: string
}

function FilterPanel({ title, options, value, onChange, allowAll, allLabel = 'All' }: FilterPanelProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, query])

  return (
    <div className="overflow-hidden rounded-xl border border-navy-900/20 bg-white shadow-sm">
      <div className="flex items-center justify-between bg-navy-900 px-3 py-2">
        <span className="text-xs font-bold tracking-wide text-white">{title}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Clear filter"
            onClick={() => {
              onChange(allowAll ? null : options[0] ?? null)
              setQuery('')
            }}
            className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>
      <div className="border-b border-slate-100 px-2 py-1.5">
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1">
          <Search size={12} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
          />
        </div>
      </div>
      <div className="max-h-36 overflow-y-auto">
        {allowAll && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={`block w-full border-b border-slate-50 px-3 py-2 text-left text-xs transition ${
              value === null
                ? 'bg-brand-50 font-semibold text-brand-700'
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
            className={`block w-full border-b border-slate-50 px-3 py-2 text-left text-xs transition last:border-0 ${
              value === option
                ? 'bg-brand-50 font-semibold text-brand-700'
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

function KpiTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-gradient-to-b from-gold-400 via-gold-500 to-gold-600 px-3 py-3 text-center shadow-md shadow-gold-500/25 ring-1 ring-gold-600/30">
      <div className="text-[10px] font-bold tracking-wide text-navy-950/80 uppercase sm:text-[11px]">
        {label}
      </div>
      <div className="mt-1 text-xl font-black text-navy-950 sm:text-2xl">{value}</div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <h3 className="mb-3 border-b border-slate-100 pb-2 text-center text-xs font-bold tracking-wide text-navy-900 uppercase sm:text-sm">
        {title}
      </h3>
      {children}
    </div>
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
    { name: 'TOTAL TARGET', value: data.townTargetVsSales.target, fill: CHART_GREEN },
    { name: 'TOTAL SALES', value: data.townTargetVsSales.sales, fill: CHART_GOLD },
  ]

  return (
    <div className="-mx-3 space-y-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm sm:-mx-4 lg:-mx-6">
      {/* Dashboard banner */}


      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 bg-slate-200/80 p-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Customers Intercepted" value={data.customersIntercepted.toLocaleString()} />
        <KpiTile label="Productive Calls" value={data.productiveCalls.toLocaleString()} />
        <KpiTile label="Productive %" value={`${data.productivePct}%`} />
        <KpiTile label="Target (Ltr.Kg)" value={data.targetLtrKg.toLocaleString()} />
        <KpiTile label="Sales (Ltr.Kg)" value={data.salesLtrKg.toLocaleString()} />
        <KpiTile label="Achievement" value={`${data.achievementPct}%`} />
      </div>

      {/* Filters + charts */}
      <div className="flex flex-col gap-4 p-3 lg:flex-row lg:p-4">
        <aside className="grid w-full shrink-0 grid-cols-1 gap-3 sm:grid-cols-3 lg:w-52 lg:grid-cols-1">
          <FilterPanel
            title="TOWN"
            options={baPerformanceTowns}
            value={town}
            onChange={handleTownChange}
          />
          <FilterPanel
            title="MONTHS"
            options={baPerformanceMonths}
            value={month}
            onChange={handleMonthChange}
          />
          <FilterPanel
            title="STORES"
            options={storeOptions}
            value={store}
            onChange={setStore}
            allowAll
            allLabel="All stores"
          />
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Category Wise Sales">
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.categorySales}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius="72%"
                      label={({ name, value }) =>
                        `${name}\n${Number(value).toLocaleString()}`
                      }
                      labelLine
                    >
                      {data.categorySales.map((_, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => v.toLocaleString()} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title={`Town Wise Target vs Sales — ${town}`}>
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={townBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => v.toLocaleString()} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {townBarData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Week Wise Sales (Ltr.Kg)">
              <div className="h-52 sm:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.weekSales}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => v.toLocaleString()} />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke={CHART_GREEN}
                      strokeWidth={2.5}
                      dot={{ fill: CHART_GOLD, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Top 5 Stores by Sales (Ltr.Kg)">
              <div className="h-52 sm:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={data.topStores}
                    margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="store" width={88} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(v: number) => v.toLocaleString()} />
                    <Bar dataKey="sales" fill={CHART_GREEN} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Top 5 SKUs by Sales">
              <div className="h-52 sm:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={data.topSkus}
                    margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="sku" width={88} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(v: number) => v.toLocaleString()} />
                    <Bar dataKey="sales" fill={CHART_GREEN} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          <p className="text-center text-[11px] text-slate-500">
            {store
              ? `Showing ${store} · ${town} · ${month}`
              : `Showing all stores · ${town} · ${month}`}
            {' · '}
            {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
