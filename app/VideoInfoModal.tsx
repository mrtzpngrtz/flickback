'use client'

import { useState } from 'react'

type Video = {
  id: string; title: string; description: string | null
  versionNote: string | null; tags: string[]
  project: { id: string; name: string } | null
}
type Project = { id: string; name: string }

export default function VideoInfoModal({ video, projects, onClose, onSaved, onDeleted }: {
  video: Video; projects: Project[]
  onClose: () => void; onSaved: (v: any) => void; onDeleted?: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({
    title: video.title,
    description: video.description || '',
    versionNote: video.versionNote || '',
    tags: video.tags.join(', '),
    projectId: video.project?.id || '',
  })
  const [saving, setSaving] = useState(false)

  const deleteVideo = async () => {
    if (!confirm(`Delete "${video.title}"? This cannot be undone.`)) return
    setDeleting(true)
    await fetch(`/api/videos/${video.id}`, { method: 'DELETE' })
    setDeleting(false)
    onDeleted?.(video.id)
    onClose()
  }

  const save = async () => {
    setSaving(true)
    const res = await fetch(`/api/videos/${video.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        versionNote: form.versionNote.trim(),
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        projectId: form.projectId || null,
      }),
    })
    setSaving(false)
    if (res.ok) onSaved(await res.json())
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--white)', width: 480, padding: 32 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
          <span className="lbl">VIDEO INFO</span>
          <button className="btn btn--ghost" style={{ fontSize: 10 }} onClick={onClose}>CLOSE</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="lbl" style={{ marginBottom: 8 }}>TITLE</div>
            <input className="field" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>

          <div>
            <div className="lbl" style={{ marginBottom: 8 }}>VERSION NOTE</div>
            <input className="field" value={form.versionNote} placeholder="e.g. v2 — color graded"
              onChange={e => setForm(f => ({ ...f, versionNote: e.target.value }))} />
          </div>

          <div>
            <div className="lbl" style={{ marginBottom: 8 }}>PROJECT</div>
            <select className="field" value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}>
              <option value="">— none —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <div className="lbl" style={{ marginBottom: 8 }}>DESCRIPTION</div>
            <textarea className="field field--area" value={form.description} placeholder="Notes about this video…"
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <div>
            <div className="lbl" style={{ marginBottom: 8 }}>TAGS</div>
            <input className="field" value={form.tags} placeholder="color, rough-cut, approved"
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
            <div className="lbl" style={{ marginTop: 6 }}>COMMA-SEPARATED</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 32 }}>
          <button className="btn btn--ghost" style={{ color: 'var(--accent)', fontSize: 10 }} onClick={deleteVideo} disabled={deleting}>
            {deleting ? 'DELETING…' : 'DELETE VIDEO'}
          </button>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn--ghost" onClick={onClose}>CANCEL</button>
            <button className="btn btn--primary" onClick={save} disabled={saving}>
              {saving ? 'SAVING…' : 'SAVE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
