import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

async function requireEditor() {
  const session = await getSession()
  const role = (session?.user as any)?.role
  return role && role !== 'VIEWER' ? session : null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireEditor()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const { name, client } = await req.json()
  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(name && { name: name.trim() }),
      ...(client !== undefined && { client: client?.trim() || null }),
    },
  })
  return NextResponse.json(project)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireEditor()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await prisma.project.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
