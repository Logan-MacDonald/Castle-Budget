import type { FastifyRequest, FastifyReply } from 'fastify'

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Skip auth routes
  if (request.routerPath?.startsWith('/api/auth') || request.routerPath === '/health') return

  // Skip non-api routes
  if (!request.routerPath?.startsWith('/api')) return

  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}
