import Link from 'next/link'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh' }}>
      <header className="topbar">
        <Link href="/" className="topbar__mark">FLICKBACK</Link>
        <nav className="topbar__nav">
          <Link href="/">LIBRARY</Link>
          <Link href="/upload">UPLOAD</Link>
        </nav>
      </header>
      <div style={{ paddingTop: 40 }}>
        {children}
      </div>
    </div>
  )
}
