import { db } from 'sdk'
import { items, albums } from '../schema.js'
import { eq, and } from 'sdk/db'
import { EndpointError } from 'sdk'

// POST /api/deleteAlbum  { id: number }
//
// Borra una carpeta, pero NO las fotos: vuelven a "Todas las fotos"
// (su album_id queda en null). Solo el dueño puede borrarla.
export default async function (input, ctx) {
  const user = ctx.initData && ctx.initData.user
  if (!user || !user.id) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })
  if (!input.id) throw new EndpointError('Falta la carpeta', { code: 'MISSING_ID' })

  const album = await db.select().from(albums)
    .where(and(eq(albums.id, input.id), eq(albums.userId, user.id))).get()
  if (!album) throw new EndpointError('Carpeta no encontrada', { code: 'NOT_FOUND' })

  const freed = await db.$count(items, and(eq(items.userId, user.id), eq(items.albumId, album.id)))
  await db.update(items).set({ albumId: null })
    .where(and(eq(items.userId, user.id), eq(items.albumId, album.id)))
  await db.delete(albums).where(and(eq(albums.id, album.id), eq(albums.userId, user.id)))
  return { ok: true, id: album.id, freed }
}
