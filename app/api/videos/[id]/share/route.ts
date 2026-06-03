import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const share = await prisma.shareToken.create({
    data: {
      videoId: id,
      label: body.label ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  })

  return NextResponse.json({
    token: share.token,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/client/${share.token}`,
  }, { status: 201 })
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const tokens = await prisma.shareToken.findMany({
    where: { videoId: id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(tokens)
}
