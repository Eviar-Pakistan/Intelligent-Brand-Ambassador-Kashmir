import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  GraduationCap,
  MessageSquare,
  Trophy,
  ArrowLeft,
  LogOut,
} from 'lucide-react'
import { useEffect } from 'react'
import { useRole, type Role } from '../context/AppContext'
import { cn } from './ui'
import { useBrand } from '../context/BrandContext'

/** Sync active role from URL prefix so each experience stays isolated. */
export function RoleSync({ role }: { role: Role }) {
  const { setRole } = useRole()
  useEffect(() => {
    setRole(role)
  }, [role, setRole])
  return null
}

const baTabs = [
  { to: '/ba/home', label: 'Home', icon: Home, end: true },
  { to: '/ba/training', label: 'Training', icon: GraduationCap },
  { to: '/ba/assistance', label: 'Assist', icon: MessageSquare },
  { to: '/ba/performance', label: 'Rewards', icon: Trophy },
]

export function BaShell() {
  const navigate = useNavigate()
  const { brand } = useBrand()
  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50">
      <RoleSync role="ba" />
      <header className="safe-top sticky top-0 z-20 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-brand-600 uppercase">
              {brand.productName} · BA
            </div>
            <div className="truncate text-sm font-bold text-slate-900">Ayesha Khan · Store #12</div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <LogOut size={13} /> Exit
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 overflow-x-hidden overflow-y-auto px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-4 sm:pb-24">
        <Outlet />
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {baTabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold',
                  isActive ? 'text-brand-600' : 'text-slate-400',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

const shopperSteps = [
  '/shopper',
  '/shopper/product',
  '/shopper/learn',
  '/shopper/spin',
  '/shopper/ai',
  '/shopper/survey',
  '/shopper/reward',
  '/shopper/feedback',
]

export function ShopperShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { brand } = useBrand()
  const stepIndex = Math.max(
    0,
    shopperSteps.findIndex((s) => s === pathname || (s !== '/shopper' && pathname.startsWith(s))),
  )
  const progress = ((stepIndex + 1) / shopperSteps.length) * 100
  const backTo = stepIndex > 0 ? shopperSteps[stepIndex - 1] : null
  const hideChrome = pathname === '/shopper' || pathname === '/shopper/spin'

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      <RoleSync role="shopper" />
      {!hideChrome && (
        <header className="safe-top sticky top-0 z-20 border-b border-slate-100 bg-white">
          <div className="mx-auto flex max-w-lg items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
            {backTo ? (
              <Link to={backTo} className="rounded-lg p-1 text-slate-500 hover:bg-slate-50">
                <ArrowLeft size={18} />
              </Link>
            ) : (
              <span className="w-7" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-brand-600 uppercase">
                {brand.productName}
              </div>
              <div className="truncate text-sm font-semibold text-slate-900">In-store experience</div>
            </div>
            <button
              onClick={() => navigate('/login')}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
            >
              Exit
            </button>
          </div>
          <div className="h-1 bg-slate-100">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </header>
      )}
      <main className="mx-auto w-full max-w-lg flex-1 overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
        <Outlet />
      </main>
    </div>
  )
}
