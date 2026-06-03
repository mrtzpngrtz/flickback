import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

async function requireOwner() {
  const session = await getSession()
  if ((session?.user as any)?.role !== 'OWNER') return null
  return session
}

export async function GET() {
  if (!await requireOwner()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  if (!await requireOwner()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { email, name, password, role } = await req.json()
  if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, name: name || null, password: hashed, role: role || 'VIEWER' },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })
  return NextResponse.json(user, { status: 201 })
}
