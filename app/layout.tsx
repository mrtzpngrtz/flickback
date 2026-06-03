import type { Metadata } from 'next'
import Link from 'next/link'
import Providers from './providers'
import TopbarUser from './TopbarUser'
import './globals.css'

export const metadata: Metadata = {
  title: 'Flickback',
  description: 'Video feedback tool',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="topbar">
            <Link href="/" className="topbar__mark">FLICKBACK</Link>
            <nav className="topbar__nav">
              <Link href="/">LIBRARY</Link>
              <Link href="/upload">UPLOAD</Link>
              <Link href="/users">USERS</Link>
            </nav>
            <TopbarUser />
          </header>
          <div style={{ paddingTop: 40 }}>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  )
}
