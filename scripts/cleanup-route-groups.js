#!/usr/bin/env node
/**
 * Removes scaffolding artifacts that conflict with Next.js App Router:
 *   - app/(admin)/  — duplicate route group pages conflict with app/page.tsx etc.
 *   - app/client/layout.tsx — has <html> tag, invalid as nested layout
 *   - app/client/[token]/layout.tsx — same issue
 */
const fs = require('fs')
const path = require('path')

const appDir = path.join(__dirname, '..', 'app')

const targets = [
  path.join(appDir, '(admin)'),
  path.join(appDir, 'client', 'layout.tsx'),
  path.join(appDir, 'client', '[token]', 'layout.tsx'),
]

for (const target of targets) {
  if (!fs.existsSync(target)) continue
  const stat = fs.statSync(target)
  if (stat.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true })
  } else {
    fs.unlinkSync(target)
  }
  console.log(`[cleanup] Removed: ${path.relative(path.join(__dirname, '..'), target)}`)
}
