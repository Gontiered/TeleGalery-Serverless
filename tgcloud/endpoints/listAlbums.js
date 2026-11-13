import { db } from 'sdk'
import { items, albums } from '../schema.js'
import { eq, and, desc } from 'sdk/db'
import { EndpointError } from 'sdk'

// POST /api/listAlbums  {}
//
// Devuelve las carpetas del usuario con su contador y su portada (la
// foto más reciente de la carpeta), más el total de fotos y la foto más
// reciente de todas, para la tarjeta "Todas las fotos".
export default async function (input, ctx) {
  const user = ctx.initData && ctx.initData.user
  if (!user || !user.id) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })

  const rows = await db.select().from(albums)
    .where(eq(albums.userId, user.id))
    .orderBy(desc(albums.id)).all()

  const out = []
  for (const a of rows) {
    const count = await db.$count(items, and(eq(items.userId, user.id), eq(items.albumId, a.id)))
    const cover = await db.select({ id: items.id }).from(items)
      .where(and(eq(items.userId, user.id), eq(items.albumId, a.id)))
      .orderBy(desc(items.date)).limit(1).get()
    out.push({ id: a.id, name: a.name, count, coverId: cover ? cover.id : null })
  }

  const total = await db.$count(items, and(eq(items.userId, user.id), eq(items.kind, 'photo')))
  const latest = await db.select({ id: items.id }).from(items)
    .where(and(eq(items.userId, user.id), eq(items.kind, 'photo')))
    .orderBy(desc(items.date)).limit(1).get()

  return { albums: out, total, latestId: latest ? latest.id : null }
}
