import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { videos: true } } },
  })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  const role = (session?.user as any)?.role
  if (!role || role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, client } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const project = await prisma.project.create({
    data: { name: name.trim(), client: client?.trim() || null },
  })
  return NextResponse.json(project, { status: 201 })
}
