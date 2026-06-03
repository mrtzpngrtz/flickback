import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatDuration, formatBytes, formatDate } from '@/lib/utils'

export const revalidate = 0

export default async function DashboardPage() {
  const videos = await prisma.video.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { annotations: true } } },
  })

  const total = videos.length
  const ready = videos.filter(v => v.status === 'READY').length
  const totalNotes = videos.reduce((acc, v) => acc + v._count.annotations, 0)

  return (
    <main className="page">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto auto auto 1fr',
          gap: '0 96px',
          marginBottom: 64,
          alignItems: 'end',
        }}
      >
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignSelf: 'center' }}>
          <Link href="/upload" className="btn btn--primary">+ UPLOAD</Link>
        </div>
      </div>

      <div
        className="row"
        style={{
          gridTemplateColumns: '32px 1fr 88px 96px 56px 80px 96px',
          borderBottom: '1px solid var(--black)',
          paddingBottom: 8,
        }}
      >
        {['#', 'TITLE', 'DURATION', 'SIZE', 'NOTES', 'STATUS', 'UPLOADED'].map(h => (
          <span key={h} className="lbl">{h}</span>
        ))}
      </div>

      {videos.length === 0 && (
        <div style={{ padding: '48px 0' }}>
          <span className="lbl">
            NO VIDEOS —{' '}
            <Link href="/upload" style={{ color: 'var(--black)' }}>UPLOAD ONE</Link>
          </span>
        </div>
      )}

      {videos.map((video, i) => (
        <div
          key={video.id}
          className="row"
          style={{ gridTemplateColumns: '32px 1fr 88px 96px 56px 80px 96px' }}
        >
          <span className="lbl">{String(i + 1).padStart(2, '0')}</span>

          <Link
            href={`/review/${video.id}`}
            style={{
              fontWeight: 500,
              letterSpacing: '0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {video.title}
          </Link>

          <span className="px" style={{ color: 'var(--gray-50)' }}>
            {video.duration ? formatDuration(video.duration) : '--:--'}
          </span>

          <span style={{ fontSize: 11, color: 'var(--gray-50)' }}>
            {formatBytes(video.size)}
          </span>

          <span style={{ fontSize: 13 }}>
            {video._count.annotations > 0 ? (
              <strong>{String(video._count.annotations).padStart(2, '0')}</strong>
            ) : (
              <span className="lbl">—</span>
            )}
          </span>

          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className={`status-dot status-dot--${
                video.status === 'READY' ? 'ready' : video.status === 'ERROR' ? 'error' : 'live'
              }`}
            />
            <span className="lbl">{video.status}</span>
          </span>

          <span style={{ fontSize: 11, color: 'var(--gray-50)' }}>
            {formatDate(video.createdAt)}
          </span>
        </div>
      ))}
    </main>
  )
}
