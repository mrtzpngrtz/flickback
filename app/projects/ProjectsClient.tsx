'use client'

import { useState } from 'react'
import Link from 'next/link'

type Project = { id: string; name: string; client: string | null; createdAt: Date; _count: { videos: number } }

export default function ProjectsClient({ projects: initial }: { projects: Project[] }) {
  const [projects, setProjects] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', client: '' })
  const [loading, setLoading] = useState(false)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (res.ok) {
      const p = await res.json()
      setProjects(prev => [{ ...p, _count: { videos: 0 } }, ...prev])
      setForm({ name: '', client: '' })
      setShowForm(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete project? Videos will be unassigned.')) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    setProjects(p => p.filter(x => x.id !== id))
  }

  return (
    <>
      <div style={{ borderTop: '1px solid var(--black)', marginBottom: 8 }}>
        {projects.length === 0 && (
          <div style={{ padding: '32px 0' }}>
            <span className="lbl">NO PROJECTS YET</span>
          </div>
        )}
        {projects.map(p => (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 64px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--gray-10)' }}>
            <div>
              <Link href={`/?project=${p.id}`} style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</Link>
              {p.client && <span className="lbl" style={{ marginLeft: 12 }}>{p.client}</span>}
            </div>
            <span className="lbl">{p._count.videos} VIDEO{p._count.videos !== 1 ? 'S' : ''}</span>
            <span className="lbl">{new Date(p.createdAt).toLocaleDateString()}</span>
            <button className="btn btn--ghost" style={{ fontSize: 10, justifySelf: 'end' }} onClick={() => remove(p.id)}>DELETE</button>
          </div>
        ))}
      </div>

      {showForm ? (
        <form onSubmit={create} style={{ marginTop: 24, maxWidth: 400 }}>
          <div style={{ marginBottom: 16 }}>
            <div className="lbl" style={{ marginBottom: 8 }}>PROJECT NAME</div>
            <input className="field" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div style={{ marginBottom: 24 }}>
            <div className="lbl" style={{ marginBottom: 8 }}>CLIENT</div>
            <input className="field" value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="optional" />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn--primary" type="submit" disabled={loading}>{loading ? 'CREATING…' : 'CREATE'}</button>
            <button className="btn btn--ghost" type="button" onClick={() => setShowForm(false)}>CANCEL</button>
          </div>
        </form>
      ) : (
        <button className="btn btn--primary" style={{ marginTop: 24 }} onClick={() => setShowForm(true)}>+ NEW PROJECT</button>
      )}
    </>
  )
}
