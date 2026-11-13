import { db } from 'sdk'
import { items } from '../schema.js'
import { eq, and, desc, sql } from 'sdk/db'
import { EndpointError } from 'sdk'

// POST /api/listItems  { q?: string, limit?: number, offset?: number, albumId?: number }
// TeleGallery es solo fotos: siempre filtra kind = 'photo'.
// albumId filtra por carpeta; sin él devuelve todas las fotos.
export default async function (input, ctx) {
  const user = ctx.initData && ctx.initData.user
  if (!user || !user.id) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })

  const q = typeof input.q === 'string' && input.q.trim() ? `%${input.q.trim()}%` : null
  const limit = Math.min(Math.max(parseInt(input.limit, 10) || 60, 1), 100)
  const offset = Math.max(parseInt(input.offset, 10) || 0, 0)
  const albumId = Number.isInteger(input.albumId) ? input.albumId : null

  const where = [eq(items.userId, user.id), eq(items.kind, 'photo')]
  if (q) where.push(sql`(${items.caption} LIKE ${q})`)
  if (albumId !== null) where.push(eq(items.albumId, albumId))

  const rows = await db.select().from(items)
    .where(and(...where))
    .orderBy(desc(items.date))
    .limit(limit).offset(offset).all()

  const total = await db.$count(items, and(...where))

  return { items: rows, total, limit, offset }
}
