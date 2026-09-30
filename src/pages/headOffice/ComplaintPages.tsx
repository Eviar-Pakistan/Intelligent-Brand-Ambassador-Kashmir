import { useMemo, useState } from 'react'
import { MessageSquareWarning, CheckCircle2, Clock3, Eye, User } from 'lucide-react'
import {
  Button,
  Card,
  Modal,
  PageHeader,
  StatusBadge,
  TableScroll,
  Tabs,
  cn,
} from '../../components/ui'
import { useComplaints } from '../../context/ComplaintsContext'
import {
  formatComplaintDate,
  kindLabel,
  type Complaint,
  type ComplaintKind,
  type ComplaintStatus,
} from '../../data/complaints'

type KindFilter = 'All' | 'Customer Complaint' | 'BA Complaint' | 'Insights'

const KIND_TABS: { id: KindFilter; match: ComplaintKind | null }[] = [
  { id: 'All', match: null },
  { id: 'Customer Complaint', match: 'customer' },
  { id: 'BA Complaint', match: 'ba' },
  { id: 'Insights', match: 'insights' },
]

export function ComplaintsPage() {
  const { complaints, loading, refreshComplaints, updateComplaintStatus } = useComplaints()
  const [kindTab, setKindTab] = useState<KindFilter>('All')
  const [statusTab, setStatusTab] = useState('All')
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [note, setNote] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const kindMatch = KIND_TABS.find((t) => t.id === kindTab)?.match
    return complaints.filter((c) => {
      if (kindMatch && c.kind !== kindMatch) return false
      if (statusTab !== 'All' && c.status !== statusTab) return false
      return true
    })
  }, [complaints, kindTab, statusTab])

  const counts = useMemo(
    () => ({
      customer: complaints.filter((c) => c.kind === 'customer').length,
      ba: complaints.filter((c) => c.kind === 'ba').length,
      insights: complaints.filter((c) => c.kind === 'insights').length,
      open: complaints.filter((c) => c.status === 'Open').length,
      review: complaints.filter((c) => c.status === 'In Review').length,
      resolved: complaints.filter((c) => c.status === 'Resolved').length,
    }),
    [complaints],
  )

  function openDetail(c: Complaint) {
    setSelected(c)
    setNote(c.hoNote ?? '')
  }

  async function setStatus(status: ComplaintStatus) {
    if (!selected || saving) return
    setSaving(true)
    try {
      await updateComplaintStatus(selected.id, status, note.trim() || undefined)
      setToast(`${selected.id} marked ${status}`)
      setSelected(null)
      setTimeout(() => setToast(null), 2800)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not update status')
      setTimeout(() => setToast(null), 3200)
    } finally {
      setSaving(false)
    }
  }

  const showCustomerCols = kindTab === 'Customer Complaint'
  const showInsightsCols = kindTab === 'Insights'
  const showBaCols = kindTab === 'BA Complaint'
  const showAllCols = kindTab === 'All'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Insights / Complaint Center"
        description={
          loading
            ? 'Loading reports…'
            : 'Review customer product complaints, BA store complaints, and field insights'
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refreshComplaints()}>
            Refresh
          </Button>
        }
      />

      {toast && (
        <div className="animate-fade-up rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <User size={14} /> Customer
          </div>
          <div className="mt-1 text-2xl font-bold text-navy-900">{counts.customer}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MessageSquareWarning size={14} /> BA
          </div>
          <div className="mt-1 text-2xl font-bold text-navy-900">{counts.ba}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MessageSquareWarning size={14} /> Open
          </div>
          <div className="mt-1 text-2xl font-bold text-rose-600">{counts.open}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Eye size={14} /> In review
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{counts.review}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 size={14} /> Resolved
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{counts.resolved}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {KIND_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setKindTab(t.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                kindTab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {t.id}
            </button>
          ))}
        </div>
        <Tabs
          tabs={['All', 'Open', 'In Review', 'Resolved', 'Rejected']}
          value={statusTab}
          onChange={setStatusTab}
        />
      </div>

      <Card padding={false}>
        <TableScroll minWidth={showCustomerCols ? 980 : 920}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              {showCustomerCols && (
                <tr>
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Number</th>
                  <th className="px-4 py-3 font-semibold">Brand</th>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Complaint</th>
                  <th className="px-4 py-3 font-semibold">Image</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              )}
              {showBaCols && (
                <tr>
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">Reported by</th>
                  <th className="px-4 py-3 font-semibold">Detail</th>
                  <th className="px-4 py-3 font-semibold">Complaint</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              )}
              {showInsightsCols && (
                <tr>
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">BA</th>
                  <th className="px-4 py-3 font-semibold">Store</th>
                  <th className="px-4 py-3 font-semibold">Subject</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              )}
              {showAllCols && (
                <tr>
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Reported by</th>
                  <th className="px-4 py-3 font-semibold">Detail</th>
                  <th className="px-4 py-3 font-semibold">Complaint</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => {
                if (showCustomerCols) {
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.id}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {c.customerName ?? '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">
                        {c.customerPhone ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{c.brand ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{c.sku ?? '—'}</td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-slate-700">
                        {c.details}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{c.imageName ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={12} />
                          {formatComplaintDate(c.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => openDetail(c)}>
                          Review
                        </Button>
                      </td>
                    </tr>
                  )
                }

                if (showBaCols) {
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.id}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{c.baName}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{c.storeName}</div>
                        <div className="text-xs text-slate-500">{c.category}</div>
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-slate-700">
                        {c.subject}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={12} />
                          {formatComplaintDate(c.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => openDetail(c)}>
                          Review
                        </Button>
                      </td>
                    </tr>
                  )
                }

                if (showInsightsCols) {
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.id}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{c.baName}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {c.storeName} · {c.city}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 font-semibold text-slate-900">
                        {c.subject}
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-slate-600">
                        {c.details}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={12} />
                          {formatComplaintDate(c.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => openDetail(c)}>
                          Review
                        </Button>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={c.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.id}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                          c.kind === 'customer' && 'bg-rose-50 text-rose-700',
                          c.kind === 'ba' && 'bg-sky-50 text-sky-700',
                          c.kind === 'insights' && 'bg-brand-50 text-brand-700',
                        )}
                      >
                        {kindLabel(c.kind)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {c.kind === 'customer' ? (c.customerName ?? c.baName) : c.baName}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">
                        {c.kind === 'customer'
                          ? `${c.brand ?? 'Kashmir'}`
                          : c.storeName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {c.kind === 'customer'
                          ? c.sku ?? c.productCategory
                          : c.category}
                      </div>
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-slate-700">
                      {c.kind === 'customer' ? c.details : c.subject}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={12} />
                        {formatComplaintDate(c.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="secondary" onClick={() => openDetail(c)}>
                        Review
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                    No complaints in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          selected
            ? selected.kind === 'customer'
              ? `Customer complaint ${selected.id}`
              : selected.kind === 'insights'
                ? `Insights ${selected.id}`
                : `BA complaint ${selected.id}`
            : 'Complaint'
        }
      >
        {selected && (
          <div className="space-y-4">
            {selected.kind === 'customer' ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Meta label="Type" value="Customer Complaint" />
                  <Meta label="Store" value={`${selected.storeName} · ${selected.city}`} />
                  <Meta label="Logged by" value={selected.baName} />
                  <Meta label="Name" value={selected.customerName ?? '—'} />
                  <Meta label="Number" value={selected.customerPhone ?? '—'} />
                  <Meta label="Brand" value={selected.brand ?? '—'} />
                  <Meta label="SKU" value={selected.sku ?? '—'} />
                  <Meta label="Status" value={selected.status} />
                </div>
                <div>
                  <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Complaint
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {selected.details}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Meta
                    label="Type"
                    value={selected.kind === 'insights' ? 'Insights' : 'BA Complaint'}
                  />
                  <Meta label="Brand Ambassador" value={selected.baName} />
                  <Meta label="Store" value={`${selected.storeName} · ${selected.city}`} />
                  {selected.kind === 'ba' && (
                    <Meta label="Category" value={selected.category} />
                  )}
                  <Meta label="Status" value={selected.status} />
                </div>
                <div>
                  <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Subject
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">{selected.subject}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Details
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {selected.details}
                  </p>
                </div>
              </>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">HO note</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Internal note or resolution comment"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
            </label>

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => void setStatus('In Review')}
              >
                Mark In Review
              </Button>
              <Button variant="success" disabled={saving} onClick={() => void setStatus('Resolved')}>
                Resolve
              </Button>
              <Button variant="danger" disabled={saving} onClick={() => void setStatus('Rejected')}>
                Reject
              </Button>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-900">{value}</div>
    </div>
  )
}
