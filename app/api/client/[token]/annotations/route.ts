import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params
  const share = await prisma.shareToken.findUnique({ where: { token } })
  if (!share) return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  if (share.expiresAt && share.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 403 })
  }

  const body = await req.json()
  const { timestamp, endTimestamp, drawing, comment, author } = body

  if (timestamp == null || !comment || !author) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const annotation = await prisma.annotation.create({
    data: {
      videoId: share.videoId,
      timestamp: parseFloat(timestamp),
      endTimestamp: endTimestamp != null ? parseFloat(endTimestamp) : null,
      drawing: drawing ?? null,
      comment,
      author,
      role: 'CLIENT',
    },
  })

  return NextResponse.json({
    ...annotation,
    createdAt: annotation.createdAt.toISOString(),
  }, { status: 201 })
}
