import { db, api } from 'sdk'
import { users } from '../schema.js'
import { registerChannel, CONFIG_KEYBOARD, helpText, sendChannelList } from '../lib/channels.js'
import { getOwnerId } from '../lib/owner.js'

// Chat privado con el bot: aquí solo se configura. TeleGallery solo
// funciona con el canal: las fotos ya no se reciben por este chat ni
// por grupos. Los grupos se ignoran por completo.

function looksLikeChannelRef(text) {
  if (/^@[\w]{5,}$/.test(text)) return true
  if (/^(https?:\/\/)?(t\.me|telegram\.me)\/[\w+][\w+/.]*$/.test(text)) return true
  if (/^-?\d{6,}$/.test(text)) return true
  return false
}

async function tryRegister(chatId, ref) {
  try {
    const ch = await registerChannel(ref)
    await api.sendMessage({
      chat_id: chatId,
      text: 'Canal configurado: ' + (ch.title || ch.username || ch.chatId) + '.\n\nYa puedes mandar fotos ahí y aparecerán en la galería.',
      reply_markup: CONFIG_KEYBOARD,
    })
  } catch (e) {
    const msg = e && e.code === 'NOT_ADMIN'
      ? 'El bot no es admin de ese canal. Hazlo admin del canal e inténtalo de nuevo.'
      : e && e.code === 'NOT_CHANNEL'
      ? 'Eso no es un canal. Mándame el @usuario o el enlace de un canal.'
      : e && e.code === 'BAD_REF'
      ? 'No pude leer ese enlace. Reenvíame un mensaje del canal o mándame su @usuario.'
      : 'No pude configurar ese canal. Revisa que el enlace o el @usuario estén bien y que el bot sea admin.'
    await api.sendMessage({ chat_id: chatId, text: msg, reply_markup: CONFIG_KEYBOARD })
  }
}

export default async function (message) {
  const from = message.from || {}
  const chat = message.chat || {}
  const chatType = chat.type || 'private'

  // Grupos: se ignoran por completo, no se guarda nada de ahí.
  if (chatType !== 'private') return
  // El dueño es quien primero usó el bot (ver lib/owner.js). Si todavía
  // no hay dueño, quien escribe primero lo es: su fila se crea abajo.
  const ownerId = await getOwnerId()
  if (ownerId !== null && from.id !== ownerId) return

  if (from.id) {
    await db.insert(users).values({ tgId: from.id, name: from.first_name || null })
      .onConflictDoNothing({ target: users.tgId }).run()
  }

  const text = typeof message.text === 'string' ? message.text.trim() : ''

  if (text === '/start') {
    await api.sendMessage({
      chat_id: chat.id,
      text: 'Bienvenido a TeleGallery.\n\n' + helpText(),
      reply_markup: CONFIG_KEYBOARD,
    })
    return
  }

  if (text === '/canales') {
    await sendChannelList(chat.id)
    return
  }

  // Reenvío de un mensaje del canal: registra ese canal.
  const fwd = message.forward_from_chat
  if (fwd && fwd.type === 'channel') {
    await tryRegister(chat.id, fwd.id)
    return
  }

  // @usuario, enlace t.me/... o id del canal.
  if (text && looksLikeChannelRef(text)) {
    await tryRegister(chat.id, text)
    return
  }

  // Una foto por el chat privado: ya no se guarda, solo valen las del canal.
  if (message.photo) {
    await api.sendMessage({
      chat_id: chat.id,
      text: 'Por aquí ya no recibo fotos. Mándalas al canal que configuraste y aparecen solas en la galería.\n\n' + helpText(),
      reply_markup: CONFIG_KEYBOARD,
    })
    return
  }

  // Cualquier otro texto: ayuda corta.
  await api.sendMessage({ chat_id: chat.id, text: helpText(), reply_markup: CONFIG_KEYBOARD })
}
