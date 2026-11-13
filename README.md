# TeleGallery

Mini App de Telegram: una galería de fotos estilo Google Fotos, usando el
almacenamiento de Telegram a través de un bot. Solo fotos: videos,
documentos y animaciones no se guardan.

- Las fotos viven en Telegram; la galería solo guarda sus metadatos
  (`file_id`, pie de foto, fecha, carpeta) en la base de datos de
  Telegram Serverless (tgcloud). La base de datos nunca guarda la foto.
- Mandas las fotos a un canal de Telegram y aparecen solas en la
  galería, organizadas en carpetas, con búsqueda por pie de foto o
  hashtag, vista completa con deslizamiento y selección múltiple para
  borrar o mover.
- Sin servidor propio que mantener: el bot y la Mini App corren en la
  infraestructura de Telegram (tgcloud). Telegram no ha publicado
  precios ni límites para Serverless, así que revisa las condiciones
  en BotFather antes de depender de él en producción.

## Despliega tu propia copia

La guía completa, paso a paso, está en **[docs/DEPLOY.md](docs/DEPLOY.md)**:
crear el bot en @BotFather, crear el canal, instalar el CLI de tgcloud,
desplegar y configurar el canal desde el bot. Resumen:

```sh
git clone https://github.com/Gontiered/TeleGalery-Serverless.git
cd TeleGallery
npm install
npx tgcloud login      # enlaza este proyecto con tu bot
npx tgcloud push       # sube el código y el sitio estático
npx tgcloud migrate    # aplica los cambios de tgcloud/schema.js a la BD
```

Antes de desplegar, cambia un solo valor por el tuyo:

- **`site/app.js`** — `BOT_USERNAME`: el @usuario de tu bot, sin la
  `@`. Se usa para abrir el chat del bot cuando todavía no hay canal
  configurado y para el botón "Ver en Telegram" de las fotos viejas
  del chat privado.

No hay que escribir tu id de Telegram en ningún sitio.

### Con un agente de IA

Si prefieres que un agente de IA lo despliegue por ti, dale este
repositorio y este mensaje:

> Despliega TeleGallery por mí. Lee `AGENTS.md` y sigue
> `docs/DEPLOY.md` paso a paso. El @usuario de mi bot es `<tu bot>`:
> ponlo en `site/app.js`. Despliega con el CLI de tgcloud y verifica
> que la revisión en vivo y el webhook estén en sincronía antes de
> avisarme que está listo.

## Cómo entran las fotos

TeleGallery solo funciona con el canal. Las fotos se mandan al canal y
aparecen solas en la galería. El chat privado con el bot ya no recibe
fotos (solo sirve para configurar) y los grupos se ignoran.

### Configurar los canales (desde el bot)

1. Abre el bot y manda `/start`: salen dos botones, "📺 Configurar
   canal" y "📋 Mis canales".
2. Para agregar un canal, reenvíale cualquier mensaje del canal o
   mándale su @usuario, su enlace `t.me/...` o su id. El bot comprueba
   que existe, que es un canal y que él es admin.
3. Se pueden configurar varios canales. Con `/canales` ves los
   configurados y tocando uno lo quitas.
4. El bot tiene que ser admin del canal. El canal es además la única
   vía que permite saltar al mensaje exacto con "Ver en Telegram".

## Funciones

### Carpetas

- La portada de la app son las carpetas: una tarjeta por carpeta (portada
  + nombre + contador), una de "Todas las fotos" y una de "+ Nueva
  carpeta".
- Crear carpeta, mover fotos a una carpeta (desde la barra inferior del
  visor o desde la selección múltiple) y eliminar carpeta: las fotos no
  se borran, vuelven a "Todas las fotos".
- Cada foto está en una sola carpeta.

### Cuadrícula

- 3 columnas de miniaturas, que cargan perezosamente al entrar en
  pantalla. Si una miniatura falla al cargar, se reintenta dos veces y
  nunca deja la tarjeta vacía.
- **Scroll infinito:** no hay botón "Cargar más"; las fotos van cargando
  solas de 60 en 60 al desplazar hasta el final.
- **Búsqueda** por pie de foto (con debounce de 400 ms). Buscar un
  hashtag encuentra todas las fotos del álbum que lo llevan.
- Contador con el total de fotos guardadas. La cuadrícula se recarga sola
  al volver a la app.
- **Línea de tiempo** estilo Google Fotos: las fotos se agrupan por
  fecha con encabezados — "Hoy", "Ayer", el día de la semana para la
  última semana ("Lunes", "Martes"…) y el mes para lo más viejo
  ("Noviembre de 2026"). El encabezado no se repite al cargar más
  fotos con el scroll infinito.
