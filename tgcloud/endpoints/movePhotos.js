import { db } from 'sdk'
import { items, albums } from '../schema.js'
import { eq, and } from 'sdk/db'
import { EndpointError } from 'sdk'

// POST /api/movePhotos  { ids: number[], albumId: number | null }
//
// Mueve varias fotos a una carpeta (albumId null = sacarlas de la
// carpeta, vuelven a "Todas las fotos"). Solo el dueño puede moverlas.
// Las que no existen o no son suyas se reportan en `failed` sin frenar
// las demás.
export default async function (input, ctx) {
  const user = ctx.initData && ctx.initData.user
  if (!user || !user.id) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })
  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    throw new EndpointError('Faltan las fotos a mover', { code: 'MISSING_IDS' })
  }
  if (input.ids.length > 100) {
    throw new EndpointError('Demasiadas fotos a la vez', { code: 'TOO_MANY' })
  }

  const albumId = Number.isInteger(input.albumId) ? input.albumId : null
  if (albumId !== null) {
    const album = await db.select().from(albums)
      .where(and(eq(albums.id, albumId), eq(albums.userId, user.id))).get()
    if (!album) throw new EndpointError('Carpeta no encontrada', { code: 'NOT_FOUND' })
  }

  const moved = []
  const failed = []
  // Mover de 5 en 5 en paralelo, igual que al borrar: una por una,
  // 100 fotos tardarían demasiado. El tope de 100 por llamada se
  // mantiene; la app mueve en tandas de 50.
  const CONCURRENCY = 5
  for (let i = 0; i < input.ids.length; i += CONCURRENCY) {
    const group = input.ids.slice(i, i + CONCURRENCY)
    const results = await Promise.all(group.map(async (id) => {
      const row = await db.select().from(items)
        .where(and(eq(items.id, id), eq(items.userId, user.id))).get()
      if (!row) return { id, ok: false }
      await db.update(items).set({ albumId })
        .where(and(eq(items.id, id), eq(items.userId, user.id)))
      return { id, ok: true }
    }))
    results.forEach((r) => (r.ok ? moved.push(r.id) : failed.push(r.id)))
  }
  return { ok: true, moved, failed }
}
