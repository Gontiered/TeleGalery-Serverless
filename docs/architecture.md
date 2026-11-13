# TeleGallery — arquitectura

## Idea

Telegram es el almacenamiento. El usuario le manda fotos al bot; Telegram
las guarda. La Mini App solo organiza lo que ya está ahí. Solo fotos:
videos, documentos y animaciones no se guardan (decisión 2026-11-12).

## Flujo

1. Usuario manda una foto al canal configurado (ver Solo el canal).
2. `tgcloud/handlers/channel_post.js` guarda un registro en la tabla `items`:
   `file_id`, `file_unique_id`, tamaño, pie de foto, fecha y el `chat_id` /
   `message_id` del mensaje original. No se descarga ni se copia la foto a
   ningún otro lado.
3. La Mini App llama `POST /api/listItems` con el `initData` verificado por
   tgcloud, así que cada usuario solo ve sus propias fotos. Siempre filtra
   `kind = 'photo'`.

## Las vistas previas

Una URL de descarga de Telegram es:

```
https://api.telegram.org/file/bot<TOKEN>/<file_path>
```

Esa URL lleva el token del bot. Si el front-end la construyera, el token
quedaría visible en el navegador. Por eso TeleGallery **no** usa esa URL y
**no** guarda ningún token en el repo.

La solución es el endpoint `tgcloud/endpoints/getThumb.js`: el servidor
descarga los bytes con `api.getFileContent(file_id)` — la plataforma usa su
propio token internamente, el código nunca lo ve —, verifica con el
`initData` que la foto pertenece al usuario que llama, y devuelve la
imagen en base64 dentro del JSON. El front-end la muestra como `data:` URL.

- Cuadrícula: miniatura (`size: 'thumb'`), cargada solo cuando la tarjeta
  entra en pantalla (IntersectionObserver) y cacheada en memoria.
- Detalle: foto completa (`size: 'full'`).

Límites: la Bot API permite descargar 20 MB por archivo. Las fotos de
Telegram ya vienen comprimidas, así que la vista completa cabe.

El runtime de tgcloud no tiene `btoa` ni `Buffer`, y tiene un límite de
memoria bajo: el codificador base64 manual debe armarse por bloques con
array + join (ver `getThumb.js`). Concatenar con `+=` carácter a carácter
revienta el límite ("Terminated: Memory limit exceeded") con archivos de
varios MB, aunque la descarga en sí funcione. Además, la respuesta de un
endpoint tiene un tope de serialización: 1 MB pasa, 2 MB ya falla
("Max serialized size reached", verificado 2026-11-12).

## Visor

Estilo Google Fotos (2026-11-12):

- La foto llena la pantalla, centrada sobre fondo negro. Arriba: atrás
  (←), el pie de foto con la fecha y el contador "foto n de N", y el
  botón ⓘ de detalles. Abajo: Ver en Telegram, Mover y Eliminar.
- **Tocar la foto** esconde las barras (queda solo la foto); otro toque
  las muestra. El botón nativo de atrás de Telegram también cierra el
  visor.
- **Zoom:** doble toque amplía al 220% centrado en el punto tocado (otro
  doble toque vuelve a la foto entera); pellizco con dos dedos amplía o
  reduce hasta 3x, con el punto bajo los dedos quieto. Ampliada, la foto
  se mueve con el dedo sin salirse de la pantalla (los límites se
  calculan del aspecto real de la imagen, porque `object-fit: contain`
  la deja con bandas).
- **Deslizar:** el carril tiene tres diapositivas (anterior, actual,
  siguiente) y la foto sigue el dedo; al soltar, si pasó un cuarto de
  pantalla (o un deslizamiento rápido de más de 50 px) anima hasta la
  foto vecina, si no vuelve a su sitio. En los extremos el arrastre
  tiene resistencia (se mueve solo un 30%). También con las flechas del
  teclado.
- **Deslizar hacia abajo** cierra el visor (la foto se va y se apaga);
  **hacia arriba** (o el botón ⓘ) abre la hoja de detalles: fecha,
  tamaño, dimensiones, carpeta, pie de foto y nombre del archivo.
- La miniatura borrosa sigue apareciendo al instante mientras llega la
  completa, y las fotos vecinas ya vienen cargadas (el carril las
  renderiza al abrir). `fetchFull` no pide la misma foto dos veces a la
  vez. El zoom se resetea al cambiar de foto y al cerrar el visor.
