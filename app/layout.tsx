import type { Metadata } from 'next'
import Link from 'next/link'
import Providers from './providers'
import TopbarUser from './TopbarUser'
import ThemeToggle from './ThemeToggle'
import './globals.css'

export const metadata: Metadata = {
  title: 'Flickback',
  description: 'Video feedback tool',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')})()` }} />
      </head>
      <body>
        <Providers>
          <header className="topbar">
            <Link href="/" className="topbar__mark">FLICKBACK</Link>
            <nav className="topbar__nav">
              <Link href="/">LIBRARY</Link>
              <Link href="/projects">PROJECTS</Link>
              <Link href="/upload">UPLOAD</Link>
              <Link href="/users">USERS</Link>
            </nav>
            <ThemeToggle />
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
