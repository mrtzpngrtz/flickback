import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Params { params: Promise<{ token: string; id: string }> }

async function validateToken(token: string) {
  const share = await prisma.shareToken.findUnique({ where: { token } })
  if (!share) return null
  if (share.expiresAt && share.expiresAt < new Date()) return null
  return share
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, id } = await params
  const share = await validateToken(token)
  if (!share) return NextResponse.json({ error: 'Invalid token' }, { status: 403 })

  const annotation = await prisma.annotation.findUnique({ where: { id } })
  if (!annotation || annotation.videoId !== share.videoId || annotation.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const { comment, timestamp, endTimestamp } = body

  const updated = await prisma.annotation.update({
    where: { id },
    data: {
      ...(comment !== undefined && { comment }),
      ...(timestamp !== undefined && { timestamp: parseFloat(timestamp) }),
      ...(endTimestamp !== undefined && { endTimestamp: endTimestamp !== null ? parseFloat(endTimestamp) : null }),
    },
  })

  return NextResponse.json({ ...updated, createdAt: updated.createdAt.toISOString() })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { token, id } = await params
  const share = await validateToken(token)
  if (!share) return NextResponse.json({ error: 'Invalid token' }, { status: 403 })

  const annotation = await prisma.annotation.findUnique({ where: { id } })
  if (!annotation || annotation.videoId !== share.videoId || annotation.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.annotation.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
