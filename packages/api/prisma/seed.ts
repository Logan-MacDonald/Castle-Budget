import { PrismaClient, Role, AccountType, PayPeriod, BillCategory, DebtType } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding castle-budget database...')

  // ─── Users ───────────────────────────────────────────────────────────────

  const adminPassword = await bcrypt.hash(process.env.ADMIN_SEED_PASSWORD || 'changeme123!', 12)
  const memberPassword = await bcrypt.hash(process.env.MEMBER_SEED_PASSWORD || 'changeme456!', 12)

  const logan = await prisma.user.upsert({
    where: { email: 'logan@castle.home' },
    update: {},
    create: {
      name: 'Logan',
      email: 'logan@castle.home',
      passwordHash: adminPassword,
      role: Role.ADMIN,
    },
  })

  const carla = await prisma.user.upsert({
    where: { email: 'carla@castle.home' },
    update: {},
    create: {
      name: 'Carla',
      email: 'carla@castle.home',
      passwordHash: memberPassword,
      role: Role.MEMBER,
    },
  })

  console.log(`✅ Users: ${logan.name} (admin), ${carla.name} (member)`)

  // ─── Income Sources ───────────────────────────────────────────────────────

  const incomeSources = [
    { name: 'Carla McGraw Hill', owner: 'Carla', amount: 0, payPeriod: PayPeriod.FIRST },
    { name: 'Carla McGraw Hill', owner: 'Carla', amount: 0, payPeriod: PayPeriod.FIFTEENTH },
    { name: 'Carla ILTX', owner: 'Carla', amount: 0, payPeriod: PayPeriod.VARIABLE },
    { name: 'Logan Retirement', owner: 'Logan', amount: 0, payPeriod: PayPeriod.MONTHLY },
    { name: 'VA Compensation', owner: 'Logan', amount: 0, payPeriod: PayPeriod.MONTHLY },
    { name: 'Logan CWS', owner: 'Logan', amount: 0, payPeriod: PayPeriod.FIRST },
    { name: 'Logan CWS', owner: 'Logan', amount: 0, payPeriod: PayPeriod.FIFTEENTH },
    { name: 'ILTX Bonus', owner: 'Carla', amount: 0, payPeriod: PayPeriod.VARIABLE },
  ]

  for (const source of incomeSources) {
    await prisma.incomeSource.create({ data: source })
  }

  console.log(`✅ Income sources seeded (${incomeSources.length}) — update amounts in Settings`)

  // ─── Debt Accounts ────────────────────────────────────────────────────────
  // Seeded from Budget_example.xlsx — balances/rates to be filled in via UI

  const debts = [
    { name: 'AmEx RCS', type: DebtType.CREDIT_CARD, institution: 'American Express', isBusiness: true },
    { name: "Barclay's CCL", type: DebtType.CREDIT_CARD, institution: "Barclay's", dueDay: 10 },
    { name: 'Bass Pro / Capital One', type: DebtType.CREDIT_CARD, institution: 'Capital One', dueDay: 1 },
    { name: 'USAA', type: DebtType.CREDIT_CARD, institution: 'USAA' },
    { name: 'Chase Southwest', type: DebtType.CREDIT_CARD, institution: 'Chase' },
    { name: 'AmEx Personal', type: DebtType.CREDIT_CARD, institution: 'American Express' },
    { name: 'Discover', type: DebtType.CREDIT_CARD, institution: 'Discover' },
    { name: "Lowe's", type: DebtType.CREDIT_CARD, institution: "Lowe's" },
    { name: 'BOA NCL Card', type: DebtType.CREDIT_CARD, institution: 'Bank of America' },
    { name: 'Citi AA Card', type: DebtType.CREDIT_CARD, institution: 'Citi' },
    { name: 'Citi Costco Card', type: DebtType.CREDIT_CARD, institution: 'Citi' },
    { name: 'Citi Diamond', type: DebtType.CREDIT_CARD, institution: 'Citi' },
    { name: 'Citi AA Plat', type: DebtType.CREDIT_CARD, institution: 'Citi' },
    { name: 'Citi AA Exec', type: DebtType.CREDIT_CARD, institution: 'Citi' },
    { name: "Barclay's AA Card", type: DebtType.CREDIT_CARD, institution: "Barclay's" },
    { name: 'Wells Fargo', type: DebtType.CREDIT_CARD, institution: 'Wells Fargo' },
    { name: 'BHG Loan', type: DebtType.PERSONAL_LOAN, institution: 'BHG' },
    { name: 'AmEx Loan (Taxes 2024)', type: DebtType.PERSONAL_LOAN, institution: 'American Express' },
  ]

  for (const debt of debts) {
    await prisma.debt.create({
      data: {
        ...debt,
        originalBalance: 0,
        currentBalance: 0,
        interestRate: 0,
        minPayment: 0,
        isBusiness: (debt as any).isBusiness ?? false,
        isActive: true,
      },
    })
  }

  console.log(`✅ Debt accounts seeded (${debts.length}) — update balances/rates in Debt Payoff`)

  // ─── Savings Goals ────────────────────────────────────────────────────────

  await prisma.savingsGoal.createMany({
    data: [
      { name: 'E*Trade Main Brokerage', targetAmount: 0, currentAmount: 0 },
      { name: "E*Trade (Will's Account)", targetAmount: 0, currentAmount: 0 },
    ],
  })

  console.log('✅ Savings goals seeded')

  console.log('\n🏰 Castle Budget seed complete.')
  console.log('   → Log in as logan@castle.home to set up accounts and fill in balances.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
