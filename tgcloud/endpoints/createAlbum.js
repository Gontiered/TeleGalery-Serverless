import { db } from 'sdk'
import { albums } from '../schema.js'
import { EndpointError } from 'sdk'

// POST /api/createAlbum  { name: string }
//
// Crea una carpeta vacía y la devuelve (con contador 0 y sin portada).
export default async function (input, ctx) {
  const user = ctx.initData && ctx.initData.user
  if (!user || !user.id) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) throw new EndpointError('La carpeta necesita un nombre', { code: 'MISSING_NAME' })
  if (name.length > 60) throw new EndpointError('El nombre es demasiado largo', { code: 'NAME_TOO_LONG' })

  // .returning() devuelve el arreglo de filas, no una sola fila.
  const rows = await db.insert(albums).values({ userId: user.id, name }).returning().run()
  const row = rows[0]
  return { id: row.id, name: row.name, count: 0, coverId: null }
}
