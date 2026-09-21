import { useMemo, useState } from 'react'
import { MessageSquareWarning, CheckCircle2, Clock3, Eye } from 'lucide-react'
import {
  Button,
  Card,
  Modal,
  PageHeader,
  StatusBadge,
  TableScroll,
  Tabs,
} from '../../components/ui'
import { useComplaints } from '../../context/ComplaintsContext'
import { formatComplaintDate, type Complaint, type ComplaintStatus } from '../../data/complaints'

export function ComplaintsPage() {
  const { complaints, updateComplaintStatus } = useComplaints()
  const [tab, setTab] = useState('All')
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [note, setNote] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (tab === 'All') return complaints
    return complaints.filter((c) => c.status === tab)
  }, [complaints, tab])

  const counts = useMemo(
    () => ({
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

  function setStatus(status: ComplaintStatus) {
    if (!selected) return
    updateComplaintStatus(selected.id, status, note.trim() || undefined)
    setToast(`Complaint ${selected.id} marked ${status}`)
    setSelected(null)
    setTimeout(() => setToast(null), 2800)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Complaint Center"
        description="Review and resolve Brand Ambassador store complaints"
      />

      {toast && (
        <div className="animate-fade-up rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
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

      <Tabs
        tabs={['All', 'Open', 'In Review', 'Resolved', 'Rejected']}
        value={tab}
        onChange={setTab}
      />

      <Card padding={false}>
        <TableScroll minWidth={860}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">BA</th>
                <th className="px-4 py-3 font-semibold">Store</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Submitted</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.id}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{c.baName}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{c.storeName}</div>
                    <div className="text-xs text-slate-500">{c.city}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{c.category}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-700">{c.subject}</td>
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
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
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
        title={selected ? `Complaint ${selected.id}` : 'Complaint'}
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Meta label="Brand Ambassador" value={selected.baName} />
              <Meta label="Store" value={`${selected.storeName} · ${selected.city}`} />
              <Meta label="Category" value={selected.category} />
              <Meta label="Status" value={selected.status} />
            </div>

            <div>
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Subject</div>
              <p className="mt-1 text-sm font-semibold text-slate-900">{selected.subject}</p>
            </div>

            <div>
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Details</div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {selected.details}
              </p>
            </div>

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
              <Button variant="secondary" onClick={() => setStatus('In Review')}>
                Mark In Review
              </Button>
              <Button variant="success" onClick={() => setStatus('Resolved')}>
                Resolve
              </Button>
              <Button variant="danger" onClick={() => setStatus('Rejected')}>
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
