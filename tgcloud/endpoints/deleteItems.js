import { deletePhotoItem } from '../lib/photos.js'
import { EndpointError } from 'sdk'

// POST /api/deleteItems  { ids: number[] }
//
// Borra varias fotos a la vez (selección múltiple de la galería): cada
// una se borra de Telegram y de la galería, igual que deleteItem. Solo
// el dueño puede borrarlas (initData verificado). Las que no existen o
// no son suyas se reportan en `failed` sin frenar las demás.
export default async function (input, ctx) {
  const user = ctx.initData && ctx.initData.user
  if (!user || !user.id) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })
  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    throw new EndpointError('Faltan los ids de los archivos', { code: 'MISSING_IDS' })
  }
  if (input.ids.length > 100) {
    throw new EndpointError('Demasiados archivos a la vez', { code: 'TOO_MANY' })
  }

  const deleted = []
  const failed = []
  // Borrar de 5 en 5 en paralelo: una por una, 100 fotos tardarían
  // demasiado y la llamada podría cortarse. El tope de 100 por llamada
  // se mantiene; la app borra en tandas de 50, así que nunca se ve el
  // error "Demasiados archivos a la vez".
  const CONCURRENCY = 5
  for (let i = 0; i < input.ids.length; i += CONCURRENCY) {
    const group = input.ids.slice(i, i + CONCURRENCY)
    const results = await Promise.all(group.map(async (id) => {
      try { await deletePhotoItem(id, user.id); return { id, ok: true } }
      catch (e) { return { id, ok: false } }
    }))
    results.forEach((r) => (r.ok ? deleted.push(r.id) : failed.push(r.id)))
  }
  return { ok: true, deleted, failed }
}
