import { prisma } from '@/lib/db'
import ProjectsClient from './ProjectsClient'

export const revalidate = 0

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { videos: true } } },
  })
  return (
    <main className="page" style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 40 }}>
        <div className="num-sm">PROJECTS</div>
      </div>
      <ProjectsClient projects={projects} />
    </main>
  )
}
