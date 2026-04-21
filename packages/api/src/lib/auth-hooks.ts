import type { FastifyRequest, FastifyReply } from 'fastify'

export type JwtPayload = {
  sub: string
  email: string
  role: 'ADMIN' | 'MEMBER'
  name: string
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as JwtPayload | undefined
  if (!user) return reply.code(401).send({ error: 'Unauthorized' })
  if (user.role !== 'ADMIN') return reply.code(403).send({ error: 'Admin only' })
}
