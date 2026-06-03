import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Params { params: Promise<{ id: string; annotId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, annotId } = await params
  const body = await req.json()
  const annotation = await prisma.annotation.update({
    where: { id: annotId, videoId: id },
    data: {
      ...(body.resolved !== undefined && { resolved: Boolean(body.resolved) }),
      ...(body.comment && { comment: body.comment }),
      ...(body.timestamp !== undefined && { timestamp: parseFloat(body.timestamp) }),
      ...(body.endTimestamp !== undefined && { endTimestamp: body.endTimestamp !== null ? parseFloat(body.endTimestamp) : null }),
    },
  })
  return NextResponse.json({ ...annotation, createdAt: annotation.createdAt.toISOString() })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, annotId } = await params
  await prisma.annotation.delete({ where: { id: annotId, videoId: id } })
  return NextResponse.json({ ok: true })
}
