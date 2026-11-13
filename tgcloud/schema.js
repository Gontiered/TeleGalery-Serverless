import { table, integer, text, index, sql } from 'sdk/db'

// Una foto que el usuario le mandó al bot. Telegram guarda la foto;
// aquí solo guardamos sus metadatos y su file_id para volver a pedirla.
export const items = table('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  // Siempre 'photo' (TeleGallery es solo fotos).
  kind: text('kind').notNull(),
  fileId: text('file_id').notNull(),
  // file_id de la foto más pequeña (foto[0]).
  // Sirve para la cuadrícula sin descargar la foto completa.
  thumbFileId: text('thumb_file_id'),
  // file_id de la medida mediana (la más grande que no pasa de 1280 px
  // de ancho). Es la que muestra el visor: pesa como la cuarta parte
  // de la más grande y nunca se acerca al límite de 2 MB de la
  // respuesta. Null en las fotos viejas (usan la más grande).
  midFileId: text('mid_file_id'),
  fileUniqueId: text('file_unique_id').notNull().unique(),
  fileName: text('file_name'),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  caption: text('caption'),
  width: integer('width'),
  height: integer('height'),
  duration: integer('duration'),
  // Identificador del álbum de Telegram (media_group_id) cuando la
  // foto se mandó junto con otras. Sirve para copiarle el pie de foto
  // a todo el álbum: Telegram solo le pone el pie a la primera foto.
  mediaGroupId: text('media_group_id'),
  // Mensaje original en Telegram.
  chatId: integer('chat_id').notNull(),
  messageId: integer('message_id').notNull(),
  // Fecha del mensaje original (unix, segundos).
  date: integer('date').notNull(),
  // Carpeta de la foto (null = sin carpeta, sale en "Todas las fotos").
  albumId: integer('album_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  userDateIdx: index('idx_items_user_date').on(t.userId, t.date),
  userKindIdx: index('idx_items_user_kind').on(t.userId, t.kind),
  userAlbumIdx: index('idx_items_user_album').on(t.userId, t.albumId),
}))

// Un canal configurado para la Mini App. Solo las fotos de estos canales
// se guardan; el chat privado con el bot, los grupos y los demás canales
// no aportan fotos. Se configura desde el bot con /start.
export const channels = table('channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull().unique(),
  title: text('title'),
  username: text('username'),
  inviteLink: text('invite_link'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  chatIdx: index('idx_channels_chat').on(t.chatId),
}))

// Una carpeta dentro de la app. Borrarla no borra las fotos: vuelven a
// "Todas las fotos" (su album_id queda en null).
export const albums = table('albums', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  userIdx: index('idx_albums_user').on(t.userId),
}))

export const users = table('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tgId: integer('tg_id').unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})
