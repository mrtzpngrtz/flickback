import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getPresignedDownloadUrl } from '@/lib/storage'
import { formatDuration, formatDate } from '@/lib/utils'
import VideoAnnotator from '@/app/review/[id]/VideoAnnotator'

export const revalidate = 0

interface Props { params: { token: string } }

export default async function ClientPage({ params }: Props) {
  const share = await prisma.shareToken.findUnique({
    where: { token: params.token },
    include: {
      video: {
        include: { annotations: { orderBy: { timestamp: 'asc' } } },
      },
    },
  })

  if (!share) notFound()
  if (share.expiresAt && share.expiresAt < new Date()) notFound()

  const videoUrl = await getPresignedDownloadUrl(share.video.storageKey)
  const { video } = share

  return (
    <>
      {/*
        Root layout already adds paddingTop: 40 and has the admin topbar.
        This header overlays the admin topbar with z-index: 300 (> topbar's 200).
        It sits at top: 0 so it covers the admin header entirely.
      */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 40,
          background: 'var(--white)',
          borderBottom: '1px solid var(--gray-10)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 24,
          zIndex: 300,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase' }}>
          FLICKBACK
        </span>
        <span style={{ width: 1, height: 16, background: 'var(--gray-10)' }} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>{video.title}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 24, alignItems: 'center' }}>
          {video.duration && <span className="lbl">{formatDuration(video.duration)}</span>}
          <span className="lbl">{formatDate(video.createdAt)}</span>
          <span className="lbl" style={{ color: 'var(--accent)' }}>REVIEW</span>
        </span>
      </div>

      {/* Root layout adds paddingTop:40 — annotator fills the remaining viewport height */}
      <div style={{ height: 'calc(100vh - 40px)', overflow: 'hidden' }}>
        <VideoAnnotator
          videoUrl={videoUrl}
          videoId={video.id}
          initialAnnotations={video.annotations.map(a => ({
            ...a,
            drawing: a.drawing ?? null,
            role: a.role as 'ADMIN' | 'CLIENT',
            createdAt: a.createdAt.toISOString(),
          }))}
          isClient
          shareToken={params.token}
        />
      </div>
    </>
  )
}

export const metadata = {
  title: 'Video Review — Flickback',
}
