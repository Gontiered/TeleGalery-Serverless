import { deletePhotoItem } from '../lib/photos.js'
import { EndpointError } from 'sdk'

// POST /api/deleteItem  { id: number }
//
// Borra la foto de la galería y también su mensaje en el chat con el bot.
// Solo el dueño puede borrarla (initData verificado).
// Si el mensaje ya no existe (el usuario lo borró antes a mano en el
// chat), no importa: igual se borra el registro de la galería.
export default async function (input, ctx) {
  const user = ctx.initData && ctx.initData.user
  if (!user || !user.id) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })
  if (!input.id) throw new EndpointError('Falta el id del archivo', { code: 'MISSING_ID' })

  const id = await deletePhotoItem(input.id, user.id)
  return { ok: true, id }
}
