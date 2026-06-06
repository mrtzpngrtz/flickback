'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import s from './VideoAnnotator.module.css'
import Timeline from './Timeline'
import { formatBytes, formatDuration } from '@/lib/utils'

interface Point { x: number; y: number }

export interface AnnotationData {
  id: string
  timestamp: number
  endTimestamp?: number | null
  markerX?: number | null
  markerY?: number | null
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
  videoTitle?: string
  videoFilename?: string
  videoDescription?: string | null
  versionNote?: string | null
  tags?: string[]
  videoDuration?: number | null
  videoSize?: number | null
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

export default function VideoAnnotator({ videoUrl, videoId, initialAnnotations, isClient, shareToken, videoTitle, videoFilename, videoDescription, versionNote, tags, videoDuration, videoSize }: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const noteRef    = useRef<HTMLTextAreaElement>(null)

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const lastTimeUpdateRef = useRef(0)        // throttle time state updates
  const currentTimeRef = useRef(0)           // always-current time for canvas/RAF
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)

  // Annotations
  const [annotations, setAnnotations] = useState<AnnotationData[]>(
    [...initialAnnotations].sort((a, b) => a.timestamp - b.timestamp)
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editStart, setEditStart] = useState<number>(0)
  const [editEnd, setEditEnd] = useState<number | null>(null)

