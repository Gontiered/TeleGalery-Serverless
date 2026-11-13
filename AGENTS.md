# AGENTS.md — TeleGallery

Mini App de Telegram (Telegram Serverless / tgcloud). Galería de fotos
estilo Google Fotos; el almacenamiento es Telegram, vía el bot. Solo
fotos: videos, documentos y animaciones no se guardan ni se muestran.

## Qué hace

El usuario manda fotos a un canal de Telegram y la Mini App las organiza:
carpetas, búsqueda por pie de foto o hashtag, línea de tiempo, visor
estilo Google Fotos (deslizar, zoom, detalles), selección múltiple para
borrar o mover. Las fotos viven en Telegram; aquí solo van sus metadatos
y su `file_id`. El chat privado con el bot solo configura canales; los
grupos se ignoran.

## Desplegar (lo primero que te van a pedir)

La guía paso a paso está en `docs/DEPLOY.md`. Resumen:

```sh
npm install
npx tgcloud login      # CLI Access token de @BotFather → Serverless → CLI Access
npx tgcloud push       # sube el código y el sitio estático
npx tgcloud migrate    # aplica los cambios de tgcloud/schema.js a la BD
```

- El login necesita el **CLI Access token** (formato
  `app<id>:<secreto>`), no el token del bot. Si devuelve 401, se pegó el
  token del bot por error.
- `push` no toca la base de datos; los cambios de esquema se aplican con
  `migrate`.
- Después de desplegar, verifica: revisión en vivo nueva
  (`npx tgcloud webhook` dice que está en sync) y los archivos en vivo
  coinciden con los locales. Luego pídele al usuario que **cierre la
  Mini App por completo y la vuelva a abrir** antes de probar: Telegram
  guarda la versión en caché.
- Nunca anuncies que algo funciona sin verificarlo en vivo, y di lo que
  solo se puede probar en el teléfono del usuario (gestos, aspecto).

## Configuración (lo único que cambia por usuario)

- **`site/app.js`** — `BOT_USERNAME`, el @usuario del bot (sin `@`).
- No hay que escribir el id de Telegram del dueño en ningún sitio
  (`tgcloud/lib/owner.js`).

## Layout

- `site/` — front-end estático de la Mini App (`index.html`,
  `styles.css`, `app.js`). Sin build. Habla con el bot solo por
  endpoints.
- `tgcloud/schema.js` — tablas `items`, `albums`, `channels`, `users`.
- `tgcloud/handlers/` — `message.js` (solo configura canales en el chat
  privado), `callback_query.js` (botones de la configuración),
  `channel_post.js` (guarda las fotos de los canales configurados).
- `tgcloud/lib/` — `owner.js` (control de acceso del dueño),
  `channels.js` (registro y enlace de canales), `photos.js`
  (guardar/borrar foto, pie del álbum).
- `tgcloud/endpoints/` — `listItems`, `getThumb`, `deleteItem`,
  `deleteItems`, `listAlbums`, `createAlbum`, `movePhotos`,
  `deleteAlbum`, `getChannels`, `listCaptions`. `POST /api/<nombre>`,
  `export default async function (input, ctx)`, `ctx.initData.user` es
  el usuario verificado.
- `tgcloud.jsonc` — `"static": { "source": "site" }`.
- `docs/architecture.md` — cómo funciona todo por dentro, con las
  decisiones y los límites reales.
- `.cursor/rules/` — reglas de diseño de la UI (Telegram Mini App
  nativa + Toss-style + taste-skill).

## Reglas que no se rompen

- **Nunca subir tokens ni credenciales.** El token del bot no va en el
  repo ni en el front-end. El login del CLI guarda el token en local.
- **No hay descarga dentro de la app** (eliminada): el `<a download>` no
  hace nada dentro del WebView de Telegram en el móvil. Guardar se hace
  desde Telegram con "Ver en Telegram".
- **No hay salto al mensaje exacto en el chat privado**: `openTelegramLink`
  solo acepta enlaces `t.me`/`telegram.me`/`telegram.dog` y `t.me/c/`
  solo vale para grupos/canales. Por eso las fotos se toman del canal.
- El visor **no** usa el MainButton nativo por decisión de diseño: sus
  acciones viven en la barra inferior del visor; el BackButton nativo
  sigue siendo para cerrar el visor.
- La respuesta de un endpoint no puede pasar de ~2 MB: la foto viaja en
  base64 y la medida mediana (~1280 px, `mid_file_id`) lo evita en las
  fotos nuevas.
- Los imports relativos llevan `.js`; `import { db, api } from 'sdk'`,
  `import { … } from 'sdk/db'`; toda llamada a la BD es async (siempre
  `await`); sin claves foráneas; `push` no toca la BD.
- Todo cambio de UI respeta `.cursor/rules/` (Telegram Mini App nativa
  + Toss-style + taste-skill): un acento, grises, tokens de espaciado,
  texto de 16px o más (13px solo etiquetas), radios `--r-md`/`--r-lg`/
  pastilla, movimiento con una sola curva, press feedback (escala .985).
