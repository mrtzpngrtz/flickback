'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import s from './VideoAnnotator.module.css'

interface Point { x: number; y: number }

export interface AnnotationData {
  id: string
  timestamp: number
  drawing?: string | null
  comment: string
  author: string
  role: 'ADMIN' | 'CLIENT'
  resolved: boolean
  createdAt: string
}

interface Props {
  videoUrl: string
  videoId: string
  initialAnnotations: AnnotationData[]
  isClient?: boolean
  shareToken?: string
}

function formatTimecode(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const f = Math.floor((s % 1) * 24)
  return [h, m, sec, f].map(n => String(n).padStart(2, '0')).join(':')
}

function formatShort(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function VideoAnnotator({
  videoUrl,
  videoId,
  initialAnnotations,
  isClient,
  shareToken,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [annotations, setAnnotations] = useState<AnnotationData[]>(
    [...initialAnnotations].sort((a, b) => a.timestamp - b.timestamp)
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawnPaths, setDrawnPaths] = useState<Point[][]>([])
  const [currentPath, setCurrentPath] = useState<Point[]>([])
  const [pendingTs, setPendingTs] = useState<number | null>(null)
  const [commentText, setCommentText] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [copyLabel, setCopyLabel] = useState('COPY LINK')

  // Sync canvas dimensions to video display size
  const syncCanvas = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const rect = video.getBoundingClientRect()
    if (rect.width === 0) return
    canvas.width = rect.width
    canvas.height = rect.height
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.addEventListener('loadedmetadata', syncCanvas)
    window.addEventListener('resize', syncCanvas)
    syncCanvas()
    return () => {
      video.removeEventListener('loadedmetadata', syncCanvas)
      window.removeEventListener('resize', syncCanvas)
    }
  }, [syncCanvas])

  // Draw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#FF4D00'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const renderPath = (path: Point[]) => {
      if (path.length < 2) return
      ctx.beginPath()
      ctx.moveTo(path[0].x * canvas.width, path[0].y * canvas.height)
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * canvas.width, path[i].y * canvas.height)
      }
      ctx.stroke()
    }

    const active = annotations.find(a => a.id === activeId)
    if (active?.drawing) {
      try {
        const paths = JSON.parse(active.drawing) as Point[][]
        paths.forEach(renderPath)
      } catch {}
    }

    drawnPaths.forEach(renderPath)
    if (currentPath.length > 1) renderPath(currentPath)
  }, [annotations, activeId, drawnPaths, currentPath])

  useEffect(() => { redraw() }, [redraw])

  // Canvas point (normalized 0–1)
  const canvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) / c.width, y: (e.clientY - r.top) / c.height }
  }

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode) return
    setIsDrawing(true)
    setCurrentPath([canvasPoint(e)])
  }
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawMode) return
    setCurrentPath(prev => [...prev, canvasPoint(e)])
  }
  const onMouseUp = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    if (currentPath.length > 1) {
      setDrawnPaths(prev => [...prev, currentPath])
    }
    setCurrentPath([])
  }

  // Video controls
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play(); else v.pause()
  }, [])

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    if (!v || !duration) return
    const r = e.currentTarget.getBoundingClientRect()
    v.currentTime = ((e.clientX - r.left) / r.width) * duration
  }

  // Open annotation form at current frame
  const openAnnotation = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    setPendingTs(v.currentTime)
    setDrawnPaths([])
    setCurrentPath([])
  }, [])

  const cancelAnnotation = useCallback(() => {
    setPendingTs(null)
    setDrawnPaths([])
    setCurrentPath([])
    setDrawMode(false)
    setCommentText('')
  }, [])

  const submitAnnotation = async () => {
    if (!commentText.trim() || pendingTs === null) return
    if (isClient && !authorName.trim()) return
    setSubmitting(true)

    const drawing = drawnPaths.length > 0 ? JSON.stringify(drawnPaths) : undefined
    const endpoint = isClient
      ? `/api/client/${shareToken}/annotations`
      : `/api/videos/${videoId}/annotations`

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: pendingTs,
          drawing,
          comment: commentText,
          author: isClient ? authorName : 'Director',
          role: isClient ? 'CLIENT' : 'ADMIN',
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setAnnotations(prev => [...prev, created].sort((a, b) => a.timestamp - b.timestamp))
        cancelAnnotation()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const selectAnnotation = (a: AnnotationData) => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    v.currentTime = a.timestamp
    setActiveId(a.id === activeId ? null : a.id)
  }

  const resolveAnnotation = async (id: string) => {
    const res = await fetch(`/api/videos/${videoId}/annotations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: true }),
    })
    if (res.ok) {
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a))
    }
  }

  const generateShare = async () => {
    const res = await fetch(`/api/videos/${videoId}/share`, { method: 'POST' })
    if (res.ok) {
      const { token } = await res.json()
      const url = `${window.location.origin}/client/${token}`
      setShareUrl(url)
    }
  }

  const copyShare = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopyLabel('COPIED')
    setTimeout(() => setCopyLabel('COPY LINK'), 2000)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === ' ') { e.preventDefault(); togglePlay() }
      if (e.key === 'a' || e.key === 'A') openAnnotation()
      if (e.key === 'd' || e.key === 'D') setDrawMode(prev => !prev)
      if (e.key === 'Escape') cancelAnnotation()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [togglePlay, openAnnotation, cancelAnnotation])

  const pointerEvents = drawMode ? 'all' : 'none'
  const canvasStyle = { pointerEvents, cursor: drawMode ? 'crosshair' : 'default' } as React.CSSProperties

  return (
    <div className={s.root}>
      {/* ── Video column ── */}
      <div className={s.videoCol}>
        <div className={s.videoWrapper} ref={wrapperRef}>
          <video
            ref={videoRef}
            className={s.video}
            src={videoUrl}
            onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
            onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
            onProgress={() => {
              const v = videoRef.current
              if (v?.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            playsInline
          />
          <canvas
            ref={canvasRef}
            className={s.canvas}
            style={canvasStyle}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
        </div>

        {/* Controls */}
        <div className={s.controls}>
          <button className={s.ctrlBtn} onClick={togglePlay}>
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>
          <span className={s.ctrlSep} />
          <span className={s.timecode}>{formatTimecode(currentTime)}</span>
          <span className={s.timecodeAlt}>&nbsp;/&nbsp;{formatTimecode(duration)}</span>
          <span className={s.ctrlSep} />
          {pendingTs === null && (
            <>
              <button
                className={`${s.ctrlBtn}${drawMode ? ` ${s['ctrlBtn--active']}` : ''}`}
                onClick={() => setDrawMode(p => !p)}
              >
                {drawMode ? '● DRAW' : 'DRAW'}
              </button>
              <button className={`${s.ctrlBtn} ${s['ctrlBtn--annotate']}`} onClick={openAnnotation}>
                + ANNOTATE
              </button>
            </>
          )}
          {pendingTs !== null && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--gray-50)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
              FRAME LOCKED {drawMode ? '· DRAWING' : '· CLICK DRAW TO MARK'}
            </span>
          )}
        </div>

        {/* Timeline */}
        <div className={s.timeline} onClick={seek}>
          <div className={s.timelineTrack} />
          <div className={s.timelineBuffered} style={{ width: duration ? `${(buffered / duration) * 100}%` : '0%' }} />
          <div className={s.timelinePlayhead} style={{ left: duration ? `${(currentTime / duration) * 100}%` : '0%' }} />
          {annotations.map(a => (
            <div
              key={a.id}
              className={`${s.timelineMark}${a.id === activeId ? ` ${s.timelineMarkActive}` : ''}`}
              style={{ left: duration ? `${(a.timestamp / duration) * 100}%` : '0%' }}
              onClick={e => { e.stopPropagation(); selectAnnotation(a) }}
              title={`${formatShort(a.timestamp)} — ${a.author}`}
            />
          ))}
        </div>

        {/* Annotation form */}
        {pendingTs !== null && (
          <div className={s.form}>
            <div className={s.formRow}>
              <div className={s.formFrame}>
                <span className="lbl">FRAME</span>
                <span className={s.timecode}>{formatTimecode(pendingTs)}</span>
              </div>
              {drawnPaths.length > 0 && (
                <span style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                  {drawnPaths.length} STROKE{drawnPaths.length > 1 ? 'S' : ''}
                </span>
              )}
            </div>
            {isClient && (
              <input
                className={s.formNameInput}
                placeholder="YOUR NAME"
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
              />
            )}
            <textarea
              className={s.formTextarea}
              placeholder="COMMENT"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              autoFocus={!isClient}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAnnotation() }}
            />
            <div className={s.formActions}>
              <button className="btn btn--ghost" onClick={cancelAnnotation}>CANCEL</button>
              <button
                className="btn btn--primary"
                onClick={submitAnnotation}
                disabled={!commentText.trim() || submitting || (isClient && !authorName.trim())}
                style={{ opacity: (!commentText.trim() || (isClient && !authorName.trim())) ? .4 : 1 }}
              >
                {submitting ? 'SAVING…' : 'SAVE  ⌘↵'}
              </button>
            </div>
          </div>
        )}

        {/* Key hints */}
        {!isClient && pendingTs === null && (
          <div className={s.keyHints}>
            {[['SPACE', 'PLAY/PAUSE'], ['A', 'ANNOTATE'], ['D', 'DRAW'], ['ESC', 'CANCEL']].map(([k, hint]) => (
              <div key={k} className={s.keyHint}>
                <span className={s.keyHintKey}>{k}</span>
                <span className="lbl-xs">{hint}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Annotation column ── */}
      <div className={s.annotCol}>
        <div className={s.listHeader}>
          <span className="lbl">ANNOTATIONS</span>
          <span className={s.listCount}>{String(annotations.length).padStart(2, '0')}</span>
        </div>

        <div className={s.listScroll}>
          {annotations.length === 0 && (
            <div className={s.empty}>NO ANNOTATIONS YET</div>
          )}
          {annotations.map(a => (
            <div
              key={a.id}
              className={`${s.annotItem}${a.id === activeId ? ` ${s.annotItemActive}` : ''}`}
              onClick={() => selectAnnotation(a)}
            >
              <div className={s.annotHead}>
                <span className={s.annotTs}>{formatShort(a.timestamp)}</span>
                <span className={`role-badge${a.role === 'CLIENT' ? ' role-badge--client' : ''}`}>
                  {a.role === 'CLIENT' ? 'CLIENT' : 'DIRECTOR'}
                </span>
                {a.drawing && <span className={s.annotDrawn}>✎</span>}
              </div>
              <div className={s.annotAuthor}>{a.author}</div>
              <div className={s.annotComment}>{a.comment}</div>
              {!isClient && !a.resolved && (
                <button
                  className="btn btn--ghost"
                  style={{ fontSize: 9, marginTop: 8 }}
                  onClick={e => { e.stopPropagation(); resolveAnnotation(a.id) }}
                >
                  RESOLVE
                </button>
              )}
              {a.resolved && <span className={s.resolvedBadge}>RESOLVED</span>}
              <div className={s.annotDate}>
                {new Date(a.createdAt).toLocaleDateString('de-CH')}
              </div>
            </div>
          ))}
        </div>

        {/* Share panel (admin only) */}
        {!isClient && (
          <div className={s.shareRow}>
            <span className="lbl">CLIENT LINK</span>
            {shareUrl ? (
              <>
                <span className={s.shareLink}>{shareUrl}</span>
                <button className="btn btn--ghost" style={{ fontSize: 10 }} onClick={copyShare}>
                  {copyLabel}
                </button>
              </>
            ) : (
              <button className="btn" onClick={generateShare}>GENERATE LINK</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
