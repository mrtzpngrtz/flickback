'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { VIDEO_MIME_TYPES } from '@/lib/utils'

interface UploadState {
  status: 'idle' | 'preparing' | 'uploading' | 'saving' | 'done' | 'error'
  progress: number
  error?: string
}

export default function UploadPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [state, setState] = useState<UploadState>({ status: 'idle', progress: 0 })

  const acceptFile = useCallback((f: File) => {
    const isVideo = VIDEO_MIME_TYPES.includes(f.type) || /\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(f.name)
    if (!isVideo) {
      setState({ status: 'error', progress: 0, error: 'UNSUPPORTED FORMAT' })
      return
    }
    setFile(f)
    setTitle(
      f.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    )
    setState({ status: 'idle', progress: 0 })
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files[0]
      if (f) acceptFile(f)
    },
    [acceptFile]
  )

  const upload = async () => {
    if (!file || !title.trim()) return
    setState({ status: 'preparing', progress: 0 })

    try {
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mimeType: file.type || 'video/mp4' }),
      })
      if (!presignRes.ok) throw new Error('Failed to get upload URL')
      const { uploadUrl, storageKey } = await presignRes.json()

      setState({ status: 'uploading', progress: 0 })
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setState({ status: 'uploading', progress: (e.loaded / e.total) * 100 })
        }
        xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(file)
      })

      setState({ status: 'saving', progress: 100 })
      const createRes = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          filename: file.name,
          storageKey,
          mimeType: file.type || 'video/mp4',
          size: file.size,
        }),
      })
      if (!createRes.ok) throw new Error('Failed to save video')
      const video = await createRes.json()

      setState({ status: 'done', progress: 100 })
      setTimeout(() => router.push(`/review/${video.id}`), 600)
    } catch (err) {
      setState({
        status: 'error',
        progress: 0,
        error: err instanceof Error ? err.message.toUpperCase() : 'UPLOAD FAILED',
      })
    }
  }

  const isWorking = ['preparing', 'uploading', 'saving'].includes(state.status)
  const isDone = state.status === 'done'

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 48 }}>
        <div className="num-sm">UPLOAD</div>
        <div className="lbl" style={{ marginTop: 8 }}>MP4 · MOV · WEBM · AVI</div>
      </div>

      {/* Drop zone */}
      <div
        className={`dropzone${dragging ? ' dropzone--over' : ''}`}
        style={{ marginBottom: 40 }}
        onClick={() => !file && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="dropzone__corner dropzone__corner--tl reg" />
        <span className="dropzone__corner dropzone__corner--tr reg" />
        <span className="dropzone__corner dropzone__corner--bl reg" />
        <span className="dropzone__corner dropzone__corner--br reg" />

        {file ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{file.name}</div>
            <div className="lbl" style={{ marginTop: 6 }}>
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </div>
            {!isWorking && !isDone && (
              <button
                className="btn btn--ghost"
                style={{ marginTop: 12 }}
                onClick={e => {
                  e.stopPropagation()
                  setFile(null)
                  setTitle('')
                  setState({ status: 'idle', progress: 0 })
                  if (inputRef.current) inputRef.current.value = ''
                }}
              >
                REMOVE
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="dropzone__label">DROP HERE</div>
            <div className="dropzone__sublabel">OR CLICK TO BROWSE</div>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) acceptFile(f) }}
        />
      </div>

      {/* Title field */}
      {file && !isWorking && !isDone && (
        <div style={{ marginBottom: 32 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>TITLE</div>
          <input
            className="field"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="VIDEO TITLE"
            style={{ fontWeight: 500 }}
          />
        </div>
      )}

      {/* Progress */}
      {isWorking && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="lbl">
              {state.status === 'preparing' ? 'PREPARING' : state.status === 'uploading' ? 'UPLOADING' : 'SAVING'}
            </span>
            <span className="px accent">{String(Math.round(state.progress)).padStart(3, '0')}%</span>
          </div>
          <div className="progress-track">
            <div
              className={`progress-fill${state.status === 'saving' ? ' progress-fill--complete' : ''}`}
              style={{ width: `${state.progress}%` }}
            />
          </div>
        </div>
      )}

      {isDone && (
        <div className="lbl" style={{ color: 'var(--accent)', marginBottom: 16 }}>DONE — OPENING REVIEW</div>
      )}

      {state.status === 'error' && (
        <div className="lbl" style={{ color: 'var(--accent)', marginBottom: 16 }}>
          ERROR: {state.error}
        </div>
      )}

      {file && !isWorking && !isDone && (
        <button
          className="btn btn--primary"
          onClick={upload}
          disabled={!title.trim()}
          style={{ opacity: title.trim() ? 1 : 0.4 }}
        >
          UPLOAD
        </button>
      )}
    </main>
  )
}
