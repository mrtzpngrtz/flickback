'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDuration, formatBytes, formatDate } from '@/lib/utils'
import VideoInfoModal from './VideoInfoModal'

type Video = {
  id: string; title: string; filename: string; duration: number | null
  size: string; status: string; createdAt: string
  versionNote: string | null; description: string | null; tags: string[]
  _count: { annotations: number }
  project: { id: string; name: string } | null
}
type Project = { id: string; name: string }

export default function LibraryClient({ videos, projects }: { videos: Video[]; projects: Project[] }) {
  const [filter, setFilter] = useState<string | null>(null)
  const [editVideo, setEditVideo] = useState<Video | null>(null)
  const [videoList, setVideoList] = useState(videos)

  const filtered = filter ? videoList.filter(v => v.project?.id === filter) : videoList
  const total = filtered.length
  const ready = filtered.filter(v => v.status === 'READY').length
  const totalNotes = filtered.reduce((a, v) => a + v._count.annotations, 0)

  const onUpdated = (updated: Video) => {
    setVideoList(prev => prev.map(v => v.id === updated.id ? updated : v))
    setEditVideo(null)
  }

  return (
    <>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr', gap: '0 96px', marginBottom: 40, alignItems: 'end' }}>
        <div>
          <div className="num-lg">{String(total).padStart(2, '0')}</div>
          <div className="lbl" style={{ marginTop: 8 }}>TOTAL</div>
        </div>
        <div>
          <div className="num-md">{String(ready).padStart(2, '0')}</div>
          <div className="lbl" style={{ marginTop: 8 }}>READY</div>
        </div>
        <div>
          <div className="num-md">{String(totalNotes).padStart(2, '0')}</div>
          <div className="lbl" style={{ marginTop: 8 }}>NOTES</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignSelf: 'center', gap: 12 }}>
          <Link href="/upload" className="btn btn--primary">+ UPLOAD</Link>
        </div>
      </div>

      {/* Project filter */}
      {projects.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <button
            className={`btn${!filter ? ' btn--primary' : ''}`}
            style={{ fontSize: 10, padding: '4px 10px' }}
            onClick={() => setFilter(null)}
          >ALL</button>
          {projects.map(p => (
            <button
              key={p.id}
              className={`btn${filter === p.id ? ' btn--primary' : ''}`}
              style={{ fontSize: 10, padding: '4px 10px' }}
              onClick={() => setFilter(p.id)}
            >{p.name}</button>
          ))}
        </div>
      )}

      {/* Table header */}
      <div className="row" style={{ gridTemplateColumns: '28px 1fr 100px 80px 80px 48px 72px 80px 24px', borderBottom: '1px solid var(--black)', paddingBottom: 8 }}>
        {['#', 'TITLE', 'PROJECT', 'DURATION', 'SIZE', 'NOTES', 'STATUS', 'UPLOADED', ''].map(h => (
          <span key={h} className="lbl">{h}</span>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: '48px 0' }}>
          <span className="lbl">NO VIDEOS — <Link href="/upload" style={{ color: 'var(--black)' }}>UPLOAD ONE</Link></span>
        </div>
      )}

      {filtered.map((video, i) => (
        <div key={video.id} className="row" style={{ gridTemplateColumns: '28px 1fr 100px 80px 80px 48px 72px 80px 24px' }}>
          <span className="lbl">{String(i + 1).padStart(2, '0')}</span>

          <div style={{ overflow: 'hidden' }}>
            <Link href={`/review/${video.id}`} style={{ fontWeight: 500, fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {video.title}
            </Link>
            {video.versionNote && (
              <span className="lbl" style={{ color: 'var(--accent)', marginTop: 2, display: 'block' }}>{video.versionNote}</span>
            )}
          </div>

          <span className="lbl" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {video.project?.name || '—'}
          </span>

          <span className="px" style={{ color: 'var(--gray-50)', fontSize: 11 }}>
            {video.duration ? formatDuration(video.duration) : '--:--'}
          </span>

          <span style={{ fontSize: 11, color: 'var(--gray-50)' }}>{formatBytes(BigInt(video.size))}</span>

          <span style={{ fontSize: 13 }}>
            {video._count.annotations > 0
              ? <strong>{String(video._count.annotations).padStart(2, '0')}</strong>
              : <span className="lbl">—</span>}
          </span>

          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`status-dot status-dot--${video.status === 'READY' ? 'ready' : video.status === 'ERROR' ? 'error' : 'live'}`} />
            <span className="lbl">{video.status}</span>
          </span>

          <span style={{ fontSize: 11, color: 'var(--gray-50)' }}>{formatDate(new Date(video.createdAt))}</span>

          <button
            style={{ fontSize: 11, color: 'var(--gray-30)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, lineHeight: 1 }}
            onClick={() => setEditVideo(video)}
            title="Edit info"
          >⋯</button>
        </div>
      ))}

      {editVideo && (
        <VideoInfoModal
          video={editVideo}
          projects={projects}
          onClose={() => setEditVideo(null)}
          onSaved={onUpdated}
        />
      )}
    </>
  )
}
