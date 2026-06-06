import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { getPresignedDownloadUrl } from '@/lib/storage'
import { formatDuration, formatBytes, formatDate } from '@/lib/utils'
import VideoAnnotator from './VideoAnnotator'

export const revalidate = 0

interface Props { params: Promise<{ id: string }> }

export default async function ReviewPage({ params }: Props) {
  const { id } = await params
  const video = await prisma.video.findUnique({
    where: { id },
    include: { annotations: { orderBy: { timestamp: 'asc' } } },
  })
  if (!video) notFound()

  const videoUrl = await getPresignedDownloadUrl(video.storageKey)

  return (
    <>
      <div
        style={{
          height: 36,
          borderBottom: '1px solid var(--gray-10)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 24,
          background: 'var(--white)',
        }}
      >
        <Link href="/" className="lbl" style={{ color: 'var(--gray-50)' }}>← LIBRARY</Link>
        <span style={{ width: 1, height: 16, background: 'var(--gray-10)' }} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>{video.title}</span>
        <span className="lbl" style={{ color: 'var(--gray-50)' }}>{video.filename}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 24, alignItems: 'center' }}>
          {video.duration && <span className="lbl">{formatDuration(video.duration)}</span>}
          <span className="lbl">{formatBytes(video.size)}</span>
          <span className="lbl">{formatDate(video.createdAt)}</span>
          <span
            className={`status-dot status-dot--${
              video.status === 'READY' ? 'ready' : video.status === 'ERROR' ? 'error' : 'live'
            }`}
          />
        </span>
      </div>

      {/* height: 100vh - 40px topbar - 36px sub-header */}
      <div style={{ height: 'calc(100vh - 76px)', overflow: 'hidden' }}>
        <VideoAnnotator
          videoUrl={videoUrl}
          videoId={video.id}
          initialAnnotations={video.annotations.map(a => ({
            ...a,
            drawing: a.drawing ?? null,
            role: a.role as 'ADMIN' | 'CLIENT',
            createdAt: a.createdAt.toISOString(),
          }))}
          videoTitle={video.title}
          videoFilename={video.filename}
          videoDescription={video.description}
          versionNote={video.versionNote}
          tags={video.tags}
          videoDuration={video.duration}
          videoSize={Number(video.size)}
        />
      </div>
    </>
  )
}
