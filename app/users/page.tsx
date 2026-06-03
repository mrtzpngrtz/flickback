import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const session = await getSession()
  if ((session?.user as any)?.role !== 'OWNER') notFound()

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })

  return (
    <main className="page" style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 40 }}>
        <div className="num-sm">USERS</div>
        <div className="lbl" style={{ marginTop: 8, color: 'var(--gray-50)' }}>
          ADMIN USER MANAGEMENT
        </div>
      </div>
      <UsersClient users={users} currentUserId={(session!.user as any).id} />
    </main>
  )
}
