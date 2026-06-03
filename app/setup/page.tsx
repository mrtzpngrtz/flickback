'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', name: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error?.toUpperCase() || 'ERROR')
    } else {
      router.push('/login')
    }
  }

  return (
    <main className="page" style={{ maxWidth: 400, paddingTop: 80 }}>
      <div style={{ marginBottom: 40 }}>
        <div className="num-sm">FLICKBACK</div>
        <div className="lbl" style={{ marginTop: 8, color: 'var(--gray-50)' }}>INITIAL SETUP</div>
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--gray-50)' }}>
          Create the first admin account. This page is disabled once a user exists.
        </div>
      </div>

      <form onSubmit={submit}>
        <div style={{ marginBottom: 16 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>EMAIL</div>
          <input className="field" type="email" required value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} autoFocus />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>NAME</div>
          <input className="field" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div style={{ marginBottom: 32 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>PASSWORD</div>
          <input className="field" type="password" required minLength={8} value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </div>
        {error && <div className="lbl" style={{ color: 'var(--accent)', marginBottom: 16 }}>{error}</div>}
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? 'CREATING…' : 'CREATE ADMIN'}
        </button>
      </form>
    </main>
  )
}