- Los gestos viven en `viewerStage` (`touch-action: none` para que el
  navegador no intervenga); la hoja de detalles y la barra de acciones
  están fuera del escenario, así que sus toques no se confunden con
  los gestos.
- El arrastre vertical mueve y desvanece el visor entero
  (`viewer.style.transform` / `opacity`). Si un pellizco empezaba en
  mitad de ese arrastre, el desvanecido se quedaba pegado y la foto se
  veía transparente para siempre: `clearViewerDrag()` lo limpia al
  empezar y al terminar el pellizco (corregido 2026-11-12, rev 40).

## Descargar fotos

No hay descarga dentro de la app (se quitó en 2026-11-12): guardar se
hace desde Telegram con "Ver en Telegram". El clic de descarga clásico
(`<a download>` con la foto en base64) **no funciona dentro del WebView
de Telegram en el móvil**: el WebView no tiene gestor de descargas y el
clic no hace nada, en silencio. Tampoco sirve `tg.downloadFile`: exige
una URL HTTPS del archivo y los endpoints de tgcloud solo devuelven
JSON (no bytes con `Content-Disposition`), y la URL de Telegram
(`api.telegram.org/file/…`) lleva el token del bot, que nunca debe
llegar al front-end. La hoja de compartir (`navigator.share`) tampoco
funcionó en las pruebas en móvil.

## Solo el canal

Desde 2026-11-12 TeleGallery solo funciona con el canal: las fotos ya
no se reciben por el chat privado con el bot ni por grupos. El chat
privado con el bot solo sirve para configurar, y los grupos se ignoran
por completo.

- **Configurar (desde el bot):** `/start` muestra dos botones:
  "📺 Configurar canal" y "📋 Mis canales". Para agregar un canal se
  reenvía cualquier mensaje del canal o se manda su @usuario, su
  enlace `t.me/...` o su id. El bot comprueba que existe, que es un
  canal y que él es admin (si no, avisa). `/canales` lista los
  configurados; tocar uno lo quita. La lógica vive en
  `tgcloud/lib/channels.js` (registro y lista), `handlers/message.js`
  (/start, /canales, reenvíos y enlaces) y `handlers/callback_query.js`
  (los botones). Se pueden configurar varios canales.
- **Tabla `channels`:** una fila por canal — `chat_id` único, título,
  @usuario y enlace de invitación. El handler de canal
  (`handlers/channel_post.js`) solo guarda la foto si su canal está en
  esa tabla; los demás canales se ignoran en silencio.
- **El salto:** para fotos del canal el enlace es
  `https://t.me/c/<id>/<message_id>`, con el chat_id sin el `-100`
  inicial; `openTelegramLink` lo acepta porque es un enlace `t.me`.
  La lógica vive en `telegramLinkFor` (`site/app.js`). El botón del
  estado vacío ("Mandar fotos al canal") abre el primer canal
  configurado (endpoint `getChannels`; si es público usa su @usuario).
- **Fotos viejas:** las que ya estaban en la galería de antes (del chat
  privado o de grupos) siguen ahí; el cambio solo afecta a las fotos
  nuevas. Borrar desde la app sigue funcionando igual (el bot, como
  admin, puede borrar el mensaje con `api.deleteMessage`).

## Pies de foto y hashtags

Cuando se mandan varias fotos juntas, Telegram las trata como un solo
álbum con un solo pie: el hashtag queda solo en la primera foto y las
demás llegan sin pie (así lo manda la Bot API). La galería guarda lo
que Telegram manda, así que antes solo la primera foto aparecía al
buscar el hashtag. Desde 2026-11-12 cada foto guarda su
`media_group_id` (columna `media_group_id`, null si se mandó sola) y
`savePhoto` copia el pie a todo el álbum: si la foto que llega trae
el pie, se lo pone a las hermanas del grupo que llegaron sin él; si
llega sin pie, lo copia de una hermana que ya lo tenga. Funciona en
el orden que lleguen. Solo vale para las fotos nuevas: las viejas no
tienen `media_group_id` guardado y no se pueden agrupar después.

