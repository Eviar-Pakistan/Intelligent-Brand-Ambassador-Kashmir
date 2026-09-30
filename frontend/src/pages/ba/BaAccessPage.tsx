import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { baSignIn, findBaByAccessToken, resolveBaInvite } from '../../lib/baAccounts'

/** Opens one ambassador's account from their personal link. No password. */
export function BaAccessPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function open() {
      if (!token) {
        setMissing(true)
        return
      }

      // Always resolve against the backend when possible so training video metadata is fresh.
      // Demo tokens (demo-*) fall back to local accounts.
      let account =
        token.startsWith('demo-')
          ? findBaByAccessToken(token)
          : await resolveBaInvite(token)

      if (!account && token.startsWith('demo-')) {
        account = await resolveBaInvite(token)
      }
      if (!account) {
        account = findBaByAccessToken(token)
      }

      if (cancelled) return
      if (!account) {
        setMissing(true)
        return
      }

      baSignIn(account.id)
      navigate('/ba/home', { replace: true })
    }

    void open()
    return () => {
      cancelled = true
    }
  }, [token, navigate])

  if (!missing) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7f4ec] px-6 text-sm text-slate-600">
        Opening your account…
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7f4ec] px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-bold text-slate-900">This link is not valid</h1>
        <p className="mt-2 text-sm text-slate-500">Ask Head Office for your account link.</p>
      </div>
    </div>
  )
}
