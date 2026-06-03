import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Params { params: { id: string; annotId: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json()
  const annotation = await prisma.annotation.update({
    where: { id: params.annotId, videoId: params.id },
    data: {
      ...(body.resolved !== undefined && { resolved: Boolean(body.resolved) }),
      ...(body.comment && { comment: body.comment }),
    },
  })
  return NextResponse.json({ ...annotation, createdAt: annotation.createdAt.toISOString() })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await prisma.annotation.delete({ where: { id: params.annotId, videoId: params.id } })
  return NextResponse.json({ ok: true })
}
