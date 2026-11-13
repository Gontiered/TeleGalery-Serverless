import { listChannels, channelUrl } from '../lib/channels.js'
import { isOwner } from '../lib/owner.js'
import { EndpointError } from 'sdk'

// POST /api/getChannels  {}
//
// Devuelve los canales configurados desde el bot, con su enlace para
// abrirlos. Solo el dueño puede pedirlos.

export default async function (input, ctx) {
  const user = ctx.initData && ctx.initData.user
  if (!user || !user.id) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })
  if (!(await isOwner(user.id))) throw new EndpointError('No autorizado', { code: 'UNAUTHORIZED' })
  const list = await listChannels()
  return { channels: list.map((ch) => ({ chatId: ch.chatId, title: ch.title, username: ch.username, url: channelUrl(ch) })) }
}
