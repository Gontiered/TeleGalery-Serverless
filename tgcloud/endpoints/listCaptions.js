import { db } from 'sdk'
import { items } from '../schema.js'
import { eq, and, desc } from 'sdk/db'
import { isOwner } from '../lib/owner.js'
import { EndpointError } from 'sdk'

// POST /api/listCaptions  {}
//
// Devuelve todos los pies de foto distintos con cuántas fotos lleva
// cada uno y la foto más reciente como portada, los más usados primero.
// Solo el dueño puede pedirlos.

export default async function (input, ctx) {
  const user = ctx.initData && ctx.initData.user
  if (!user || !user.id) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })
  if (!(await isOwner(user.id))) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })
  // El SDK no prepara bien el GROUP BY con agregados, así que se traen
  // los pies (los más recientes primero) y se agrupan aquí. Límite 1000
  // fotos.
  const rows = await db.select().from(items)
    .where(and(eq(items.userId, user.id), eq(items.kind, 'photo')))
    .orderBy(desc(items.date))
    .limit(1000)
    .all()
  const byCaption = new Map()
  for (const row of rows) {
    const caption = typeof row.caption === 'string' ? row.caption.trim() : ''
    if (!caption) continue
    const entry = byCaption.get(caption)
    if (entry) entry.count += 1
    else byCaption.set(caption, { caption, count: 1, coverId: row.id })
  }
  const captions = [...byCaption.values()].sort((a, b) => b.count - a.count)
  return { captions }
}
