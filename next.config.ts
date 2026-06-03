import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'prisma'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.your-hetzner-bucket.de',
      },
    ],
  },
}

export default config