  // New annotation form
  const [pendingTs, setPendingTs] = useState<number | null>(null)
  const [pendingEnd, setPendingEnd] = useState<number | null>(null)
  const [pendingMarker, setPendingMarker] = useState<{ x: number; y: number } | null>(null)
  const [commentText, setCommentText] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Drawing (only active when annotation form is open)
  const [drawActive, setDrawActive] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawnPaths, setDrawnPaths] = useState<Point[][]>([])
  const [currentPath, setCurrentPath] = useState<Point[]>([])
  const [drawColor, setDrawColor] = useState('#FF4D00')
  const [drawWidth, setDrawWidth] = useState(2)
  const [pathMeta, setPathMeta] = useState<{ color: string; width: number }[]>([])

  const dragJustEndedRef = useRef(false)

  // 3D view
  const [view3d, setView3d] = useState(false)
  const [iframeSrc, setIframeSrc] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const view3dRef = useRef(false)
  useEffect(() => { view3dRef.current = view3d }, [view3d])

  const postTo3d = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*')
  }, [])

  const toggle3d = useCallback(() => {
    setView3d(prev => {
      if (!prev) {
        const t = currentTimeRef.current
        setIframeSrc(`/3d-viewer.html?src=${encodeURIComponent(videoUrl)}&t=${t.toFixed(3)}&embed=1`)
      }
      return !prev
    })
  }, [videoUrl])

  // Marker drag
  const markerDragRef = useRef<{
    annotId: string | 'pending'
    offsetX: number  // grab offset in normalized coords
    offsetY: number
    didMove: boolean
  } | null>(null)

  // Share
  const [shareUrl, setShareUrl] = useState('')
  const [copyLabel, setCopyLabel] = useState('COPY LINK')

  // Canvas sync
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
    const v = videoRef.current
    if (!v) return
    v.addEventListener('loadedmetadata', syncCanvas)
    window.addEventListener('resize', syncCanvas)
    syncCanvas()
    return () => { v.removeEventListener('loadedmetadata', syncCanvas); window.removeEventListener('resize', syncCanvas) }
  }, [syncCanvas])

  // Redraw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const renderPath = (path: Point[], color = '#FF4D00', width = 2) => {
      if (path.length < 2) return
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(path[0].x * canvas.width, path[0].y * canvas.height)
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x * canvas.width, path[i].y * canvas.height)
      ctx.stroke()
    }

    const active = annotations.find(a => a.id === activeId)
    if (active?.drawing) {
      const t = currentTimeRef.current
      const inRange = active.endTimestamp != null
        ? t >= active.timestamp && t <= active.endTimestamp
        : Math.abs(t - active.timestamp) < 0.5
      if (inRange) {
        try {
          const parsed = JSON.parse(active.drawing)
          if (Array.isArray(parsed)) (parsed as Point[][]).forEach(p => renderPath(p))
          else parsed.paths.forEach((p: Point[], i: number) => renderPath(p, parsed.meta?.[i]?.color ?? '#FF4D00', parsed.meta?.[i]?.width ?? 2))
        } catch {}
      }
    }

    // Only show in-progress strokes when annotation form is open
    if (pendingTs !== null) {
      drawnPaths.forEach((p, i) => renderPath(p, pathMeta[i]?.color ?? drawColor, pathMeta[i]?.width ?? drawWidth))
      if (currentPath.length > 1) renderPath(currentPath, drawColor, drawWidth)
    }
  }, [annotations, activeId, drawnPaths, currentPath, pathMeta, drawColor, drawWidth, pendingTs])

  // RAF loop for canvas — decoupled from React renders
  useEffect(() => {
    let raf: number
    const loop = () => { redraw(); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [redraw])

  // Canvas events
  const canvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) / c.width, y: (e.clientY - r.top) / c.height }
  }
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => { if (!drawActive) return; setIsDrawing(true); setCurrentPath([canvasPoint(e)]) }
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => { if (!isDrawing || !drawActive) return; setCurrentPath(p => [...p, canvasPoint(e)]) }
  const onMouseUp = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    if (currentPath.length > 1) { setDrawnPaths(p => [...p, currentPath]); setPathMeta(p => [...p, { color: drawColor, width: drawWidth }]) }
    setCurrentPath([])
  }

  // Video controls
  const togglePlay = useCallback(() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause() }, [])
  const stop = useCallback(() => { const v = videoRef.current; if (!v) return; v.pause(); v.currentTime = 0 }, [])
  const stepFrame = useCallback((dir: 1 | -1) => { const v = videoRef.current; if (!v) return; v.pause(); v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + dir / 24)) }, [])
  const changeRate = useCallback((rate: number) => { const v = videoRef.current; if (!v) return; v.playbackRate = rate; setPlaybackRate(rate) }, [])
  const changeVolume = useCallback((val: number) => { const v = videoRef.current; if (!v) return; v.volume = val; v.muted = false; setVolume(val); setMuted(false) }, [])
  const toggleMute = useCallback(() => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted) }, [])
  // Annotation actions
  const openAnnotation = useCallback(() => {
    const v = videoRef.current; if (!v) return
    v.pause(); setPendingTs(v.currentTime); setCommentText(''); setDrawnPaths([]); setPathMeta([]); setCurrentPath([]); setDrawActive(false)
  }, [])

  const cancelAnnotation = useCallback(() => {
    setPendingTs(null); setPendingEnd(null); setPendingMarker(null)
    setCommentText(''); setDrawnPaths([]); setPathMeta([]); setCurrentPath([]); setDrawActive(false)
  }, [])

  const submitAnnotation = async () => {
    if (!commentText.trim() || pendingTs === null) return
    if (isClient && !authorName.trim()) return
    setSubmitting(true)
    const drawing = drawnPaths.length > 0 ? JSON.stringify({ paths: drawnPaths, meta: pathMeta }) : undefined
    const endpoint = isClient ? `/api/client/${shareToken}/annotations` : `/api/videos/${videoId}/annotations`
    try {
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: pendingTs,
          endTimestamp: pendingEnd && pendingEnd > pendingTs! ? pendingEnd : undefined,
          markerX: pendingMarker?.x ?? undefined,
          markerY: pendingMarker?.y ?? undefined,
          drawing, comment: commentText,
          author: isClient ? authorName : 'Director',
          role: isClient ? 'CLIENT' : 'ADMIN',
        }),
      })
      if (res.ok) { const created = await res.json(); setAnnotations(p => [...p, created].sort((a, b) => a.timestamp - b.timestamp)); cancelAnnotation() }
    } finally { setSubmitting(false) }
  }

  const selectAnnotation = (a: AnnotationData) => {
    const v = videoRef.current; if (!v) return
    v.pause(); v.currentTime = a.timestamp
    setActiveId(prev => { if (prev === a.id) { return null } return a.id })
    setEditId(null)
  }

  const resolveAnnotation = async (id: string) => {
    const res = await fetch(`/api/videos/${videoId}/annotations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolved: true }) })
    if (res.ok) setAnnotations(p => p.map(a => a.id === id ? { ...a, resolved: true } : a))
  }

  const deleteAnnotation = async (id: string) => {
    await fetch(`/api/videos/${videoId}/annotations/${id}`, { method: 'DELETE' })
    setAnnotations(p => p.filter(a => a.id !== id))
    if (activeId === id) setActiveId(null)
  }

  const startEdit = (a: AnnotationData) => {
    setEditId(a.id); setEditText(a.comment)
    setEditStart(a.timestamp); setEditEnd(a.endTimestamp ?? null)
    const v = videoRef.current; if (v) { v.pause(); v.currentTime = a.timestamp }
  }

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return
    const body: Record<string, unknown> = {
      comment: editText,
      timestamp: editStart,
      endTimestamp: editEnd !== null && editEnd > editStart ? editEnd : null,
    }
    const res = await fetch(`/api/videos/${videoId}/annotations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      setAnnotations(p => p.map(a => a.id === id ? { ...a, comment: editText, timestamp: editStart, endTimestamp: editEnd && editEnd > editStart ? editEnd : null } : a).sort((a, b) => a.timestamp - b.timestamp))
      setEditId(null)
    }
  }

  const generateShare = async () => {
    const res = await fetch(`/api/videos/${videoId}/share`, { method: 'POST' })
    if (res.ok) { const { token } = await res.json(); setShareUrl(`${window.location.origin}/client/${token}`) }
  }

  const copyShare = () => { navigator.clipboard.writeText(shareUrl); setCopyLabel('COPIED'); setTimeout(() => setCopyLabel('COPY LINK'), 2000) }

  const toggleDraw = useCallback(() => {
    setDrawActive(prev => {
      if (prev) setTimeout(() => noteRef.current?.focus(), 50)
      return !prev
    })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === ' ') { e.preventDefault(); togglePlay() }
      if (e.key === 'a' || e.key === 'A') openAnnotation()
      if (e.key === 'Escape') cancelAnnotation()
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); setDrawnPaths(p => p.slice(0, -1)); setPathMeta(p => p.slice(0, -1)) }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepFrame(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(-1) }
      if (e.key === '.') changeRate(Math.min(2, +(playbackRate + 0.25).toFixed(2)))
      if (e.key === ',') changeRate(Math.max(0.25, +(playbackRate - 0.25).toFixed(2)))
      if (e.key === 'm' || e.key === 'M') toggleMute()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [togglePlay, openAnnotation, cancelAnnotation, stepFrame, changeRate, playbackRate, toggleMute])

  const canvasStyle = { pointerEvents: (drawActive ? 'all' : 'none') as React.CSSProperties['pointerEvents'], cursor: drawActive ? 'crosshair' : 'default' }

  const wrapperPos = useCallback((clientX: number, clientY: number) => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    }
  }, [])

  // Global marker drag handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!markerDragRef.current) return
      const raw = wrapperPos(e.clientX, e.clientY)
      if (!raw) return
      const { annotId, offsetX, offsetY } = markerDragRef.current
      markerDragRef.current.didMove = true
      const pos = {
        x: Math.max(0, Math.min(1, raw.x - offsetX)),
        y: Math.max(0, Math.min(1, raw.y - offsetY)),
      }
      if (annotId === 'pending') {
        setPendingMarker(pos)
      } else {
        setAnnotations(prev => prev.map(a => a.id === annotId ? { ...a, markerX: pos.x, markerY: pos.y } : a))
      }
    }
    const onUp = async (e: MouseEvent) => {
      if (!markerDragRef.current) return
      const { annotId, offsetX, offsetY, didMove } = markerDragRef.current
      markerDragRef.current = null
      if (didMove) { dragJustEndedRef.current = true; setTimeout(() => { dragJustEndedRef.current = false }, 100) }
      if (!didMove || annotId === 'pending') return
      const raw = wrapperPos(e.clientX, e.clientY)
      if (!raw) return
      const pos = {
        x: Math.max(0, Math.min(1, raw.x - offsetX)),
        y: Math.max(0, Math.min(1, raw.y - offsetY)),
      }
      await fetch(`/api/videos/${videoId}/annotations/${annotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markerX: pos.x, markerY: pos.y }),
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [wrapperPos, videoId])

  const onVideoClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (drawActive) return
    if (dragJustEndedRef.current) return  // suppress click fired after drag release
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const v = videoRef.current
    if (!v) return
    if (pendingTs !== null) {
      // update marker position on existing pending annotation
      setPendingMarker({ x, y })
    } else {
      // open new annotation at this position
      v.pause()
      setPendingTs(v.currentTime)
      setPendingMarker({ x, y })
      setDrawnPaths([]); setPathMeta([]); setCurrentPath([]); setCommentText('')
    }
  }, [drawActive, pendingTs])

  return (
    <div className={s.root}>
      {/* ── Video column ── */}
      <div className={s.videoCol}>

        {/* 2D / 3D view switch */}
        <div className={s.viewSwitchBar}>
          <div className={s.viewToggle}>
            <button
              className={`${s.viewToggleBtn}${!view3d ? ` ${s.viewToggleBtnActive}` : ''}`}
              onClick={() => view3d && toggle3d()}
            >2D</button>
            <button
              className={`${s.viewToggleBtn}${view3d ? ` ${s.viewToggleBtnActive}` : ''}`}
              onClick={() => !view3d && toggle3d()}
            >3D</button>
          </div>
        </div>

        <div
          ref={wrapperRef}
          className={s.videoWrapper}
          style={{ cursor: drawActive ? 'crosshair' : pendingTs !== null ? 'crosshair' : 'default' }}
          onClick={onVideoClick}
        >
          <video ref={videoRef} className={s.video} src={videoUrl}
            onTimeUpdate={() => {
              const v = videoRef.current; if (!v) return
              currentTimeRef.current = v.currentTime
              const now = performance.now()
              if (now - lastTimeUpdateRef.current > 100) {
                lastTimeUpdateRef.current = now
                setCurrentTime(v.currentTime)
                if (view3dRef.current) postTo3d({ type: 'seek', time: v.currentTime })
              }
            }}
            onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
            onProgress={() => { const v = videoRef.current; if (v?.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)) }}
            onSeeked={() => {
              const v = videoRef.current; if (!v) return
              currentTimeRef.current = v.currentTime; setCurrentTime(v.currentTime)
              if (view3dRef.current) postTo3d({ type: 'seek', time: v.currentTime })
            }}
            onPlay={() => { setIsPlaying(true); setActiveId(null); if (view3dRef.current) postTo3d({ type: 'play' }) }}
            onPause={() => { setIsPlaying(false); if (view3dRef.current) postTo3d({ type: 'pause' }) }}
            onRateChange={() => { const v = videoRef.current; if (v && view3dRef.current) postTo3d({ type: 'rate', rate: v.playbackRate }) }}
            playsInline
          />
          <canvas ref={canvasRef} className={s.canvas} style={canvasStyle}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          />

          {/* 3D view overlay */}
          {view3d && iframeSrc && (
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              className={s.viewer3d}
              title="3D Preview"
              allow="autoplay"
            />
          )}


          {/* Saved annotation markers — visible at their timestamp only */}
          {annotations.filter(a => a.markerX != null && a.markerY != null).map((a, i) => {
            const isActive = a.id === activeId
            const inRange = a.endTimestamp != null
              ? currentTime >= a.timestamp && currentTime <= a.endTimestamp
              : Math.abs(currentTime - a.timestamp) < 0.5
            if (!inRange) return null
            const flipLeft = a.markerX! > 0.6
            return (
              <div
                key={a.id}
                className={`${s.marker}${isActive ? ` ${s.markerActive}` : ''}`}
                style={{ left: `${a.markerX! * 100}%`, top: `${a.markerY! * 100}%`, cursor: 'grab' }}
                onMouseDown={e => {
                  e.stopPropagation()
                  const raw = wrapperPos(e.clientX, e.clientY)
                  if (!raw) return
                  markerDragRef.current = {
                    annotId: a.id,
                    offsetX: raw.x - a.markerX!,
                    offsetY: raw.y - a.markerY!,
                    didMove: false,
                  }
                }}
                onClick={e => { e.stopPropagation(); if (!markerDragRef.current?.didMove) selectAnnotation(a) }}
              >
                <div className={s.markerPin}>
                  <span className={s.markerNum}>{i + 1}</span>
                  <div className={`${s.markerLabel}${flipLeft ? ` ${s.markerLabelLeft}` : ''}`}>
                    <div className={s.markerAuthor}>{a.author}</div>
                    <div className={s.markerComment}>{a.comment}</div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Pending marker — inline editor */}
          {pendingTs !== null && pendingMarker && (
            <div
              className={s.inlineEditor}
              style={{ left: `${pendingMarker.x * 100}%`, top: `${pendingMarker.y * 100}%` }}
              onClick={e => e.stopPropagation()}
            >
              <div className={`${s.inlineEditorInner}${pendingMarker.x > 0.55 ? ` ${s.inlineEditorLeft}` : ''}`}>
                <div
                  className={s.markerPin}
                  style={{ cursor: 'grab' }}
                  onMouseDown={e => {
                    e.stopPropagation()
                    const raw = wrapperPos(e.clientX, e.clientY)
                    if (!raw || !pendingMarker) return
                    markerDragRef.current = {
                      annotId: 'pending',
                      offsetX: raw.x - pendingMarker.x,
                      offsetY: raw.y - pendingMarker.y,
                      didMove: false,
                    }
                  }}
                >
                  <span className={s.markerNum} style={{ background: 'var(--accent)' }}>+</span>
                </div>
                <div className={s.inlineForm}>
                  {isClient && (
                    <input
                      className={s.inlineInput}
                      placeholder="YOUR NAME"
                      value={authorName}
                      onChange={e => setAuthorName(e.target.value)}
                    />
                  )}
                  <textarea
                    ref={noteRef}
                    className={s.inlineTextarea}
                    placeholder="Add note…"
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    autoFocus={!drawActive}
                    rows={3}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitAnnotation() }
                      if (e.key === 'Escape') cancelAnnotation()
                    }}
                  />
                  <div className={s.inlineActions}>
                    {/* Draw toggle */}
                    <button
                      className={s.inlineDrawBtn}
                      style={{ background: drawActive ? 'var(--black)' : undefined, color: drawActive ? 'var(--white)' : undefined }}
                      onClick={toggleDraw}
                      title="Draw on frame"
                    >✏</button>
                    {drawActive && (
                      <>
                        {['#FF4D00', '#ffffff', '#1a1a1a'].map(c => (
                          <button key={c} onClick={() => setDrawColor(c)} style={{ width: 12, height: 12, background: c, border: drawColor === c ? '2px solid var(--accent)' : '1px solid var(--gray-30)', cursor: 'pointer', flexShrink: 0 }} />
                        ))}
                        <button style={{ fontSize: 11, color: 'var(--gray-50)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }} onClick={() => { setDrawnPaths(p => p.slice(0, -1)); setPathMeta(p => p.slice(0, -1)) }} disabled={drawnPaths.length === 0}>↩</button>
                      </>
                    )}
                    <span style={{ flex: 1 }} />
                    <button className={s.inlineCancelBtn} onClick={cancelAnnotation}>✕</button>
                    <button
                      className={s.inlineSaveBtn}
                      onClick={submitAnnotation}
                      disabled={!commentText.trim() || submitting || (isClient && !authorName.trim())}
                    >
                      {submitting ? '…' : '↵'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pending marker — no position yet */}
          {pendingTs !== null && !pendingMarker && (
            <div className={s.videoClickHint}>CLICK TO PLACE MARKER</div>
          )}
        </div>

        {/* Controls */}
        <div className={s.controls}>
          <button className={s.ctrlBtn} onClick={togglePlay}>{isPlaying ? 'PAUSE' : 'PLAY'}</button>
          <button className={s.ctrlBtn} onClick={stop}>STOP</button>
          <span className={s.ctrlSep} />
          <button className={s.ctrlBtn} onClick={() => stepFrame(-1)}>‹</button>
          <button className={s.ctrlBtn} onClick={() => stepFrame(1)}>›</button>
          <span className={s.ctrlSep} />
          <button className={s.ctrlBtn} onClick={() => changeRate(Math.max(0.25, +(playbackRate - 0.25).toFixed(2)))}>–</button>
          <span className={s.timecode} style={{ minWidth: 32, textAlign: 'center' }}>{playbackRate}×</span>
          <button className={s.ctrlBtn} onClick={() => changeRate(Math.min(2, +(playbackRate + 0.25).toFixed(2)))}>+</button>
          <span className={s.ctrlSep} />
          <button className={s.ctrlBtn} onClick={toggleMute}>{muted ? '▣' : '▷'}</button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
            onChange={e => changeVolume(parseFloat(e.target.value))}
            style={{ width: 52, accentColor: 'var(--black)', cursor: 'pointer' }} />
          <span className={s.ctrlSep} />
          <span className={s.timecode}>{formatTimecode(currentTime)}</span>
          <span className={s.timecodeAlt}>&nbsp;/&nbsp;{formatTimecode(duration)}</span>
          {pendingTs === null
            ? <button className={`${s.ctrlBtn} ${s['ctrlBtn--annotate']}`} onClick={openAnnotation}>+ ANNOTATE</button>
            : <>
                <button className={`${s.drawBtn}${drawActive ? ` ${s['drawBtn--active']}` : ''}`} onClick={toggleDraw}>✏ DRAW</button>
                {drawActive && (
                  <>
                    {['#FF4D00', '#ffffff', '#1a1a1a'].map(c => (
                      <button key={c} onClick={() => setDrawColor(c)} style={{ width: 12, height: 12, background: c, border: drawColor === c ? '2px solid var(--accent)' : '1px solid var(--gray-30)', cursor: 'pointer', flexShrink: 0 }} />
                    ))}
                    <button className={s.ctrlBtn} onClick={() => { setDrawnPaths(p => p.slice(0, -1)); setPathMeta(p => p.slice(0, -1)) }} disabled={drawnPaths.length === 0} style={{ opacity: drawnPaths.length === 0 ? .3 : 1 }}>↩</button>
                    <button className={s.ctrlBtn} onClick={() => { setDrawnPaths([]); setPathMeta([]) }} disabled={drawnPaths.length === 0} style={{ opacity: drawnPaths.length === 0 ? .3 : 1 }}>✕</button>
                  </>
                )}
                <button className="btn btn--ghost" style={{ fontSize: 10 }} onClick={cancelAnnotation}>CANCEL</button>
              </>
          }
        </div>

        {/* Timeline */}
        <Timeline
          currentTime={currentTime}
          duration={duration}
          buffered={buffered}
          annotations={annotations}
          activeId={activeId}
          videoId={videoId}
          videoRef={videoRef}
          onSeek={t => { const v = videoRef.current; if (v) v.currentTime = t }}
          onSelectAnnotation={selectAnnotation}
          onAnnotationRangeChange={(id, start, end) => {
            setAnnotations(p => p.map(a => a.id === id ? { ...a, timestamp: start, endTimestamp: end } : a).sort((a, b) => a.timestamp - b.timestamp))
          }}
        />


        {/* Key hints — always visible */}
        {!isClient && (
          <div className={s.keyHints}>
            {[['SPACE', 'PLAY'], ['← →', 'FRAME'], [', .', 'SPEED'], ['M', 'MUTE'], ['A', 'ANNOTATE'], ['ESC', 'CANCEL']].map(([k, hint]) => (
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

        {/* Video info panel */}
        <div className={s.videoInfo}>
          {videoTitle && <div className={s.videoInfoTitle}>{videoTitle}</div>}
          <div className={s.videoInfoMeta}>
            {videoDuration != null && <span>{formatDuration(videoDuration)}</span>}
            {videoSize != null && <span>{formatBytes(videoSize)}</span>}
            {videoFilename && <span className={s.videoInfoFilename}>{videoFilename}</span>}
          </div>
          {versionNote && <div className={s.videoInfoVersion}>{versionNote}</div>}
          {videoDescription && <div className={s.videoInfoDesc}>{videoDescription}</div>}
          {tags && tags.length > 0 && (
            <div className={s.videoInfoTags}>
              {tags.map(t => <span key={t} className={s.videoInfoTag}>{t}</span>)}
            </div>
          )}
          <a
            href={videoUrl}
            download={videoFilename ?? 'video'}
            className={s.downloadBtn}
          >↓ DOWNLOAD</a>
        </div>

        <div className={s.listHeader}>
          <span className="lbl">ANNOTATIONS</span>
          <span className={s.listCount}>{String(annotations.length).padStart(2, '0')}</span>
        </div>

        <div className={s.listScroll}>
          {annotations.length === 0 && <div className={s.empty}>NO ANNOTATIONS YET</div>}
          {annotations.map(a => (
            <div key={a.id} className={`${s.annotItem}${a.id === activeId ? ` ${s.annotItemActive}` : ''}`} onClick={() => selectAnnotation(a)}>
              <div className={s.annotHead}>
                <span className={s.annotTs}>
                  {formatShort(a.timestamp)}{a.endTimestamp ? ` → ${formatShort(a.endTimestamp)}` : ''}
                </span>
                <span className={`role-badge${a.role === 'CLIENT' ? ' role-badge--client' : ''}`}>{a.role === 'CLIENT' ? 'CLIENT' : 'DIRECTOR'}</span>
                <span className={s.annotType} title={a.drawing ? 'Drawing + note' : 'Note'}>
                  {a.drawing ? '✏' : '✎'}
                </span>
                {a.resolved && <span className={s.resolvedBadge}>✓</span>}
              </div>
              <div className={s.annotAuthor}>{a.author}</div>

              {editId === a.id ? (
                <div onClick={e => e.stopPropagation()} style={{ marginTop: 8 }}>
                  {/* Timestamp range editor */}
                  <div className={s.tsEditor}>
                    <div className={s.tsField}>
                      <span className="lbl" style={{ marginBottom: 4, display: 'block' }}>START</span>
                      <span className={s.timecode}>{formatTimecode(editStart)}</span>
                      <button className={s.tsSetBtn} onClick={() => { const v = videoRef.current; if (v) setEditStart(v.currentTime) }}>SET</button>
                    </div>
                    <span className={s.timecodeAlt} style={{ alignSelf: 'flex-end', paddingBottom: 4 }}>→</span>
                    <div className={s.tsField}>
                      <span className="lbl" style={{ marginBottom: 4, display: 'block' }}>END</span>
                      {editEnd !== null ? (
                        <>
                          <span className={s.timecode}>{formatTimecode(editEnd)}</span>
                          <button className={s.tsSetBtn} onClick={() => { const v = videoRef.current; if (v) setEditEnd(v.currentTime) }}>SET</button>
                          <button className={s.tsSetBtn} style={{ color: 'var(--accent)' }} onClick={() => setEditEnd(null)}>✕</button>
                        </>
                      ) : (
                        <button className={s.tsSetBtn} onClick={() => { const v = videoRef.current; if (v) setEditEnd(v.currentTime) }}>+ SET END</button>
                      )}
                    </div>
                  </div>
                  <textarea className={s.formTextarea} value={editText} onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(a.id); if (e.key === 'Escape') setEditId(null) }}
                    style={{ marginTop: 8 }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button className="btn btn--ghost" style={{ fontSize: 9 }} onClick={() => setEditId(null)}>CANCEL</button>
                    <button className="btn btn--primary" style={{ fontSize: 9 }} onClick={() => saveEdit(a.id)}>SAVE</button>
                  </div>
                </div>
              ) : (
                <div className={s.annotComment}>{a.comment}</div>
              )}

              {!isClient && editId !== a.id && (
                <div className={s.annotActions} onClick={e => e.stopPropagation()}>
                  {!a.resolved && <button className={s.annotAction} onClick={() => resolveAnnotation(a.id)}>RESOLVE</button>}
                  <button className={s.annotAction} onClick={() => startEdit(a)}>EDIT</button>
                  <button className={s.annotAction} style={{ color: 'var(--accent)' }} onClick={() => deleteAnnotation(a.id)}>DELETE</button>
                </div>
              )}

              <div className={s.annotDate}>{new Date(a.createdAt).toLocaleDateString('de-CH')}</div>
            </div>
          ))}
        </div>

        {!isClient && (
          <div className={s.shareRow}>
            <span className="lbl">CLIENT LINK</span>
            {shareUrl ? (
              <>
                <span className={s.shareLink}>{shareUrl}</span>
                <button className="btn btn--ghost" style={{ fontSize: 10 }} onClick={copyShare}>{copyLabel}</button>
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
