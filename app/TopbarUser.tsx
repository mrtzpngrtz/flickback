'use client'

import { useSession, signOut } from 'next-auth/react'

export default function TopbarUser() {
  const { data: session } = useSession()
  if (!session?.user) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto' }}>
      <span className="lbl" style={{ color: 'var(--gray-50)' }}>
        {(session.user as any).role}
      </span>
      <span className="lbl">{session.user.email}</span>
      <button
        className="btn btn--ghost"
        style={{ padding: '0 10px', height: 24, fontSize: 10 }}
        onClick={() => signOut({ callbackUrl: '/login' })}
      >
        SIGN OUT
      </button>
    </div>
  )
}
