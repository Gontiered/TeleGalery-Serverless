import { db, api } from 'sdk'
import { items } from '../schema.js'
import { eq, and, desc, sql } from 'sdk/db'
import { EndpointError } from 'sdk'

// Ventana de un mismo envío: Telegram parte un envío de más de 10
// fotos en varios grupos (máx. 10 por grupo) y el pie solo va en la
// primera foto del primer grupo. Las fotos de un mismo envío llegan
// en segundos, así que el pie se copia también entre grupos que
// llegaron juntos (misma ventana de tiempo, mismo chat). 60 s cubre
// envíos grandes (96 fotos llegaron en 14 s) sin mezclar dos envíos
// distintos que se hagan con un minuto de diferencia.
const BURST_WINDOW_S = 60

// Copia un pie a las fotos del mismo grupo y de la misma ventana de
// tiempo (mismo usuario y chat, fecha dentro de la ventana).
async function backfillCaption(userId, chatId, caption, groupId, date) {
  // Mismo grupo: el pie del grupo vale para todas sus fotos, incluso
  // si alguna ya tomó un pie prestado de otro envío (llegó antes que
  // el pie propio del grupo). Por eso aquí no se filtra por IS NULL.
  await db.update(items).set({ caption })
    .where(and(eq(items.userId, userId), eq(items.mediaGroupId, groupId)))
  // Misma ventana: solo las fotos que todavía no tienen pie.
  await db.update(items).set({ caption })
    .where(and(eq(items.userId, userId), eq(items.chatId, chatId),
      sql`${items.caption} IS NULL`,
      sql`${items.date} >= ${date - BURST_WINDOW_S}`,
      sql`${items.date} <= ${date}`))
}

// Busca el pie de una foto del mismo grupo y, si no hay, el de la
// foto con pie más reciente de la misma ventana de tiempo.
async function findBurstCaption(userId, chatId, groupId, date) {
  const sibling = await db.select().from(items)
    .where(and(eq(items.userId, userId), eq(items.mediaGroupId, groupId),
      sql`${items.caption} IS NOT NULL`)).get()
  if (sibling && sibling.caption) return sibling.caption
  const recent = await db.select().from(items)
    .where(and(eq(items.userId, userId), eq(items.chatId, chatId),
      sql`${items.caption} IS NOT NULL`,
      sql`${items.date} >= ${date - BURST_WINDOW_S}`,
      sql`${items.date} <= ${date}`))
    .orderBy(desc(items.date)).limit(1).get()
  return recent && recent.caption ? recent.caption : null
}

// Guarda una foto en la tabla `items`. La foto en sí queda en Telegram;
// aquí solo van sus metadatos y su file_id. Compartido por el handler
// de mensajes (chat privado y grupos) y el de publicaciones de canal.
export function pickPhoto(photo) {
  // Telegram manda varias resoluciones; la última es la más grande.
  return photo && photo.length ? photo[photo.length - 1] : null
}

// La medida mediana para la vista previa: la más grande que no pasa
// de 1280 px de ancho. En el teléfono la foto se ve a ~390 px, así
// que se ve igual de nítida que la más grande pero pesa como la
// cuarta parte. Si la foto ya es chica, la mediana es la más grande.
export function pickMidPhoto(photo) {
  if (!photo || !photo.length) return null
  for (let i = photo.length - 1; i >= 0; i--) {
    if ((photo[i].width || 0) <= 1280) return photo[i]
  }
  return photo[0]
}

export async function savePhoto(message, userId) {
  const file = pickPhoto(message.photo)
  if (!file) return false
  const thumb = message.photo[0] || null
  const mid = pickMidPhoto(message.photo)
  const groupId = message.media_group_id || null
  const rows = await db.insert(items).values({
    userId,
    kind: 'photo',
    fileId: file.file_id,
    thumbFileId: thumb ? thumb.file_id : null,
    midFileId: mid ? mid.file_id : null,
    fileUniqueId: file.file_unique_id,
    fileName: null,
    mimeType: null,
    fileSize: file.file_size || null,
    caption: message.caption || null,
    mediaGroupId: groupId,
    width: file.width || null,
    height: file.height || null,
    duration: null,
    chatId: message.chat.id,
    messageId: message.message_id,
    date: message.date,
  }).onConflictDoNothing({ target: items.fileUniqueId }).returning().run()
  const inserted = rows[0] || null
  // El pie de foto de un envío: Telegram solo se lo pone a la primera
  // foto del grupo, y un envío de más de 10 fotos se parte en varios
  // grupos. Para que el hashtag valga para todo el envío, el pie se
  // copia entre fotos del mismo grupo y de la misma ventana de tiempo,
  // en el orden que lleguen: si esta foto trae el pie, se lo pone a
  // las que llegaron sin él; si llega sin pie, lo copia de una foto
  // que ya lo tenga (del grupo o del mismo envío).
  if (inserted && groupId) {
    if (message.caption) {
      await backfillCaption(userId, message.chat.id, message.caption, groupId, message.date)
    } else {
      const cap = await findBurstCaption(userId, message.chat.id, groupId, message.date)
      if (cap) {
        await db.update(items).set({ caption: cap })
          .where(and(eq(items.id, inserted.id), eq(items.userId, userId)))
      }
    }
  }
  return true
}

// Borra una foto: primero su mensaje en Telegram (si ya no existe, no
// importa) y luego su fila de la galería. Solo el dueño puede borrarla.
// La usan deleteItem (una foto) y deleteItems (varias).
export async function deletePhotoItem(itemId, userId) {
  const row = await db.select().from(items)
    .where(and(eq(items.id, itemId), eq(items.userId, userId))).get()
  if (!row) throw new EndpointError('Archivo no encontrado', { code: 'NOT_FOUND' })
  try { await api.deleteMessage({ chat_id: row.chatId, message_id: row.messageId }) } catch (e) {}
  await db.delete(items).where(and(eq(items.id, itemId), eq(items.userId, userId)))
  return row.id
}
