import { db, api } from 'sdk'
import { items } from '../schema.js'
import { eq, and } from 'sdk/db'
import { EndpointError } from 'sdk'

// POST /api/getThumb  { id: number, size?: 'thumb' | 'full' }
//
// Devuelve la foto como base64 para mostrarla en la galería sin exponer
// ningún token: el servidor descarga los bytes con api.getFileContent
// (la plataforma usa su propio token internamente) y solo entrega la
// foto si pertenece al usuario que llama (initData verificado).
// - size 'thumb': la foto pequeña, ideal para la cuadrícula.
// - size 'full': la vista previa del visor: la medida mediana
//   (~1280 px, mid_file_id) cuando está guardada, si no la foto más
//   grande (fotos viejas, sin mid_file_id). Nunca se devuelve la
//   original sin más: la mediana pesa como la cuarta parte y no se
//   acerca al límite de ~2 MB de la respuesta.
// Límite de la Bot API: 20 MB por descarga.
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Sin btoa ni Buffer en el runtime de tgcloud, la conversión es manual.
// El runtime tiene un límite de memoria bajo: concatenar con += carácter
// a carácter revienta ese límite ("Terminated: Memory limit exceeded") con
// archivos de varios MB. Por eso cada bloque se arma con un array de
// grupos de 4 caracteres y un solo join.
function toBase64(bytes) {
  const parts = []
  // Múltiplo de 3 (4096 grupos de 3 bytes -> 16 KB de base64 por bloque).
  const BLOCK = 12288
  for (let start = 0; start < bytes.length; start += BLOCK) {
    const end = Math.min(start + BLOCK, bytes.length)
    const g = []
    for (let i = start; i < end; i += 3) {
      const a = bytes[i]
      const b = i + 1 < end ? bytes[i + 1] : 0
      const c = i + 2 < end ? bytes[i + 2] : 0
      g.push(BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)] +
        (i + 1 < end ? BASE64[((b & 15) << 2) | (c >> 6)] : '=') +
        (i + 2 < end ? BASE64[c & 63] : '='))
    }
    parts.push(g.join(''))
  }
  return parts.join('')
}

export default async function (input, ctx) {
  const user = ctx.initData && ctx.initData.user
  if (!user || !user.id) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })
  if (!input.id) throw new EndpointError('Falta el id del archivo', { code: 'MISSING_ID' })

  const row = await db.select().from(items)
    .where(and(eq(items.id, input.id), eq(items.userId, user.id))).get()
  if (!row) throw new EndpointError('Archivo no encontrado', { code: 'NOT_FOUND' })

  const size = input.size === 'full' ? 'full' : 'thumb'
  const fileId = size === 'full' ? (row.midFileId || row.fileId) : (row.thumbFileId || row.fileId)
  // El tope de 20 MB solo vale si de verdad se descarga la más grande.
  if (fileId === row.fileId && row.fileSize && row.fileSize > 20 * 1024 * 1024) {
    throw new EndpointError('Archivo demasiado grande para previsualizar', { code: 'TOO_LARGE' })
  }

  const bytes = await api.getFileContent(fileId)
  const mime = size === 'thumb' ? 'image/jpeg' : (row.mimeType || 'image/jpeg')
  return { id: row.id, kind: row.kind, size, mime, data: toBase64(bytes) }
}
