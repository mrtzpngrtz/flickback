import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatDuration, formatBytes, formatDate } from '@/lib/utils'
import LibraryClient from './LibraryClient'

export const revalidate = 0

export default async function DashboardPage() {
  const [videos, projects] = await Promise.all([
    prisma.video.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { annotations: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.project.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])

  const serialized = videos.map(v => ({
    ...v,
    size: v.size.toString(),
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  }))

  return (
    <main className="page">
      <LibraryClient videos={serialized} projects={projects} />
    </main>
  )
}