Un envío de más de 10 fotos se parte en varios álbumes (máx. 10 por
álbum) y el pie solo va en la primera foto del primer álbum: 96 fotos
llegaron en 10 grupos en 14 s y solo 10 tenían el pie (2026-11-12).
Desde la rev 41 el pie también se copia entre grupos del mismo envío:
`savePhoto` busca el pie en el grupo y, si no hay, en la foto con pie
más reciente del mismo chat dentro de los 60 s anteriores
(`BURST_WINDOW_S` en `tgcloud/lib/photos.js`); si llega una foto con
pie, se lo pone además a las fotos sin pie de esa ventana. El pie del
propio grupo siempre manda sobre uno prestado de otro envío. Una foto
sin pie que llega más de 60 s después de la última con pie no hereda
nada.

## Hashtags

La portada muestra, bajo las carpetas, todos los pies de foto
registrados: una pastilla por pie, con la miniatura de la foto más
reciente, el texto y cuántas fotos lo llevan, los más usados primero
(endpoint `listCaptions`). Tocar una pastilla abre esas fotos (la
vista de fotos con la búsqueda puesta en ese pie). El endpoint agrupa
en el servidor; el SDK no prepara bien el GROUP BY con agregados, así
que trae los pies ordenados por fecha y agrupa en JavaScript (límite
1000 fotos).

## Selección múltiple

