import { beforeEach } from 'vitest'
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const testDbUrl = process.env.TEST_DATABASE_URL
if (!testDbUrl) {
  throw new Error('TEST_DATABASE_URL must be set (see vitest.config.ts)')
}

process.env.DATABASE_URL = testDbUrl

// Apply migrations once at startup
try {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'inherit',
  })
} catch (err) {
  throw new Error(`Failed to apply migrations to test DB: ${err}`)
}

const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } })

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "DebtPayment", "BillPayment", "Transaction",
      "SavingsGoal", "Debt", "Bill", "IncomeSource",
      "Account", "User"
    RESTART IDENTITY CASCADE
  `)
})
