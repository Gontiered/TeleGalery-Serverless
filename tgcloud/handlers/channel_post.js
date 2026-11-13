import { savePhoto } from '../lib/photos.js'
import { isChannelConfigured } from '../lib/channels.js'
import { getOwnerId } from '../lib/owner.js'

// Publicaciones de los canales configurados desde el bot. Un
// channel_post no trae `from`: las fotos se guardan a nombre del dueño
// (el primer usuario de la tabla `users`, ver lib/owner.js), el único
// usuario de TeleGallery. El bot guarda en silencio, sin publicar nada
// en el canal. Si el canal no está configurado, la foto se ignora.

export default async function (post) {
  if (!post.photo) return
  if (!(await isChannelConfigured(post.chat.id))) return
  const ownerId = await getOwnerId()
  if (ownerId === null) return
  await savePhoto(post, ownerId)
}
