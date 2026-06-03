import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const annotations = await prisma.annotation.findMany({
    where: { videoId: id },
    orderBy: { timestamp: 'asc' },
  })
  return NextResponse.json(annotations)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json()
  const { timestamp, endTimestamp, drawing, comment, author, role } = body

  if (timestamp == null || !comment || !author) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const annotation = await prisma.annotation.create({
    data: {
      videoId: id,
      timestamp: parseFloat(timestamp),
      endTimestamp: endTimestamp != null ? parseFloat(endTimestamp) : null,
      drawing: drawing ?? null,
      comment,
      author,
      role: role === 'CLIENT' ? 'CLIENT' : 'ADMIN',
    },
  })

  return NextResponse.json({
    ...annotation,
    createdAt: annotation.createdAt.toISOString(),
  }, { status: 201 })
}
