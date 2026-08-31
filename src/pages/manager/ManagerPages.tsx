import { Link } from 'react-router-dom'
import { stores } from '../../data/mock'
import { Card, PageHeader, StatusBadge } from '../../components/ui'
import { MapPin } from 'lucide-react'

export function ManagerDashboard() {
  const store = stores[0]
  return (
    <div className="space-y-5">
      <PageHeader
        title="Store Operations"
        description={`${store.name} · live attendance, GPS & coverage`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="text-xs text-slate-500">Active BAs</div>
          <div className="text-2xl font-bold">3</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">GPS Online</div>
          <div className="text-2xl font-bold text-emerald-600">2</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Coverage</div>
          <div className="text-2xl font-bold">{store.coverage}%</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Today Footfall</div>
          <div className="text-2xl font-bold">{store.todayFootfall.toLocaleString()}</div>
        </Card>
      </div>
      <Card>
        <h3 className="mb-3 font-semibold">Live BA Status</h3>
        <div className="space-y-2">
          {store.assigned.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={14} className="text-brand-600" />
                {a.name}
              </div>
              <StatusBadge status={a.state} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Link to="/manager/attendance" className="text-sm font-semibold text-brand-600">
            Attendance →
          </Link>
          <Link to="/manager/coverage" className="text-sm font-semibold text-brand-600">
            Coverage →
          </Link>
        </div>
      </Card>
    </div>
  )
}

export function AttendancePage() {
  const rows = [
    { name: 'Ayesha Khan', in: '09:58', gps: 'Verified', status: 'Active' },
    { name: 'Hamza Ali', in: '10:05', gps: 'Verified', status: 'Active' },
    { name: 'Sara Ahmed', in: '10:12', gps: 'Nearby', status: 'Break' },
  ]
  return (
    <div>
      <PageHeader title="Attendance" description="Shift check-ins with mock GPS status" />
      <Card padding={false}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">BA</th>
              <th className="px-4 py-3">Check-in</th>
              <th className="px-4 py-3">GPS</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">{r.in}</td>
                <td className="px-4 py-3">{r.gps}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

export function CoveragePage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Store Coverage" description="Manager live coverage view" />
      <div className="grid gap-4 md:grid-cols-2">
        {stores.map((s) => (
          <Card key={s.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">
                  #{s.id} {s.name}
                </div>
                <div className="text-xs text-slate-500">{s.city}</div>
              </div>
              <StatusBadge status={s.status} />
            </div>
            <div className="mt-3 text-sm">
              Coverage <strong>{s.coverage}%</strong> · {s.bas} BAs
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
