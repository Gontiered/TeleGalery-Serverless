import { api } from 'sdk'
import { listChannels, removeChannel, CONFIG_KEYBOARD, helpText, sendChannelList } from '../lib/channels.js'
import { isOwner } from '../lib/owner.js'

// Botones de la configuración del bot (el teclado de /start y de
// /canales). Solo el dueño puede usarlos.

export default async function (query) {
  const from = query.from || {}
  const data = query.data || ''
  const chatId = query.message && query.message.chat ? query.message.chat.id : null
  try {
    if (!(await isOwner(from.id))) {
      await api.answerCallbackQuery({ callback_query_id: query.id, text: 'Solo el dueño puede configurar.', show_alert: true })
      return
    }
    if (data === 'config_channel') {
      await api.answerCallbackQuery({ callback_query_id: query.id })
      await api.sendMessage({ chat_id: chatId, text: 'Para agregar un canal:\n\n• Reenvíame cualquier mensaje del canal, o\n• Mándame su @usuario o su enlace t.me/...' })
      return
    }
    if (data === 'list_channels') {
      await api.answerCallbackQuery({ callback_query_id: query.id })
      await sendChannelList(chatId)
      return
    }
    if (data.startsWith('remove:')) {
      const id = Number(data.slice('remove:'.length))
      await removeChannel(id)
      await api.answerCallbackQuery({ callback_query_id: query.id, text: 'Canal eliminado.' })
      // Actualizar el mensaje de la lista con lo que queda.
      const list = await listChannels()
      const text = list.length
        ? 'Canales configurados:\n' + list.map((ch, i) => (i + 1) + '. ' + (ch.title || ch.username || ch.chatId)).join('\n') + '\n\nToca uno para quitarlo.'
        : 'Ya no hay canales configurados.\n\n' + helpText()
      const keyboard = list.length
        ? { inline_keyboard: list.map((ch) => ([{ text: '❌ ' + (ch.title || ch.username || ch.chatId), callback_data: 'remove:' + ch.chatId }])) }
        : CONFIG_KEYBOARD
      try {
        await api.editMessageText({ chat_id: chatId, message_id: query.message.message_id, text, reply_markup: keyboard })
      } catch (e) {
        await api.sendMessage({ chat_id: chatId, text, reply_markup: keyboard })
      }
      return
    }
    await api.answerCallbackQuery({ callback_query_id: query.id })
  } catch (e) {
    // No dejar el botón cargando: si algo falla, al menos responder.
    try { await api.answerCallbackQuery({ callback_query_id: query.id }) } catch (e2) {}
  }
}
