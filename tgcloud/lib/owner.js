import { db } from 'sdk'
import { users } from '../schema.js'

// El dueño es la primera persona que usó el bot: su fila en `users`
// es la más vieja. Así no hay ningún id escrito en el código y el
// proyecto se puede publicar sin exponer el id de nadie.
// Quien escribe primero al bot (con /start) se convierte en dueño;
// después, solo él puede configurar canales y pedir los hashtags.
export async function getOwnerId() {
  const row = await db.select({ tgId: users.tgId }).from(users)
    .orderBy(users.id).limit(1).get()
  return row ? row.tgId : null
}

export async function isOwner(tgId) {
  if (!tgId) return false
  const owner = await getOwnerId()
  return owner !== null && owner === tgId
}
