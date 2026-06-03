import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@flickback.app'
  const password = process.env.ADMIN_PASSWORD
  if (!password) throw new Error('ADMIN_PASSWORD env var required')

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`User ${email} already exists`)
    return
  }

  await prisma.user.create({
    data: {
      email,
      name: 'Admin',
      password: await bcrypt.hash(password, 12),
      role: 'OWNER',
    },
  })
  console.log(`Created OWNER: ${email}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
