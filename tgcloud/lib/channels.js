import { db, api } from 'sdk'
import { channels } from '../schema.js'
import { eq } from 'sdk/db'

// Canales configurados para la Mini App. TeleGallery solo funciona con
// el canal: las fotos ya no se reciben por el chat privado con el bot
// ni por grupos. La configuración se hace desde el bot con /start.

// El id del bot se lee en vivo con api.getMe() cuando hace falta, así
// no hay que escribirlo a mano al desplegar tu propia copia.

// Enlace para abrir el canal: el @usuario si es público, si no el
// enlace de invitación (se guarda al registrarlo) y, en último caso,
// el enlace t.me/c/<id sin -100>.
export function channelUrl(ch) {
  if (ch.username) return 'https://t.me/' + ch.username
  if (ch.inviteLink) return ch.inviteLink
  const shortId = String(ch.chatId).replace(/^-100/, '')
  return 'https://t.me/c/' + shortId
}

export async function isChannelConfigured(chatId) {
  const row = await db.select().from(channels).where(eq(channels.chatId, chatId)).get()
  return !!row
}

export async function listChannels() {
  return await db.select().from(channels).orderBy(channels.id).all()
}

export async function removeChannel(chatId) {
  await db.delete(channels).where(eq(channels.chatId, chatId))
}

// Registra un canal por su id, @usuario, enlace t.me/... o mensaje
// reenviado (su id). Comprueba que existe, que es un canal y que el bot
// es admin. Devuelve la fila guardada.
export async function registerChannel(ref) {
  const chat = await resolveChannel(ref)
  if (!chat || chat.type !== 'channel') {
    const e = new Error('Eso no es un canal')
    e.code = 'NOT_CHANNEL'
    throw e
  }
  const me = await api.getMe()
  const member = await api.getChatMember({ chat_id: chat.id, user_id: me.id })
  if (!member || (member.status !== 'administrator' && member.status !== 'creator')) {
    const e = new Error('El bot no es admin de ese canal')
    e.code = 'NOT_ADMIN'
    throw e
  }
  let inviteLink = null
  try {
    const link = await api.exportChatInviteLink({ chat_id: chat.id })
    inviteLink = typeof link === 'string' ? link : (link && link.invite_link) || null
  } catch (e) {}
  const values = {
    chatId: chat.id,
    title: chat.title || null,
    username: chat.username || null,
    inviteLink,
  }
  const existing = await db.select().from(channels).where(eq(channels.chatId, chat.id)).get()
  if (existing) {
    await db.update(channels).set(values).where(eq(channels.chatId, chat.id))
  } else {
    await db.insert(channels).values(values).run()
  }
  return await db.select().from(channels).where(eq(channels.chatId, chat.id)).get()
}

async function resolveChannel(ref) {
  if (typeof ref === 'number') {
    return await api.getChat({ chat_id: ref })
  }
  if (typeof ref !== 'string') {
    const e = new Error('Referencia no válida')
    e.code = 'BAD_REF'
    throw e
  }
  const text = ref.trim()
  // @usuario del canal.
  if (/^@[\w]{5,}$/.test(text)) {
    return await api.getChat({ chat_id: text })
  }
  // Id numérico del canal (-100...).
  if (/^-?\d{6,}$/.test(text)) {
    return await api.getChat({ chat_id: Number(text) })
  }
  // Enlace t.me/...: usuario, o c/<id> para canales sin usuario.
  const m = text.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_+/]+)\/?$/)
  if (m) {
    const part = m[1]
    if (part.startsWith('c/')) {
      return await api.getChat({ chat_id: Number('-100' + part.slice(2)) })
    }
    if (part.startsWith('+')) {
      // Enlace de invitación: no identifica el canal, hay que reenviar
      // un mensaje del canal.
      const e = new Error('Ese enlace no identifica el canal')
      e.code = 'BAD_REF'
      throw e
    }
    return await api.getChat({ chat_id: '@' + part })
  }
  const e = new Error('Referencia no válida')
  e.code = 'BAD_REF'
  throw e
}

// Teclado y textos de la configuración, compartidos por el handler de
// mensajes y el de botones (callback_query).
export const CONFIG_KEYBOARD = {
  inline_keyboard: [
    [{ text: '📺 Configurar canal', callback_data: 'config_channel' }],
    [{ text: '📋 Mis canales', callback_data: 'list_channels' }],
  ],
}

export function helpText() {
  return 'TeleGallery solo guarda las fotos de los canales que configures aquí.\n\n' +
    'Para agregar un canal:\n' +
    '• Reenvíame cualquier mensaje del canal, o\n' +
    '• Mándame su @usuario o su enlace t.me/...\n\n' +
    'El bot tiene que ser admin del canal. Usa /canales para ver los configurados.'
}

export async function sendChannelList(chatId) {
  const list = await listChannels()
  if (!list.length) {
    await api.sendMessage({ chat_id: chatId, text: 'Todavía no hay canales configurados.\n\n' + helpText(), reply_markup: CONFIG_KEYBOARD })
    return
  }
  const keyboard = {
    inline_keyboard: list.map((ch) => ([{ text: '❌ ' + (ch.title || ch.username || ch.chatId), callback_data: 'remove:' + ch.chatId }])),
  }
  const lines = list.map((ch, i) => (i + 1) + '. ' + (ch.title || ch.username || ch.chatId)).join('\n')
  await api.sendMessage({
    chat_id: chatId,
    text: 'Canales configurados:\n' + lines + '\n\nToca uno para quitarlo.',
    reply_markup: keyboard,
  })
}
