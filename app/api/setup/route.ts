import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const count = await prisma.user.count()
  if (count > 0) return NextResponse.json({ error: 'Setup already complete' }, { status: 403 })

  const { email, name, password } = await req.json()
  if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.create({
    data: { email, name: name || null, password: hashed, role: 'OWNER' },
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
