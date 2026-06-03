'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import s from './VideoAnnotator.module.css'

interface Point { x: number; y: number }

export interface AnnotationData {
  id: string
  timestamp: number
  endTimestamp?: number | null
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

export default function VideoAnnotator({ videoUrl, videoId, initialAnnotations, isClient, shareToken }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
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

  // New annotation form
  const [pendingTs, setPendingTs] = useState<number | null>(null)
  const [pendingEnd, setPendingEnd] = useState<number | null>(null)
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
      try {
        const parsed = JSON.parse(active.drawing)
        if (Array.isArray(parsed)) (parsed as Point[][]).forEach(p => renderPath(p))
        else parsed.paths.forEach((p: Point[], i: number) => renderPath(p, parsed.meta?.[i]?.color ?? '#FF4D00', parsed.meta?.[i]?.width ?? 2))
      } catch {}
    }

    // Only show in-progress strokes when annotation form is open
    if (pendingTs !== null) {
      drawnPaths.forEach((p, i) => renderPath(p, pathMeta[i]?.color ?? drawColor, pathMeta[i]?.width ?? drawWidth))
      if (currentPath.length > 1) renderPath(currentPath, drawColor, drawWidth)
    }
  }, [annotations, activeId, drawnPaths, currentPath, pathMeta, drawColor, drawWidth, pendingTs])

  useEffect(() => { redraw() }, [redraw])

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
  const seek = (e: React.MouseEvent<HTMLDivElement>) => { const v = videoRef.current; if (!v || !duration) return; const r = e.currentTarget.getBoundingClientRect(); v.currentTime = ((e.clientX - r.left) / r.width) * duration }

  // Annotation actions
  const openAnnotation = useCallback(() => {
    const v = videoRef.current; if (!v) return
    v.pause(); setPendingTs(v.currentTime); setCommentText(''); setDrawnPaths([]); setPathMeta([]); setCurrentPath([]); setDrawActive(false)
  }, [])

  const cancelAnnotation = useCallback(() => {
    setPendingTs(null); setPendingEnd(null); setCommentText(''); setDrawnPaths([]); setPathMeta([]); setCurrentPath([]); setDrawActive(false)
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

  const startEdit = (a: AnnotationData) => { setEditId(a.id); setEditText(a.comment) }

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return
    const res = await fetch(`/api/videos/${videoId}/annotations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: editText }) })
    if (res.ok) { setAnnotations(p => p.map(a => a.id === id ? { ...a, comment: editText } : a)); setEditId(null) }
  }

  const generateShare = async () => {
    const res = await fetch(`/api/videos/${videoId}/share`, { method: 'POST' })
    if (res.ok) { const { token } = await res.json(); setShareUrl(`${window.location.origin}/client/${token}`) }
  }

  const copyShare = () => { navigator.clipboard.writeText(shareUrl); setCopyLabel('COPIED'); setTimeout(() => setCopyLabel('COPY LINK'), 2000) }

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

  return (
    <div className={s.root}>
      {/* ── Video column ── */}
      <div className={s.videoCol}>
        <div className={s.videoWrapper}>
          <video ref={videoRef} className={s.video} src={videoUrl}
            onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
            onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
            onProgress={() => { const v = videoRef.current; if (v?.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)) }}
            onPlay={() => { setIsPlaying(true); setActiveId(null) }} onPause={() => setIsPlaying(false)} playsInline
          />
          <canvas ref={canvasRef} className={s.canvas} style={canvasStyle}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          />
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
          {pendingTs === null && (
            <button className={`${s.ctrlBtn} ${s['ctrlBtn--annotate']}`} onClick={openAnnotation}>+ ANNOTATE</button>
          )}
        </div>

        {/* Timeline */}
        <div className={s.timeline} onClick={seek}>
          <div className={s.timelineTrack} />
          <div className={s.timelineBuffered} style={{ width: duration ? `${(buffered / duration) * 100}%` : '0%' }} />
          <div className={s.timelinePlayhead} style={{ left: duration ? `${(currentTime / duration) * 100}%` : '0%' }} />
          {annotations.map(a => a.endTimestamp && duration ? (
            <div key={a.id}
              className={`${s.timelineRange}${a.id === activeId ? ` ${s.timelineRangeActive}` : ''}`}
              style={{ left: `${(a.timestamp / duration) * 100}%`, width: `${((a.endTimestamp - a.timestamp) / duration) * 100}%` }}
              onClick={e => { e.stopPropagation(); selectAnnotation(a) }}
              title={`${formatShort(a.timestamp)} → ${formatShort(a.endTimestamp)} — ${a.author}`}
            />
          ) : (
            <div key={a.id} className={`${s.timelineMark}${a.id === activeId ? ` ${s.timelineMarkActive}` : ''}`}
              style={{ left: duration ? `${(a.timestamp / duration) * 100}%` : '0%' }}
              onClick={e => { e.stopPropagation(); selectAnnotation(a) }}
              title={`${formatShort(a.timestamp)} — ${a.author}`}
            />
          ))}
        </div>

        {/* Annotation form */}
        {pendingTs !== null && (
          <div className={s.form}>
            {/* Frame + draw toolbar */}
            <div className={s.formToolbar}>
              <span className={s.timecode}>{formatTimecode(pendingTs)}</span>
              {pendingEnd ? (
                <>
                  <span className={s.timecodeAlt}> → </span>
                  <span className={s.timecode}>{formatTimecode(pendingEnd)}</span>
                  <button className={s.ctrlBtn} style={{ fontSize: 9, opacity: .6 }} onClick={() => setPendingEnd(null)}>✕</button>
                </>
              ) : (
                <button className={s.ctrlBtn} style={{ fontSize: 10, marginLeft: 4 }}
                  onClick={() => { const v = videoRef.current; if (v) setPendingEnd(v.currentTime) }}
                  title="Mark current position as end of range"
                >+ END</button>
              )}

              {/* draw tools — only when active */}
              {drawActive && (
                <div className={s.drawTools}>
                  {['#FF4D00', '#ffffff', '#1a1a1a'].map(c => (
                    <button key={c} onClick={() => setDrawColor(c)} style={{ width: 14, height: 14, background: c, border: drawColor === c ? '2px solid var(--accent)' : '1px solid var(--gray-30)', cursor: 'pointer', flexShrink: 0 }} />
                  ))}
                  <span className={s.ctrlSep} style={{ margin: '0 4px' }} />
                  {[{ w: 1.5, l: '—' }, { w: 4, l: '━' }].map(({ w, l }) => (
                    <button key={w} className={`${s.ctrlBtn}${drawWidth === w ? ` ${s['ctrlBtn--active']}` : ''}`} onClick={() => setDrawWidth(w)} style={{ fontSize: 13 }}>{l}</button>
                  ))}
                  <span className={s.ctrlSep} style={{ margin: '0 4px' }} />
                  <button className={s.ctrlBtn} onClick={() => { setDrawnPaths(p => p.slice(0, -1)); setPathMeta(p => p.slice(0, -1)) }} disabled={drawnPaths.length === 0} style={{ opacity: drawnPaths.length === 0 ? 0.3 : 1 }}>↩</button>
                  <button className={s.ctrlBtn} onClick={() => { setDrawnPaths([]); setPathMeta([]) }} disabled={drawnPaths.length === 0} style={{ opacity: drawnPaths.length === 0 ? 0.3 : 1 }}>✕</button>
                  {drawnPaths.length > 0 && <span className="lbl" style={{ color: 'var(--accent)' }}>{drawnPaths.length}</span>}
                </div>
              )}

              {/* draw toggle — pushed to the right */}
              <button className={`${s.drawBtn}${drawActive ? ` ${s['drawBtn--active']}` : ''}`} onClick={() => setDrawActive(p => !p)}>
                ✏ DRAW
              </button>
            </div>
            {isClient && (
              <input className={s.formNameInput} placeholder="YOUR NAME" value={authorName} onChange={e => setAuthorName(e.target.value)} />
            )}
            <textarea className={s.formTextarea} placeholder="COMMENT" value={commentText}
              onChange={e => setCommentText(e.target.value)} autoFocus={!isClient}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAnnotation() }}
            />
            <div className={s.formActions}>
              <button className="btn btn--ghost" onClick={cancelAnnotation}>CANCEL</button>
              <button className="btn btn--primary" onClick={submitAnnotation}
                disabled={!commentText.trim() || submitting || (isClient && !authorName.trim())}
                style={{ opacity: (!commentText.trim() || (isClient && !authorName.trim())) ? .4 : 1 }}>
                {submitting ? 'SAVING…' : 'SAVE  ⌘↵'}
              </button>
            </div>
          </div>
        )}

        {/* Key hints */}
        {!isClient && pendingTs === null && (
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
                {a.drawing && <span className={s.annotDrawn}>✎</span>}
                {a.resolved && <span className={s.resolvedBadge}>✓</span>}
              </div>
              <div className={s.annotAuthor}>{a.author}</div>

              {editId === a.id ? (
                <div onClick={e => e.stopPropagation()}>
                  <textarea className={s.formTextarea} value={editText} onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(a.id); if (e.key === 'Escape') setEditId(null) }}
                    autoFocus style={{ marginTop: 6 }}
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
