import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const annotations = await prisma.annotation.findMany({
    where: { videoId: params.id },
    orderBy: { timestamp: 'asc' },
  })
  return NextResponse.json(annotations)
}

export async function POST(req: NextRequest, { params }: Params) {
  const body = await req.json()
  const { timestamp, drawing, comment, author, role } = body

  if (timestamp == null || !comment || !author) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const annotation = await prisma.annotation.create({
    data: {
      videoId: params.id,
      timestamp: parseFloat(timestamp),
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
