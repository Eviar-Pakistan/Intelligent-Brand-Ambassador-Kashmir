import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Package, X } from 'lucide-react'
import { Button, Card, PageHeader, cn } from '../../components/ui'
import {
  fetchStockMatrix,
  type StockMatrixPayload,
  type StockStatus,
} from '../../lib/stocksApi'

const STATUS_STYLE: Record<
  StockStatus,
  { color: string; label: string; Icon: typeof Check }
> = {
  in_stock: {
    color: 'text-emerald-600',
    label: 'In Stock',
    Icon: Check,
  },
  near_out: {
    color: 'text-amber-500',
    label: 'Near Out of Stock',
    Icon: AlertTriangle,
  },
  out_of_stock: {
    color: 'text-red-600',
    label: 'Out of Stock',
    Icon: X,
  },
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function StocksPage() {
  const [data, setData] = useState<StockMatrixPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const next = await fetchStockMatrix()
      setData(next)
      if (!opts?.silent) setError(null)
    } catch (err) {
      if (!opts?.silent) {
        setError(err instanceof Error ? err.message : 'Could not load stock matrix')
        setData(null)
      }
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      void load({ silent: true })
    }, 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load({ silent: true })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const skus = data?.skus ?? []
  const stores = data?.stores ?? []
  const cells = data?.cells ?? {}
  const hasAnyStatus = stores.some((store) =>
    skus.some((sku) => Boolean(cells[sku.key]?.[String(store.storeId)]?.status)),
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stocks"
        description="Latest stock status per store from the last BA who checked out and submitted a report"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {(
          [
            ['in_stock', 'In Stock'],
            ['near_out', 'Near Out of Stock'],
            ['out_of_stock', 'Out of Stock'],
          ] as const
        ).map(([status, label]) => {
          const s = STATUS_STYLE[status]
          const Icon = s.Icon
          return (
            <span
              key={status}
              className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-slate-700')}
            >
              <Icon className={cn('h-4 w-4 shrink-0', s.color)} strokeWidth={2.5} />
              {label}
            </span>
          )
        })}
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</Card>
      )}

      {loading && !data ? (
        <Card className="px-4 py-10 text-center text-sm text-slate-500">Loading stock matrix…</Card>
      ) : !stores.length ? (
        <Card className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-slate-500">
          <Package className="h-8 w-8 text-slate-300" />
          No stores found.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {!hasAnyStatus && (
            <div className="border-b border-slate-200 bg-[#faf8f2] px-4 py-2 text-xs text-slate-500">
              No submitted stock yet — cells fill when a BA checks out and submits stock for a store.
            </div>
          )}
          <div className="max-h-[min(70vh,720px)] overflow-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#f3efe4]">
                  <th className="sticky left-0 z-30 min-w-[11rem] border-b border-r border-slate-200 bg-[#f3efe4] px-3 py-3 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
                    SKU
                  </th>
                  {stores.map((store) => (
                    <th
                      key={store.storeId}
                      className="min-w-[7.5rem] max-w-[9rem] border-b border-slate-200 px-2 py-2 align-bottom"
                      title={[
                        store.storeName,
                        store.city,
                        store.baName ? `Last BA: ${store.baName} (${store.baCode})` : '',
                        formatWhen(store.checkedOutAt || store.submittedAt),
                      ]
                        .filter(Boolean)
                        .join('\n')}
                    >
                      <div className="line-clamp-2 font-semibold text-slate-900">{store.storeName}</div>
                      <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
                        {store.city || '—'}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skus.map((sku, idx) => (
                  <tr key={sku.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#faf8f2]'}>
                    <th
                      className={cn(
                        'sticky left-0 z-10 border-r border-slate-200 px-3 py-2 text-left text-[11px] font-semibold text-slate-800',
                        idx % 2 === 0 ? 'bg-white' : 'bg-[#faf8f2]',
                      )}
                    >
                      {sku.label}
                    </th>
                    {stores.map((store) => {
                      const cell = cells[sku.key]?.[String(store.storeId)]
                      if (!cell?.status) {
                        return (
                          <td key={store.storeId} className="border-b border-slate-100 px-2 py-2 text-center text-slate-300">
                            —
                          </td>
                        )
                      }
                      const s = STATUS_STYLE[cell.status]
                      const Icon = s.Icon
                      return (
                        <td key={store.storeId} className="border-b border-slate-100 px-1.5 py-2">
                          <span
                            className="flex w-full items-center justify-center"
                            title={cell.label || s.label}
                          >
                            <Icon className={cn('h-5 w-5', s.color)} strokeWidth={2.5} />
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