- **Desplazamiento rápido:** una barrita en el borde derecho de la
  cuadrícula para volar por las fotos; al arrastrarla, una burbuja
  muestra la fecha por la que se va pasando ("Hoy", "Octubre de
  2026"…). Solo aparece cuando hay más fotos que pantalla.
- **Hashtags:** bajo las carpetas se ven todos los pies de foto
  registrados, una pastilla por pie con su miniatura, su texto y
  cuántas fotos lo llevan (los más usados primero). Tocar una pastilla
  abre esas fotos.

### Visor

- Tocar una foto la abre a pantalla completa, centrada sobre fondo
  negro: arriba el pie de foto con la fecha y el contador "foto n de
  N", abajo las acciones.
- **Tocar la foto** esconde la interfaz (queda solo la foto) y otro
  toque la vuelve a mostrar.
- **Zoom:** doble toque para ampliar al 220% (otro doble toque vuelve
  a la foto entera) y pellizco con dos dedos para ampliar o reducir;
  ampliada, la foto se mueve con el dedo sin salirse de la pantalla.
- **Deslizar** a los lados pasa a la foto anterior o siguiente y la
  foto sigue el dedo (también con las flechas del teclado). El botón
  nativo de atrás de Telegram cierra el visor.
- **Deslizar hacia abajo** cierra el visor; **hacia arriba** (o el
  botón ⓘ) abre los detalles: fecha, tamaño, dimensiones, carpeta,
  pie de foto y nombre del archivo.
- Barra inferior con:
  - **Ver en Telegram:** salta al mensaje exacto en el canal o grupo
    (`t.me/c/...`); para fotos del chat privado abre el chat del bot,
    porque ahí no existe enlace al mensaje.
  - **Mover a carpeta:** hoja inferior con la lista de carpetas, "Sin
    carpeta" y "Nueva carpeta…".
  - **Eliminar foto:** pide confirmación y borra la foto de la galería
    y también su mensaje en Telegram.
- **Vista previa rápida:** al abrir se ve al instante la miniatura
  estirada y borrosa mientras llega la completa; la app precarga en
  silencio la foto anterior y la siguiente, y recuerda las últimas 5
  fotos vistas para no volver a pedirlas.
- **Medida mediana:** las fotos nuevas guardan además una medida de
  ~1280 px, que es la que muestra el visor: se ve igual de nítida en el
  teléfono y pesa como la cuarta parte de la más grande. Las fotos
  viejas usan la más grande (no se pueden actualizar después).

### Selección múltiple

- Botón "Seleccionar" junto a la búsqueda: cada tarjeta muestra un
  círculo y tocar marca o desmarca. La barra inferior muestra el
  contador con "Mover", "Eliminar" y "Cancelar".
- Botón **"Todo"** (solo en modo de selección): selecciona todas las
  fotos de la vista actual — carpeta, búsqueda o todas — no solo las
  cargadas en pantalla. Si ya están todas, cambia a "Ninguno" y las
  quita.
- Borrar y mover en tandas de 50 con progreso en la barra, para que
  nunca salga el error de demasiadas imágenes a la vez. El servidor
  procesa de 5 en 5 en paralelo.

### Pies de foto y hashtags

- Cuando se mandan varias fotos juntas, Telegram le pone el pie solo a
  la primera. La galería copia el pie a todo el álbum, así que el
  hashtag vale para todas las fotos del grupo y la búsqueda las
  encuentra a todas. Solo vale para las fotos nuevas.
- Si el envío pasa de 10 fotos, Telegram lo parte en varios álbumes de
  10 y el pie solo va en el primero. La galería también copia el pie
  entre los álbumes del mismo envío (los que llegan juntos, hasta 60 s
  de diferencia), así que un pie vale para todas las fotos de un solo
  envío.

### Estado vacío

- Si una vista no tiene fotos, muestra "Todavía no hay fotos" con un
  botón "Mandar fotos al canal" que abre el canal.

## Qué no hace (límites reales)

- **No hay descarga dentro de la app:** el `<a download>` no hace nada
  dentro del WebView de Telegram en el móvil y la hoja de compartir no
  funcionó en las pruebas en móvil. Para guardar una foto se hace desde
  Telegram con "Ver en Telegram" (mantener presionado → Guardar en
  galería).
- **No hay salto al mensaje exacto en el chat privado:** `t.me/c/` solo
  vale para grupos y canales. Por eso las fotos se toman del canal.
- **Borrar solo desde Telegram no borra de la galería:** Telegram guarda
  la foto aunque se borre el mensaje y no avisa al bot, así que la fila
  queda huérfana. Borrar desde la app borra los dos lados.
- **Límite de ~2 MB en la respuesta del visor:** la foto viaja en
  base64 y la respuesta no puede pasar de ~2 MB. La medida mediana lo
  evita en las fotos nuevas; una foto vieja muy pesada podría no cargar
  en el visor (su miniatura y "Ver en Telegram" siguen funcionando).

## Estructura

| Ruta | Qué es |
| --- | --- |
| `site/` | Front-end de la Mini App (HTML + CSS + JS, sin build) |
| `tgcloud/schema.js` | Tablas: `items` (una foto guardada), `albums` (una carpeta), `channels` (un canal configurado) y `users` |
| `tgcloud/lib/owner.js` | Control de acceso: solo el dueño configura el bot |
| `tgcloud/handlers/message.js` | Chat privado con el bot: solo configura canales (/start, /canales, reenvíos y enlaces) |
| `tgcloud/handlers/callback_query.js` | Botones de la configuración (configurar, listar y quitar canales) |
| `tgcloud/handlers/channel_post.js` | Guarda las fotos publicadas en los canales configurados |
| `tgcloud/lib/photos.js` | Lógica compartida: guardar foto (miniatura, mediana, pie del álbum) y borrar foto |
| `tgcloud/lib/channels.js` | Lógica de canales: registrar, listar, quitar y enlace para abrirlos |
| `tgcloud/endpoints/getChannels.js` | `POST /api/getChannels` — devuelve los canales configurados con su enlace |
| `tgcloud/endpoints/listCaptions.js` | `POST /api/listCaptions` — devuelve todos los pies de foto con su contador y su portada |
| `tgcloud/endpoints/listItems.js` | `POST /api/listItems` — lista las fotos, con búsqueda, carpeta y paginación |
| `tgcloud/endpoints/getThumb.js` | `POST /api/getThumb` — devuelve la miniatura o la vista previa en base64 |
| `tgcloud/endpoints/deleteItem.js` | `POST /api/deleteItem` — borra una foto |
| `tgcloud/endpoints/deleteItems.js` | `POST /api/deleteItems` — borra varias fotos (máx. 100 por llamada) |
| `tgcloud/endpoints/listAlbums.js` | `POST /api/listAlbums` — lista las carpetas con contador y portada |
| `tgcloud/endpoints/createAlbum.js` | `POST /api/createAlbum` — crea una carpeta |
| `tgcloud/endpoints/movePhotos.js` | `POST /api/movePhotos` — mueve varias fotos a una carpeta (máx. 100 por llamada) |
| `tgcloud/endpoints/deleteAlbum.js` | `POST /api/deleteAlbum` — borra una carpeta sin borrar sus fotos |
| `tgcloud.jsonc` | Config de tgcloud: el front-end estático es `site/` |
| `docs/DEPLOY.md` | Guía de despliegue paso a paso (bot, canal, CLI, menú de la Mini App) |
| `docs/architecture.md` | Cómo funciona todo por dentro, con las decisiones y los límites |
| `AGENTS.md` | Guía para agentes de IA que vayan a desplegar o modificar el proyecto |
| `.cursor/rules/` | Reglas de diseño de la UI (Telegram Mini App + Toss-style + taste-skill) |

## Base de datos

- `items`: una fila por foto — `file_id` (la más grande), `thumb_file_id`
  (la miniatura), `mid_file_id` (la mediana, null en fotos viejas),
  `file_unique_id`, pie de foto (`caption`), `media_group_id` (el álbum
  de Telegram, null si se mandó sola), tamaño, dimensiones, `chat_id`,
  `message_id`, fecha y `album_id` (la carpeta, null = sin carpeta).
- `albums`: una fila por carpeta — nombre y dueño.
- `channels`: una fila por canal configurado — `chat_id` único, título,
  @usuario y enlace de invitación. Solo las fotos de estos canales se
  guardan.
- `users`: una fila por usuario de Telegram (`tg_id`, nombre).
- Los cambios de esquema se aplican con `migrate`; `push` no toca la BD.

## Seguridad

- **Nunca se sube ningún token a este repositorio.** El token del bot no
  va en el código ni en el front-end: la plataforma lo guarda y lo usa
  internamente para descargar las fotos.
- El login del CLI (`npx tgcloud login`) necesita el **CLI Access
  token** de @BotFather → el bot → Serverless → CLI Access (formato
  `app<id>:<secreto>`). No es el token del bot: si el login devuelve
  401, casi seguro se pegó el token del bot por error.
- Las miniaturas y la vista previa se sirven sin exponer el token del
  bot: el endpoint `getThumb` descarga los bytes en el servidor con
  `api.getFileContent` y los devuelve en base64 solo al dueño de la
  foto (el `initData` verificado de Telegram). Ver
  `docs/architecture.md`.

## Diseño

La UI sigue la guía de Telegram Mini App (basada en
core.telegram.org/bots/webapps): mobile-first, sentirse nativa de
Telegram, colores solo con variables `--tg-theme-*`, botón de volver
nativo (`BackButton`), áreas seguras, inputs de 16px o más y haptics. El
visor **no** usa el MainButton nativo por decisión de diseño: sus
acciones viven en la barra inferior del visor. Encima, un solo sistema de
diseño (taste-skill): tokens de espaciado `--s1..--s8`, texto de 16px o
más (13px solo etiquetas), radios `--r-md`/`--r-lg`/pastilla, un par de
botones (primario relleno, secundario en pastilla con borde), movimiento
con una sola curva y press feedback (escala .985) en cada control. Las
reglas Toss-style de
[awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules)
aportan el acento único, los grises, la escala de tipo estricta y el modo
oscuro con su propia escala de grises.

## Licencia

MIT. Ver [LICENSE](LICENSE).
