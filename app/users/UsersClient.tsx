'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type User = { id: string; email: string; name: string | null; role: string; createdAt: Date }

export default function UsersClient({ users: initial, currentUserId }: { users: User[]; currentUserId: string }) {
  const router = useRouter()
  const [users, setUsers] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'VIEWER' })
  const [editId, setEditId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error?.toUpperCase() || 'ERROR')
      return
    }
    setForm({ email: '', name: '', password: '', role: 'VIEWER' })
    setShowForm(false)
    router.refresh()
    const updated = await fetch('/api/users').then(r => r.json())
    setUsers(updated)
  }

  const updateRole = async (id: string, role: string) => {
    await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    setEditId(null)
    const updated = await fetch('/api/users').then(r => r.json())
    setUsers(updated)
  }

  const deleteUser = async (id: string) => {
    if (!confirm('Delete this user?')) return
    await fetch(`/api/users/${id}`, { method: 'DELETE' })
    setUsers(u => u.filter(x => x.id !== id))
  }

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--gray-10)' }}>
            {['EMAIL', 'NAME', 'ROLE', 'CREATED', ''].map(h => (
              <th key={h} className="lbl" style={{ textAlign: 'left', padding: '8px 0', paddingRight: 24 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{ borderBottom: '1px solid var(--gray-10)' }}>
              <td style={{ padding: '12px 0', paddingRight: 24, fontSize: 13 }}>{u.email}</td>
              <td style={{ paddingRight: 24, fontSize: 13, color: 'var(--gray-50)' }}>{u.name || '—'}</td>
              <td style={{ paddingRight: 24 }}>
                {editId === u.id ? (
                  <select
                    className="field"
                    style={{ padding: '2px 6px', height: 28, fontSize: 11 }}
                    value={editRole}
                    onChange={e => setEditRole(e.target.value)}
                    onBlur={() => updateRole(u.id, editRole)}
                    autoFocus
                  >
                    <option>OWNER</option>
                    <option>EDITOR</option>
                    <option>VIEWER</option>
                  </select>
                ) : (
                  <span
                    className="lbl"
                    style={{ cursor: u.id !== currentUserId ? 'pointer' : 'default' }}
                    onClick={() => { if (u.id !== currentUserId) { setEditId(u.id); setEditRole(u.role) } }}
                  >
                    {u.role}
                  </span>
                )}
              </td>
              <td className="lbl" style={{ paddingRight: 24, color: 'var(--gray-50)' }}>
                {new Date(u.createdAt).toLocaleDateString()}
              </td>
              <td>
                {u.id !== currentUserId && (
                  <button
                    className="btn btn--ghost"
                    style={{ padding: '0 10px', height: 24, fontSize: 10 }}
                    onClick={() => deleteUser(u.id)}
                  >
                    DELETE
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm ? (
        <form onSubmit={createUser} style={{ maxWidth: 400 }}>
          <div style={{ marginBottom: 16 }}>
            <div className="lbl" style={{ marginBottom: 8 }}>EMAIL</div>
            <input className="field" type="email" required value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div className="lbl" style={{ marginBottom: 8 }}>NAME</div>
            <input className="field" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div className="lbl" style={{ marginBottom: 8 }}>PASSWORD</div>
            <input className="field" type="password" required minLength={8} value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <div className="lbl" style={{ marginBottom: 8 }}>ROLE</div>
            <select className="field" value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option>OWNER</option>
              <option>EDITOR</option>
              <option>VIEWER</option>
            </select>
          </div>
          {error && <div className="lbl" style={{ color: 'var(--accent)', marginBottom: 16 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn--primary" type="submit" disabled={loading}>
              {loading ? 'CREATING…' : 'CREATE'}
            </button>
            <button className="btn btn--ghost" type="button" onClick={() => { setShowForm(false); setError('') }}>
              CANCEL
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn--primary" onClick={() => setShowForm(true)}>+ NEW USER</button>
      )}
    </>
  )
}
