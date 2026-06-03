'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import type { AnnotationData } from './VideoAnnotator'
import s from './Timeline.module.css'

interface Props {
  currentTime: number
  duration: number
  buffered: number
  annotations: AnnotationData[]
  activeId: string | null
  videoId: string
  videoRef: React.RefObject<HTMLVideoElement | null>
  onSeek: (t: number) => void
  onSelectAnnotation: (a: AnnotationData) => void
  onAnnotationRangeChange: (id: string, start: number, end: number | null) => void
}

function formatShort(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function tickInterval(duration: number): { major: number; minor: number } {
  if (duration <= 30)   return { major: 5,   minor: 1 }
  if (duration <= 120)  return { major: 15,  minor: 5 }
  if (duration <= 300)  return { major: 30,  minor: 10 }
  if (duration <= 600)  return { major: 60,  minor: 15 }
  if (duration <= 1800) return { major: 300, minor: 60 }
  return { major: 600, minor: 120 }
}

export default function Timeline({
  currentTime, duration, buffered, annotations, activeId,
  videoId, videoRef, onSeek, onSelectAnnotation, onAnnotationRangeChange,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const scrubBarRef = useRef<HTMLDivElement>(null)
  const annotLineRef = useRef<HTMLDivElement>(null)

  // Drive both playhead elements via RAF
  useEffect(() => {
    let raf: number
    const tick = () => {
      const v = videoRef.current
      if (v && duration) {
        const pct = `${(v.currentTime / duration) * 100}%`
        if (scrubBarRef.current)  scrubBarRef.current.style.left  = pct
        if (annotLineRef.current) annotLineRef.current.style.left = pct
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [videoRef, duration])
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const dragRef = useRef<{ annotId: string; handle: 'start' | 'end' | 'move'; initX: number; initTs: number; initEnd: number | null } | null>(null)
  const [dragState, setDragState] = useState<{ annotId: string; start: number; end: number | null } | null>(null)
  const savingRef = useRef(false)

  const xToTime = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || !duration) return 0
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration))
  }, [duration])

  // Global mouse move/up for scrubbing and dragging
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (scrubbing) { onSeek(xToTime(e.clientX)); return }
      if (!dragRef.current) return
      const d = dragRef.current
      const t = xToTime(e.clientX)
      const annot = annotations.find(a => a.id === d.annotId)
      if (!annot) return

      if (d.handle === 'start') {
        const end = dragState?.end ?? annot.endTimestamp ?? null
        const clampedStart = end !== null ? Math.min(t, end - 0.5) : t
        setDragState({ annotId: d.annotId, start: clampedStart, end })
      } else if (d.handle === 'end') {
        const start = dragState?.start ?? annot.timestamp
        setDragState({ annotId: d.annotId, start, end: Math.max(t, start + 0.5) })
      } else {
        // move whole annotation
        const dur = (annot.endTimestamp ?? annot.timestamp) - annot.timestamp
        const newStart = Math.max(0, Math.min(duration - dur, t - (d.initTs - annot.timestamp + (t - d.initX / 1))))
        setDragState({ annotId: d.annotId, start: newStart, end: dur > 0 ? newStart + dur : null })
      }
    }

    const onUp = async (e: MouseEvent) => {
      if (scrubbing) { setScrubbing(false); return }
      if (!dragRef.current || !dragState) { dragRef.current = null; return }
      const { annotId, start, end } = dragState
      dragRef.current = null
      setDragState(null)
      if (savingRef.current) return
      savingRef.current = true
      await fetch(`/api/videos/${videoId}/annotations/${annotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: start, endTimestamp: end }),
      })
      savingRef.current = false
      onAnnotationRangeChange(annotId, start, end)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [scrubbing, xToTime, onSeek, dragState, annotations, duration, videoId, onAnnotationRangeChange])

  const onTrackDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-handle]')) return
    setScrubbing(true)
    onSeek(xToTime(e.clientX))
  }

  const onHandleDown = (e: React.MouseEvent, annotId: string, handle: 'start' | 'end' | 'move') => {
    e.stopPropagation()
    const annot = annotations.find(a => a.id === annotId)!
    dragRef.current = { annotId, handle, initX: e.clientX, initTs: annot.timestamp, initEnd: annot.endTimestamp ?? null }
    setDragState({ annotId, start: annot.timestamp, end: annot.endTimestamp ?? null })
  }

  const { major, minor } = tickInterval(duration)
  const ticks: { t: number; isMajor: boolean }[] = []
  if (duration && minor) {
    for (let t = 0; t <= duration; t += minor) {
      ticks.push({ t, isMajor: t % major === 0 })
    }
  }

  return (
    <div className={s.root}>
      {/* Ruler */}
      <div className={s.ruler}>
        {ticks.map(({ t, isMajor }) => (
          <div key={t} className={isMajor ? s.tickMajor : s.tickMinor}
            style={{ left: `${(t / duration) * 100}%` }}>
            {isMajor && t > 0 && <span className={s.tickLabel}>{formatShort(t)}</span>}
          </div>
        ))}
      </div>

      {/* ── Scrub track ── */}
      <div ref={trackRef} className={s.scrubTrack}
        onMouseDown={onTrackDown}
        onMouseMove={e => setHoverTime(xToTime(e.clientX))}
        onMouseLeave={() => setHoverTime(null)}
      >
        <div className={s.buffered} style={{ width: duration ? `${(buffered / duration) * 100}%` : '0%' }} />
        {hoverTime !== null && !scrubbing && (
          <div className={s.hoverLine} style={{ left: `${(hoverTime / duration) * 100}%` }}>
            <span className={s.hoverLabel}>{formatShort(hoverTime)}</span>
          </div>
        )}
        <div ref={scrubBarRef} className={s.scrubBar} style={{ left: '0%' }} />
      </div>

      {/* ── Annotation track ── */}
      <div className={s.annotTrack}>
        {/* Playhead ghost line */}
        <div ref={annotLineRef} className={s.playhead} style={{ left: '0%' }} />

        {annotations.map(a => {
          const ds = dragState?.annotId === a.id ? dragState : null
          const start = ds?.start ?? a.timestamp
          const end = ds?.end ?? a.endTimestamp ?? null
          const isRange = end !== null
          const isActive = a.id === activeId
          const left = duration ? (start / duration) * 100 : 0

          if (isRange) {
            const width = Math.max(0.3, ((end - start) / duration) * 100)
            return (
              <div key={a.id}
                className={`${s.range}${isActive ? ` ${s.rangeActive}` : ''}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                onClick={e => { e.stopPropagation(); onSelectAnnotation(a) }}
              >
                <div className={s.handleLeft} data-handle="start" onMouseDown={e => onHandleDown(e, a.id, 'start')} />
                <div className={s.handleRight} data-handle="end" onMouseDown={e => onHandleDown(e, a.id, 'end')} />
              </div>
            )
          }

          return (
            <div key={a.id}
              className={`${s.mark}${isActive ? ` ${s.markActive}` : ''}`}
              style={{ left: `${left}%` }}
              data-handle="move"
              onMouseDown={e => onHandleDown(e, a.id, 'move')}
              onClick={e => { e.stopPropagation(); onSelectAnnotation(a) }}
              title={`${formatShort(a.timestamp)} — ${a.author}`}
            />
          )
        })}
      </div>
    </div>
  )
}
