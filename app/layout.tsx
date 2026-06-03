import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Flickback',
  description: 'Video feedback tool',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
      </body>
    </html>
  )
}
