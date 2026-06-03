import { NextRequest, NextResponse } from 'next/server'
import { getPresignedUploadUrl, generateStorageKey } from '@/lib/storage'
import { VIDEO_MIME_TYPES } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { filename, mimeType } = body

  if (!filename || !mimeType) {
    return NextResponse.json({ error: 'filename and mimeType required' }, { status: 400 })
  }

  if (!VIDEO_MIME_TYPES.includes(mimeType) && !filename.match(/\.(mp4|mov|webm|avi|mkv|m4v)$/i)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 422 })
  }

  const storageKey = generateStorageKey(filename)
  const uploadUrl = await getPresignedUploadUrl(storageKey, mimeType)

  return NextResponse.json({ uploadUrl, storageKey })
}
