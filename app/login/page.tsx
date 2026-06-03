'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError('INVALID EMAIL OR PASSWORD')
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <main className="page" style={{ maxWidth: 400, paddingTop: 80 }}>
      <div style={{ marginBottom: 40 }}>
        <div className="num-sm">FLICKBACK</div>
        <div className="lbl" style={{ marginTop: 8, color: 'var(--gray-50)' }}>SIGN IN</div>
      </div>

      <form onSubmit={submit}>
        <div style={{ marginBottom: 16 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>EMAIL</div>
          <input
            className="field"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin@example.com"
            required
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 32 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>PASSWORD</div>
          <input
            className="field"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {error && (
          <div className="lbl" style={{ color: 'var(--accent)', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button
          className="btn btn--primary"
          type="submit"
          disabled={loading}
          style={{ opacity: loading ? 0.5 : 1 }}
        >
          {loading ? 'SIGNING IN…' : 'SIGN IN'}
        </button>
      </form>
    </main>
  )
}
