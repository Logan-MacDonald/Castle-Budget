import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { TransactionCategory } from '@prisma/client'

const txSchema = z.object({
  amount:      z.number(),
  description: z.string().min(1),
  date:        z.string().datetime(),
  category:    z.nativeEnum(TransactionCategory),
  accountId:   z.string().optional(),
  isBusiness:  z.boolean().default(false),
  notes:       z.string().optional(),
})

export async function transactionRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const query = z.object({
      month:     z.coerce.number().int().optional(),
      year:      z.coerce.number().int().optional(),
      accountId: z.string().optional(),
      limit:     z.coerce.number().int().default(100),
    }).parse(request.query)

    const where: any = {}
    if (query.month && query.year) {
      const start = new Date(query.year, query.month - 1, 1)
      const end   = new Date(query.year, query.month, 0, 23, 59, 59)
      where.date  = { gte: start, lte: end }
    }
    if (query.accountId) where.accountId = query.accountId

    return prisma.transaction.findMany({
      where,
      include: { account: true },
      orderBy: { date: 'desc' },
      take: query.limit,
    })
  })

  app.post('/', async (request, reply) => {
    const body = txSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.transaction.create({ data: { ...body.data, isManual: true } })
  })

  app.patch('/:id', async (request, reply) => {
    const body = txSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    return prisma.transaction.update({ where: { id }, data: body.data })
  })

  app.delete('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return prisma.transaction.delete({ where: { id } })
  })
}
