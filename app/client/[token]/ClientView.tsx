'use client'

import { useState, useEffect } from 'react'
import VideoAnnotator, { type AnnotationData } from '@/app/review/[id]/VideoAnnotator'

interface Props {
  videoUrl: string
  videoId: string
  shareToken: string
  videoTitle: string
  annotations: AnnotationData[]
  videoDuration?: number | null
}

export default function ClientView({ videoUrl, videoId, shareToken, videoTitle, annotations, videoDuration }: Props) {
  const storageKey = `client-name-${shareToken}`
  const [clientName, setClientName] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem(storageKey)
    if (stored) setClientName(stored)
    setReady(true)
  }, [storageKey])

  const join = () => {
    const name = input.trim()
    if (!name) return
    sessionStorage.setItem(storageKey, name)
    setClientName(name)
  }

  if (!ready) return null

  if (!clientName) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--white)',
      }}>
        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--black)', marginBottom: 8 }}>
              FLICKBACK
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--black)', lineHeight: 1.2 }}>
              {videoTitle}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--gray-10)', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--gray-50)' }}>
              YOUR NAME
            </label>
            <input
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && join()}
              placeholder="Enter your name…"
              style={{
                width: '100%', fontSize: 14, fontFamily: 'var(--font-swiss)',
                border: 'none', borderBottom: '1px solid var(--gray-30)',
                padding: '8px 0', outline: 'none', background: 'transparent',
                color: 'var(--black)',
              }}
            />
          </div>

          <button
            onClick={join}
            disabled={!input.trim()}
            className="btn btn--primary"
            style={{ alignSelf: 'flex-start', opacity: input.trim() ? 1 : 0.35 }}
          >
            JOIN REVIEW
          </button>
        </div>
      </div>
    )
  }

  return (
    <VideoAnnotator
      videoUrl={videoUrl}
      videoId={videoId}
      initialAnnotations={annotations}
      isClient
      clientName={clientName}
      shareToken={shareToken}
      videoTitle={videoTitle}
      videoDuration={videoDuration}
    />
  )
}