El botón "Seleccionar" junto a la búsqueda entra al modo de selección
(estilo Google Fotos): cada tarjeta muestra un círculo arriba a la
izquierda, tocar una foto la marca o la desmarca, y una barra fija
abajo muestra el contador con "Mover", "Eliminar" y "Cancelar". En el
modo de selección aparece además un botón "Todo" junto a la búsqueda:
selecciona todas las fotos de la vista actual (búsqueda y carpeta),
no solo las 60 cargadas en la cuadrícula — trae los ids página por
página con `listItems` — y si ya están todas, cambia a "Ninguno" y
las quita. "Eliminar" pide confirmación con el diálogo nativo de
Telegram (`tg.showConfirm`) y borra en tandas de 50: el servidor
rechaza cualquier llamada con más de 100 ids ("Demasiadas imágenes a
la vez", el mensaje que salía al borrar 149 de una vez), así que
la app nunca manda más de 50 y muestra el progreso ("Eliminando 50
de 149…"). Mover usa las mismas tandas de 50. En el servidor,
`deleteItems` y `movePhotos` procesan de 5 en 5 en paralelo, porque
una por una 100 fotos tardarían demasiado. El servidor borra cada
foto con la misma lógica que `deleteItem` (mensaje en Telegram + fila
de la galería, solo el dueño) y reporta las que fallaron en `failed`
sin frenar las demás. Al borrar o mover, el modo de selección se
cierra y la cuadrícula se recarga. La lógica de borrado vive en
`tgcloud/lib/photos.js` (`deletePhotoItem`) y la comparten `deleteItem`
y `deleteItems`.

## Rediseño con taste-skill

El 2026-11-12 se rediseñó toda la interfaz con la skill
[taste-skill](https://github.com/Leonxlnx/taste-skill), enfocada en móvil. Lo que
se aplicó, adaptado a una Mini App:

- **Un solo sistema:** escala de espaciado `--s1..--s8`, escala de tipo
  (el texto que se lee es de 16px o más; 13px solo para etiquetas y
  metadatos), una familia de radios (`--r-md` 12px, `--r-lg` 14px,
  pastillas), un par de botones (primario relleno con el acento, una
  sola acción principal por vista; secundario en pastilla con borde),
  un solo acento (el azul de Telegram) y grises para todo lo demás.
- **Movimiento:** cada botón, tarjeta y control responde al toque
  (escala .985 al presionar, 90ms, una sola curva ease-out); sin
  revelados al hacer scroll, sin efectos sobre las fotos.
- **Estado vacío:** antes era solo una línea de estado; ahora es un
  bloque claro con una sola acción principal ("Mandar fotos al bot",
  que abre el chat con el bot).
- **Contraste del menú ⋮:** antes usaba el fondo de sección de
  Telegram, que en modo claro es blanco y dejaba el texto claro
  invisible; ahora tiene fondo oscuro propio del visor.

Lo que NO se aplicó, a propósito: el deal de paleta y tipografía
(la paleta viene del tema de Telegram, `--tg-theme-*`, y la letra es
la del sistema, para que la app se vea nativa), el hero, las
secciones de landing, los efectos shader y el gate de la skill
(`gate.mjs`, `consistency.mjs`): están hechos para páginas de
marketing con hero y secciones, no para una app. La verificación
sigue la skill de verificación de Mini Apps: despliegue en vivo +
prueba en un teléfono real.

## Carpetas

Las carpetas viven dentro de la app, no son canales: la fuente de las
fotos sigue siendo el mismo canal o el chat con el bot. Una foto está
en una sola carpeta (`items.album_id`, null = sin carpeta, sale en
"Todas las fotos"); la tabla `albums` guarda id, usuario y nombre.

- **Vista de carpetas (la portada):** tarjetas en dos columnas con la
  foto más reciente de portada, el nombre y el contador; una tarjeta
  para "Todas las fotos" y una para crear una carpeta nueva.
- **Crear:** desde la tarjeta "+ Nueva carpeta" o desde la hoja de
  mover ("Nueva carpeta…" crea la carpeta y mueve ahí las fotos de una
  vez). El nombre se escribe en un campo de la app (Telegram no tiene
  un diálogo nativo con entrada de texto).
- **Mover:** desde el menú ⋮ del visor ("Mover a carpeta") o desde la
  barra de selección múltiple ("Mover"). La hoja inferior lista las
  carpetas, "Sin carpeta" (sacarlas de la carpeta) y "Nueva carpeta…".
  El endpoint `movePhotos` mueve varias a la vez y reporta las que
  fallaron.
- **Borrar carpeta:** el botón "Eliminar" en la vista de la carpeta
  pide confirmación; las fotos no se borran, vuelven a "Todas las
  fotos" (`deleteAlbum`).
- El botón nativo de atrás vuelve de una carpeta a las carpetas, y
  del visor cierra el visor; en las carpetas no aparece.

## Miniaturas

La cuadrícula carga las miniaturas perezosamente (IntersectionObserver,
200px de margen): cada tarjeta pide su miniatura al entrar en pantalla.
Si la petición falla en ese momento (la red, o muchas miniaturas pidiendo
a la vez al desplazar rápido), se reintenta dos veces con espera creciente
(500ms, 1000ms) y la imagen nunca se borra de la tarjeta: el próximo
recargado de la cuadrícula (al volver a la app, al buscar, al cambiar de
vista) lo vuelve a intentar. Antes, un fallo borraba la imagen y dejaba
el cuadro vacío para siempre — así quedaron 7 tarjetas vacías el
2026-11-12, aunque las 7 miniaturas funcionaban bien al probarlas
después (son de ~1,5 KB cada una).

## Scroll infinito

La cuadrícula carga de 60 en 60. Antes había un botón "Cargar más";
desde 2026-11-12 no hay botón: un centinela
invisible al final de la cuadrícula (`#sentinel`, IntersectionObserver
con 600px de margen) carga la siguiente página sola al desplazar, con
un aviso discreto "Cargando más fotos…" mientras carga. Un `loading`
evita dos cargas a la vez y no carga con el visor abierto; el centinela
se esconde al llegar al final o si una página viene vacía (para no
pedir en bucle).

## Línea de tiempo

La cuadrícula agrupa las fotos por fecha, estilo Google Fotos
(`groupFor` en `site/app.js`, sin cambios en el servidor: la fecha ya
viene en cada fila de `listItems`):

- **Hoy** y **Ayer** para los últimos dos días.
- El día de la semana ("Lunes", "Martes"…) para los 7 días anteriores.
- El mes y el año ("Noviembre de 2026") para lo más viejo.

El encabezado es un `<h2 class="date-header">` que ocupa las tres
columnas de la cuadrícula. Como las fotos llegan ordenadas por fecha
descendente, el front-end recuerda la clave del último grupo puesto
(`lastGroupKey`, se resetea al recargar la vista) y no repite el
encabezado cuando un grupo sigue en la página siguiente del scroll
infinito. Funciona igual con búsqueda, hashtags y carpetas, porque
todas usan el mismo `load()`.

## Desplazamiento rápido

Una barrita en el borde derecho de la cuadrícula, estilo Google Fotos
(`fastScroll` en `site/index.html` y `site/app.js`, sin cambios en el
servidor):

- Solo aparece en la vista de fotos, con el visor cerrado y cuando hay
  más fotos que pantalla. Su tamaño es proporcional a lo que se ve
  frente a lo cargado (mínimo 32 px) y su posición sigue el scroll.
- Al arrastrarla (eventos de puntero con `touch-action: none` y
  captura del puntero), el dedo mueve la página a la fracción
  correspondiente y una burbuja muestra la fecha por la que se va
  pasando. La fecha se lee del encabezado de la línea de tiempo
  (`dateAtScroll`: el último `.date-header` por encima de esa
  posición).
- La barrita va por debajo de la barra de búsqueda fija (z-index 4
  frente a 5), para no tapar sus botones cuando está arriba del todo.
- Límite conocido: la barrita refleja lo cargado, no toda la galería
  — al arrastrar hasta el final, el scroll infinito carga más fotos y
  el rango se alarga.

## Vista previa rápida

Medido 2026-11-12 con fotos reales: abrir la completa tarda ~1,4 s,
pero la descarga desde Telegram son solo 30–60 ms y la codificación
casi 0. Lo que tarda es el viaje de ida y vuelta con ~1 MB en base64
(hasta una miniatura de 1,4 KB tarda ~0,7 s solo por el viaje). Por
eso la velocidad se ataca en cuatro puntos:

- **Medida mediana**: Telegram guarda cada foto en varias medidas.
  Al guardar se elige también la más grande que no pase de 1280 px
  (`mid_file_id`, `pickMidPhoto` en `tgcloud/lib/photos.js`) y el
  visor la pide con `getThumb` size `full` (que prefiere la mediana y
  cae a la más grande en las fotos viejas, sin `mid_file_id`). Pesa
  como la cuarta parte y nunca se acerca al límite de ~2 MB de la
  respuesta. Las fotos viejas no se pueden actualizar: la Bot API no
  tiene cómo pedir las medidas de un mensaje ya guardado.
- **Miniatura borrosa al instante**: al abrir el visor, la miniatura
  que ya está en el teléfono se muestra estirada y borrosa
  (`img.full.blur`) mientras llega la completa.
- **Precarga**: al cargar una foto se traen en silencio la anterior y
  la siguiente, para que deslizar sea instantáneo.
- **Memoria de las últimas 5**: las fotos completas ya vistas se
  guardan en un Map en memoria (máximo 5, se olvida la más vieja) y
  no vuelven a pedirse.

## Eliminar fotos

El visor tiene una barra inferior con "Ver en Telegram", "Mover" y
"Eliminar foto" (antes vivían en un menú ⋮, que se quitó en el
rediseño del visor de 2026-11-12). "Ver en Telegram" salta a la foto
en Telegram — al mensaje exacto si viene de un grupo o canal (ver la
sección anterior), al chat del bot si viene del chat privado — y ahí
la foto se guarda con la interfaz nativa de Telegram, que es la vía
de descarga que sí funciona siempre.

La descarga dentro de la app se eliminó: el `<a download>` no hace
nada dentro del WebView de Telegram en el móvil y la hoja de compartir
tampoco funcionó en las pruebas en móvil. "Eliminar foto" pide
confirmación con el diálogo nativo de Telegram (`tg.showConfirm`) y
llama al endpoint
`tgcloud/endpoints/deleteItem.js`: verifica con el `initData` que la foto
pertenece al usuario, borra su mensaje en el chat con el bot con
`api.deleteMessage` y luego borra el registro de la tabla `items`. Si el
mensaje ya no existe (el usuario lo borró antes a mano en el chat), igual
se borra el registro, para no dejar fotos huérfanas en la galería.

## Base de datos

SQLite de tgcloud, tabla `items` (ver `tgcloud/schema.js`). Sin claves
foráneas: el SDK las rechaza en la declaración. Los cambios de esquema se
aplican con `npx tgcloud migrate`, nunca solo con `push`.

## Despliegue

```sh
npm install
npx tgcloud login
npx tgcloud push
npx tgcloud migrate
```

El front-end es estático (`site/`, sin build). `tgcloud.jsonc` lo sirve como
la Mini App en `https://app<app_id>.tgcloud.ai/`.

## Configuración

Lo único que cambia de un despliegue a otro es un valor:

- **`site/app.js`** — `BOT_USERNAME`, el @usuario del bot (sin `@`).

El id de Telegram del dueño no se escribe en ningún sitio
(`lib/owner.js`). La guía completa está en `docs/DEPLOY.md`.
