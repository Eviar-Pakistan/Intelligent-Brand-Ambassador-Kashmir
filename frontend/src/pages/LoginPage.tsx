import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useRole, type Role, roleMeta } from '../context/AppContext'
import { useBrand } from '../context/BrandContext'
import { Button } from '../components/ui'
import {
  authenticate,
  emailInUse,
  fetchSupervisorLoginOptions,
  loginSupervisorWithApi,
  signIn,
  signOut,
  syncSupervisorsFromApi,
  type SupervisorLoginOption,
} from '../lib/supervisors'
import { baEmailInUse, baSignOut, syncAmbassadorsFromApi } from '../lib/baAccounts'
import { loginWithEmail, logoutApi } from '../lib/auth'
import { ApiError } from '../lib/api'
import { syncStoresFromApi } from '../lib/storeRegistry'

type LoginMode = 'headOffice' | 'supervisor'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setRole } = useRole()
  const { brand } = useBrand()
  const [mode, setMode] = useState<LoginMode>('headOffice')
  const [email, setEmail] = useState(brand.loginEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [supervisorOptions, setSupervisorOptions] = useState<SupervisorLoginOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    void fetchSupervisorLoginOptions()
      .then((rows) => {
        if (cancelled) return
        setSupervisorOptions(rows)
        setEmail((prev) => {
          if (mode === 'supervisor' && rows.length && !rows.some((r) => r.email === prev)) {
            return rows[0].email
          }
          return prev
        })
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode])

  function enter(role: Role) {
    setRole(role)
    if (role === 'headOffice') {
      const from = (location.state as { from?: string } | null)?.from
      if (
        typeof from === 'string' &&
        (from.startsWith('/ho') || from.startsWith('/admin') || from.startsWith('/manager'))
      ) {
        navigate(from)
        return
      }
    }
    navigate(roleMeta[role].home)
  }

  function switchMode(next: LoginMode) {
    setMode(next)
    setError(null)
    if (next === 'headOffice') {
      setEmail(brand.loginEmail)
      setPassword('')
    } else if (supervisorOptions.length) {
      setEmail(supervisorOptions[0].email)
      setPassword('')
    } else {
      setEmail('')
      setPassword('')
    }
  }

  function validateFields(): string | null {
    const trimmedEmail = email.trim()
    if (mode === 'supervisor') {
      if (!trimmedEmail) return 'Select your email from the list.'
      if (supervisorOptions.length === 0) return 'No supervisors yet — ask Head Office.'
    } else {
      if (!trimmedEmail) return 'Email is required.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return 'Enter a valid email address.'
    }
    if (!password) return 'Password is required.'
    if (password.length < 4) return 'Password must be at least 4 characters.'
    return null
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const validationError = validateFields()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setBusy(true)

    try {
      if (mode === 'supervisor') {
        try {
          const supervisor = await loginSupervisorWithApi(email, password)
          if (supervisor) {
            setRole('supervisor')
            navigate(roleMeta.supervisor.home)
            return
          }
          setError('This account is not a supervisor.')
          return
        } catch (err) {
          // Fall back to local/offline seed if present
          if (emailInUse(email)) {
            const supervisor = authenticate(email, password)
            if (!supervisor) {
              setError('Incorrect password.')
              return
            }
            logoutApi()
            setRole('supervisor')
            signIn(supervisor.id)
            navigate(roleMeta.supervisor.home)
            return
          }
          const msg =
            err instanceof ApiError
              ? err.status === 401
                ? 'Incorrect password.'
                : err.message
              : 'Could not reach the server. Is the backend running on port 8000?'
          setError(msg)
          return
        }
      }

      // Head Office path
      if (baEmailInUse(email)) {
        setError('Brand Ambassadors open their personal account link. Ask Head Office for it.')
        return
      }

      // If they typed a supervisor email on HO tab, still route correctly
      try {
        const supervisor = await loginSupervisorWithApi(email, password)
        if (supervisor) {
          setRole('supervisor')
          navigate(roleMeta.supervisor.home)
          return
        }
      } catch {
        // continue to HO
      }

      if (emailInUse(email)) {
        const supervisor = authenticate(email, password)
        if (!supervisor) {
          setError('Incorrect email or password.')
          return
        }
        logoutApi()
        setRole('supervisor')
        signIn(supervisor.id)
        navigate(roleMeta.supervisor.home)
        return
      }

      await loginWithEmail(email, password)
      signOut()
      baSignOut()
      try {
        await Promise.all([
          syncStoresFromApi(),
          syncAmbassadorsFromApi(),
          syncSupervisorsFromApi(),
        ])
      } catch {
        // best-effort
      }
      enter('headOffice')
    } catch (err) {
      logoutApi()
      const msg =
        err instanceof ApiError
          ? err.status === 401
            ? 'Incorrect email or password.'
            : err.message
          : 'Could not reach the server. Is the backend running on port 8000?'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-black p-8 text-white xl:p-12 lg:flex lg:flex-col lg:justify-between">
        <img
          src={brand.sidebar}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-55"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />
        <div className="relative">
          <img src={brand.logo} alt={brand.productName} className="h-16 w-auto object-contain" />
          <h1 className="mt-8 max-w-md text-3xl font-bold leading-tight xl:text-4xl">
            Intelligent Brand Ambassador Ecosystem
          </h1>
        </div>
      </div>

      <div className="safe-bottom flex items-center justify-center bg-surface px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-md">
          <div className="mb-4 lg:mb-6 lg:hidden">
            <img src={brand.logo} alt={brand.productName} className="h-10 w-auto object-contain sm:h-12" />
          </div>

          <h2 className="mt-4 text-xl font-bold text-slate-900 sm:text-2xl">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">{brand.productName}</p>

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => switchMode('supervisor')}
              className={`rounded-lg px-3 py-2 transition ${
                mode === 'supervisor' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Supervisor
            </button>
            <button
              type="button"
              onClick={() => switchMode('headOffice')}
              className={`rounded-lg px-3 py-2 transition ${
                mode === 'headOffice' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Head Office
            </button>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {mode === 'supervisor' ? (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Your email</span>
                <select
                  value={email}
                  required
                  disabled={loadingOptions || supervisorOptions.length === 0}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError(null)
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
                >
                  {loadingOptions && <option value="">Loading supervisors…</option>}
                  {!loadingOptions && supervisorOptions.length === 0 && (
                    <option value="">No supervisors yet — ask Head Office</option>
                  )}
                  {!loadingOptions && supervisorOptions.length > 0 && !email && (
                    <option value="">Select email</option>
                  )}
                  {supervisorOptions.map((opt) => (
                    <option key={opt.email} value={opt.email}>
                      {opt.email}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-400">
                  Pick the auto-generated email Head Office created for you, then enter your password.
                </p>
              </label>
            ) : (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  placeholder="you@company.com"
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError(null)
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Password</span>
              <input
                type="password"
                required
                minLength={4}
                autoComplete="current-password"
                value={password}
                placeholder="Enter password"
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            )}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={busy || (mode === 'supervisor' && (!email || supervisorOptions.length === 0))}
            >
              {busy ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
