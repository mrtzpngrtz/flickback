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

function fmt(s: number) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function fmtFrames(s: number, fps = 24) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), f = Math.floor((s % 1) * fps)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(f).padStart(2, '0')}`
}

const LANE_H   = 20   // px per lane
const LANE_PAD = 3    // px padding top/bottom within lane

// Assign each annotation to a non-overlapping swim lane
function assignLanes(annotations: AnnotationData[]): Map<string, number> {
  const sorted = [...annotations].sort((a, b) => a.timestamp - b.timestamp)
  const laneEnds: number[] = []  // end time of last annotation in each lane
  const map = new Map<string, number>()
  for (const a of sorted) {
    const start = a.timestamp
    const end   = (a.endTimestamp ?? a.timestamp) + 0.001
    let lane    = laneEnds.findIndex(e => e <= start)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0) }
    laneEnds[lane] = end
    map.set(a.id, lane)
  }
  return map
}

function adaptiveTicks(visibleDur: number): { major: number; minor: number; showFrames: boolean } {
  if (visibleDur <= 2)   return { major: 1,   minor: 1/24, showFrames: true }
  if (visibleDur <= 10)  return { major: 1,   minor: 0.5,  showFrames: false }
  if (visibleDur <= 30)  return { major: 5,   minor: 1,    showFrames: false }
  if (visibleDur <= 120) return { major: 15,  minor: 5,    showFrames: false }
  if (visibleDur <= 300) return { major: 30,  minor: 10,   showFrames: false }
  if (visibleDur <= 600) return { major: 60,  minor: 15,   showFrames: false }
  return { major: 300, minor: 60, showFrames: false }
}

export default function Timeline({
  currentTime, duration, buffered, annotations, activeId,
  videoId, videoRef, onSeek, onSelectAnnotation, onAnnotationRangeChange,
}: Props) {
  const rootRef    = useRef<HTMLDivElement>(null)
  const scrubBarRef  = useRef<HTMLDivElement>(null)
  const annotLineRef = useRef<HTMLDivElement>(null)

  const [zoom, setZoom]         = useState(1)       // 1 = whole video visible
  const [offset, setOffset]     = useState(0)       // 0–1 fraction of scrollable range
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const [panning, setPanning]   = useState(false)
  const panStartRef = useRef<{ x: number; offset: number } | null>(null)

  const dragRef         = useRef<{ annotId: string; handle: 'start' | 'end' | 'move'; grabOffset: number; initEnd: number | null; didMove: boolean } | null>(null)
  const [dragState, setDragState] = useState<{ annotId: string; start: number; end: number | null } | null>(null)
  const dragStateRef    = useRef(dragState)   // always-current ref, avoids effect churn
  const savingRef       = useRef(false)
  const dragJustEndedRef = useRef(false)

  // Keep dragStateRef in sync
  useEffect(() => { dragStateRef.current = dragState }, [dragState])

  // Derived view window
  const visibleDur = duration / zoom
  const maxOffset  = Math.max(0, duration - visibleDur)
  const offsetTime = offset * maxOffset   // time at left edge

  const clampOffset = useCallback((o: number) => Math.max(0, Math.min(1, o)), [])

  // Convert client X to time
  const xToTime = useCallback((clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect || !duration) return 0
    const frac = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(duration, offsetTime + frac * visibleDur))
  }, [duration, offsetTime, visibleDur])

  // Convert time to left% within visible window
  const timeToLeft = useCallback((t: number) => {
    if (!duration) return 0
    return ((t - offsetTime) / visibleDur) * 100
  }, [duration, offsetTime, visibleDur])

  // RAF: update playhead + auto-scroll
  useEffect(() => {
    let raf: number
    const tick = () => {
      const v = videoRef.current
      if (v && duration) {
        const t = v.currentTime
        const localFrac = (t - offsetTime) / visibleDur

        // Auto-scroll: keep playhead in view when playing
        if (!v.paused && (localFrac < 0.05 || localFrac > 0.9)) {
          const newOffsetTime = Math.max(0, Math.min(maxOffset, t - visibleDur * 0.1))
          setOffset(maxOffset > 0 ? newOffsetTime / maxOffset : 0)
        }

        const pct = `${((t - offsetTime) / visibleDur) * 100}%`
        if (scrubBarRef.current)  scrubBarRef.current.style.left  = pct
        if (annotLineRef.current) annotLineRef.current.style.left = pct
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [videoRef, duration, offsetTime, visibleDur, maxOffset])

  // Scroll-wheel zoom centered on mouse
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect || !duration) return
    const mouseFrac = (e.clientX - rect.left) / rect.width
    const mouseTime = offsetTime + mouseFrac * visibleDur
    const factor = e.deltaY < 0 ? 1.25 : 0.8
    const maxZoom = Math.max(10, duration * 24)   // up to 1-frame precision
    const newZoom = Math.max(1, Math.min(maxZoom, zoom * factor))
    const newVisibleDur = duration / newZoom
    const newOffsetTime = Math.max(0, Math.min(duration - newVisibleDur, mouseTime - mouseFrac * newVisibleDur))
    const newMaxOffset = duration - newVisibleDur
    setZoom(newZoom)
    setOffset(newMaxOffset > 0 ? newOffsetTime / newMaxOffset : 0)
  }, [zoom, duration, offsetTime, visibleDur])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  // Global mouse move/up
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (panning && panStartRef.current) {
        const rect = rootRef.current?.getBoundingClientRect()
        if (!rect) return
        const dx = (e.clientX - panStartRef.current.x) / rect.width
        const newOffset = clampOffset(panStartRef.current.offset - dx * zoom)
        setOffset(newOffset)
        return
      }
      if (scrubbing) { onSeek(xToTime(e.clientX)); return }
      if (!dragRef.current) return
      const d = dragRef.current
      d.didMove = true
      const t = xToTime(e.clientX)
      const annot = annotations.find(a => a.id === d.annotId)
      if (!annot) return
      if (d.handle === 'start') {
        const end = dragStateRef.current?.end ?? annot.endTimestamp ?? null
        setDragState({ annotId: d.annotId, start: end !== null ? Math.min(t, end - 1/24) : t, end })
      } else if (d.handle === 'end') {
        const start = dragStateRef.current?.start ?? annot.timestamp
        setDragState({ annotId: d.annotId, start, end: Math.max(t, start + 1/24) })
      } else {
        const dur = (annot.endTimestamp ?? annot.timestamp) - annot.timestamp
        const newStart = Math.max(0, Math.min(duration - Math.max(dur, 0), t - d.grabOffset))
        setDragState({ annotId: d.annotId, start: newStart, end: dur > 0 ? newStart + dur : null })
      }
    }
    const onUp = async (e: MouseEvent) => {
      if (panning) { setPanning(false); panStartRef.current = null; return }
      if (scrubbing) { setScrubbing(false); return }
      if (!dragRef.current) return
      const didMove = dragRef.current.didMove
      if (!dragStateRef.current || !didMove) { dragRef.current = null; return }
      if (didMove) { dragJustEndedRef.current = true; setTimeout(() => { dragJustEndedRef.current = false }, 150) }
      const { annotId, start, end } = dragStateRef.current
      dragRef.current = null; setDragState(null)
      if (savingRef.current) return
      savingRef.current = true
      await fetch(`/api/videos/${videoId}/annotations/${annotId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: start, endTimestamp: end }),
      })
      savingRef.current = false
      onAnnotationRangeChange(annotId, start, end)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [scrubbing, panning, xToTime, onSeek, annotations, duration, videoId, onAnnotationRangeChange, clampOffset, zoom])

  const onTrackDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-handle]')) return
    if (e.button === 1 || e.altKey) {
      e.preventDefault()
      setPanning(true)
      panStartRef.current = { x: e.clientX, offset }
      return
    }
    setScrubbing(true)
    onSeek(xToTime(e.clientX))
  }

  const onHandleDown = (e: React.MouseEvent, annotId: string, handle: 'start' | 'end' | 'move') => {
    e.stopPropagation()
    const annot = annotations.find(a => a.id === annotId)!
    const clickTime = xToTime(e.clientX)
    const grabOffset = handle === 'move' ? clickTime - annot.timestamp : 0
    // For 'end' on a point mark (no endTimestamp), start end at timestamp so drag grows it
    const initEnd = annot.endTimestamp ?? (handle === 'end' ? annot.timestamp : null)
    dragRef.current = { annotId, handle, grabOffset, initEnd, didMove: false }
    setDragState({ annotId, start: annot.timestamp, end: initEnd })
  }

  // Lane assignment (recomputed when annotations or drag changes)
  const liveAnnotations = annotations.map(a => {
    const ds = dragState?.annotId === a.id ? dragState : null
    return ds ? { ...a, timestamp: ds.start, endTimestamp: ds.end } : a
  })
  const laneMap  = assignLanes(liveAnnotations)
  const numLanes = Math.max(1, laneMap.size > 0 ? Math.max(...Array.from(laneMap.values())) + 1 : 1)
  const trackH   = numLanes * LANE_H

  // Ticks
  const { major, minor, showFrames } = adaptiveTicks(visibleDur)
  const ticks: { t: number; isMajor: boolean }[] = []
  if (duration && minor) {
    const startT = Math.floor(offsetTime / minor) * minor
    const endT   = Math.min(duration, offsetTime + visibleDur)
    for (let t = startT; t <= endT + minor; t = +(t + minor).toFixed(6)) {
      if (t < 0 || t > duration) continue
      ticks.push({ t, isMajor: Math.abs(t % major) < minor * 0.01 })
    }
  }

  const resetZoom = () => { setZoom(1); setOffset(0) }

  return (
    <div ref={rootRef} className={s.root}>
      {/* Zoom indicator + controls */}
      <div className={s.zoomBar}>
        <button className={s.zoomBtn} onClick={() => {
          const newZoom = Math.max(1, zoom / 1.5)
          if (newZoom === 1) { setZoom(1); setOffset(0) } else setZoom(newZoom)
        }}>−</button>
        <span className={s.zoomLabel} onClick={resetZoom} title="Reset zoom">
          {zoom < 1.05 ? '1×' : `${zoom.toFixed(zoom < 10 ? 1 : 0)}×`}
        </span>
        <button className={s.zoomBtn} onClick={() => setZoom(z => Math.min(Math.max(10, duration * 24), z * 1.5))}>+</button>
        <span className={s.zoomHint}>scroll to zoom · alt+drag to pan</span>
      </div>

      {/* Ruler */}
      <div className={s.ruler}>
        {ticks.map(({ t, isMajor }) => (
          <div key={t.toFixed(4)} className={isMajor ? s.tickMajor : s.tickMinor}
            style={{ left: `${timeToLeft(t)}%` }}>
            {isMajor && <span className={s.tickLabel}>{showFrames ? fmtFrames(t) : fmt(t)}</span>}
          </div>
        ))}
      </div>

      {/* Scrub track */}
      <div className={s.scrubTrack}
        onMouseDown={onTrackDown}
        onMouseMove={e => setHoverTime(xToTime(e.clientX))}
        onMouseLeave={() => setHoverTime(null)}
        style={{ cursor: panning ? 'grabbing' : scrubbing ? 'col-resize' : 'col-resize' }}
      >
        <div className={s.buffered} style={{ left: `${timeToLeft(0)}%`, width: duration ? `${(buffered / visibleDur) * 100}%` : '0%' }} />
        {hoverTime !== null && !scrubbing && (
          <div className={s.hoverLine} style={{ left: `${timeToLeft(hoverTime)}%` }}>
            <span className={s.hoverLabel}>{showFrames ? fmtFrames(hoverTime) : fmt(hoverTime)}</span>
          </div>
        )}
        <div ref={scrubBarRef} className={s.scrubBar} style={{ left: '0%' }} />
      </div>

      {/* Annotation track — dynamic height, multi-lane */}
      <div
        className={s.annotTrack}
        style={{ height: trackH }}
        onMouseDown={e => { if (e.altKey) { e.preventDefault(); setPanning(true); panStartRef.current = { x: e.clientX, offset } } }}
      >
        {/* Lane dividers */}
        {Array.from({ length: numLanes }).map((_, i) => (
          <div key={i} className={s.laneRow} style={{ top: i * LANE_H, height: LANE_H }} />
        ))}

        <div ref={annotLineRef} className={s.playhead} style={{ left: '0%' }} />

        {liveAnnotations.map(a => {
          const start    = a.timestamp
          const end      = a.endTimestamp ?? null
          const left     = timeToLeft(start)
          const isActive = a.id === activeId
          const lane     = laneMap.get(a.id) ?? 0
          const topPx    = lane * LANE_H + LANE_PAD
          const heightPx = LANE_H - LANE_PAD * 2

          const viewEnd = offsetTime + visibleDur
          if (start > viewEnd + 1 || (end ?? start) < offsetTime - 1) return null

          if (end !== null) {
            const width = Math.max(0.2, ((end - start) / visibleDur) * 100)
            return (
              <div key={a.id}
                className={`${s.stripe}${isActive ? ` ${s.stripeActive}` : ''}`}
                style={{ left: `${left}%`, width: `${width}%`, top: topPx, height: heightPx }}
                onClick={e => { e.stopPropagation(); if (!dragJustEndedRef.current) onSelectAnnotation(a) }}
              >
                <div className={s.handleLeft}  data-handle="start" onMouseDown={e => onHandleDown(e, a.id, 'start')} />
                {/* Middle: move the whole range */}
                <div className={s.handleMove}  data-handle="move"  onMouseDown={e => onHandleDown(e, a.id, 'move')} />
                <div className={s.handleRight} data-handle="end"   onMouseDown={e => onHandleDown(e, a.id, 'end')} />
              </div>
            )
          }
          return (
            <div key={a.id}
              className={s.markWrap}
              style={{ left: `${left}%`, top: topPx, height: heightPx }}
            >
              {/* Move grab zone (left 12px) */}
              <div
                className={`${s.stripeMark}${isActive ? ` ${s.stripeActive}` : ''}`}
                data-handle="move"
                onMouseDown={e => onHandleDown(e, a.id, 'move')}
                onClick={e => { e.stopPropagation(); if (!dragJustEndedRef.current) onSelectAnnotation(a) }}
                title={`${fmt(a.timestamp)} — ${a.author}`}
              />
              {/* Right extend zone — drag to create end timestamp */}
              <div
                className={s.markExtend}
                data-handle="end"
                onMouseDown={e => onHandleDown(e, a.id, 'end')}
                title="Drag to set end"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
