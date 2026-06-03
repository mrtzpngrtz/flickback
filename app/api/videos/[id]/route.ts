import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteObject } from '@/lib/storage'
import { getPresignedDownloadUrl } from '@/lib/storage'

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const video = await prisma.video.findUnique({
    where: { id },
    include: { annotations: { orderBy: { timestamp: 'asc' } } },
  })
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const videoUrl = await getPresignedDownloadUrl(video.storageKey)
  return NextResponse.json({ ...video, size: video.size.toString(), videoUrl })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json()
  const video = await prisma.video.update({
    where: { id },
    data: {
      ...(body.title && { title: body.title }),
      ...(body.status && { status: body.status }),
      ...(body.duration && { duration: body.duration }),
      ...(body.width && { width: body.width }),
      ...(body.height && { height: body.height }),
      ...(body.description !== undefined && { description: body.description || null }),
      ...(body.versionNote !== undefined && { versionNote: body.versionNote || null }),
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.projectId !== undefined && { projectId: body.projectId || null }),
    },
    include: { project: { select: { id: true, name: true } } },
  })
  return NextResponse.json({ ...video, size: video.size.toString() })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const video = await prisma.video.findUnique({ where: { id } })
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await deleteObject(video.storageKey)
  await prisma.video.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
