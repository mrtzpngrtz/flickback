import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const videos = await prisma.video.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { annotations: true } },
      project: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(videos)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { title, filename, storageKey, mimeType, size } = body

  if (!title || !filename || !storageKey || !mimeType || size == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const video = await prisma.video.create({
    data: {
      title,
      filename,
      storageKey,
      mimeType,
      size: BigInt(size),
      status: 'READY',
    },
  })

  return NextResponse.json({ ...video, size: video.size.toString() }, { status: 201 })
}
