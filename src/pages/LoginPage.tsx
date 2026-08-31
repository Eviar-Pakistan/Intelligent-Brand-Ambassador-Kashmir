import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRole, type Role, roleMeta } from '../context/AppContext'
import { useBrand } from '../context/BrandContext'
import { Button } from '../components/ui'

const roles: Role[] = ['headOffice', 'admin', 'storeManager', 'ba', 'shopper']

export function LoginPage() {
  const navigate = useNavigate()
  const { setRole } = useRole()
  const { brand } = useBrand()

  function enter(role: Role) {
    setRole(role)
    navigate(roleMeta[role].home)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    enter('headOffice')
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-black p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <img
          src={brand.sidebar}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-55"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />
        <div className="relative">
          <img src={brand.logo} alt={brand.productName} className="h-16 w-auto object-contain" />
          <h1 className="mt-8 max-w-md text-4xl font-bold leading-tight">
            Intelligent Brand Ambassador Ecosystem
          </h1>
          <p className="mt-4 max-w-sm text-white/75">
            {brand.productName} · Five separate experiences — Head Office, Admin, Store Manager, BA
            app, and Shopper web.
          </p>
        </div>
        <div className="relative space-y-2 text-sm text-white/60">
          <div>Head Office — Command Center</div>
          <div>Administrator — Platform settings</div>
          <div>Store Manager — Field operations</div>
          <div>Brand Ambassador — Mobile app</div>
          <div>Shopper — In-store web journey</div>
        </div>
      </div>

      <div className="flex items-center justify-center bg-surface px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <img src={brand.logo} alt={brand.productName} className="h-12 w-auto object-contain" />
          </div>

          <Link to="/portal" className="inline-block text-xs font-medium text-slate-500 hover:text-brand-600 hover:underline">
            Browse all experiences →
          </Link>
          <h2 className="mt-4 text-2xl font-bold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">
            {brand.productName} · Or jump straight into a role experience
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
              <input
                key={brand.loginEmail}
                type="email"
                defaultValue={brand.loginEmail}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Password</span>
              <input
                type="password"
                defaultValue="••••••••"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <Button type="submit" className="w-full" size="lg">
              Sign In as Head Office
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            Enter as
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid gap-2">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => enter(r)}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm hover:border-brand-500/40 hover:bg-brand-50"
              >
                <span className="font-medium text-slate-800">{roleMeta[r].label}</span>
                <span className="text-[11px] text-slate-400">{roleMeta[r].tone}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
