# Desplegar TeleGallery

Guía paso a paso para tener tu propia copia funcionando. No hace falta
saber programar: solo seguir los pasos en orden. Si prefieres que un
agente de IA lo haga por ti, dale este repositorio y el mensaje de
`README.md` ("Con un agente de IA").

Tiempo estimado: 20–30 minutos la primera vez.

> Telegram no ha publicado precios ni límites para Serverless: el
> servicio parece estar disponible sin cargo durante el periodo actual
> de lanzamiento, pero no hay una tarifa ni unos límites oficiales.
> Revisa las condiciones en BotFather antes de depender de él en
> producción.

## Lo que necesitas antes de empezar

- Una cuenta de Telegram (en el teléfono).
- Un ordenador con [Node.js 18 o más reciente](https://nodejs.org/)
  y [Git](https://git-scm.com/).
- Un canal de Telegram donde mandar las fotos (lo creas en el paso 3,
  o usas uno que ya tengas; tiene que ser un canal, no un grupo).

## Paso 1. Crear el bot

1. En Telegram, abre [@BotFather](https://t.me/BotFather) y manda
   `/newbot`.
2. Ponle un nombre (el que se ve en el chat) y un @usuario (tiene que
   terminar en `bot`, por ejemplo `MiGaleriaFotos_bot`).
3. BotFather te da el **token del bot** (una cadena larga). Guárdalo en
   un lugar seguro y **no lo compartas con nadie**. Para desplegar en
   tgcloud no lo necesitas, pero es la llave de tu bot.

## Paso 2. El token de acceso al CLI (no es el token del bot)

El CLI de tgcloud no usa el token del bot: usa un **CLI Access token**.
Es el error más común (si el login devuelve 401, casi seguro se pegó
el token del bot por error).

1. En [@BotFather](https://t.me/BotFather), abre tu bot.
2. Ve a **Bot Settings → Serverless → CLI Access**.
3. Copia el **Access token**. Tiene el formato `app<id>:<secreto>`
   (empieza por `app` seguido de números).

## Paso 3. Crear el canal y hacer admin al bot

1. En Telegram, crea un canal (**Nuevo canal**). Puede ser privado o
   público; si es público, con su @usuario basta para abrirlo.
2. Añade tu bot al canal y hazlo **administrador** (sin permisos
   especiales: solo necesita poder leer y publicar, que es lo que
   Telegram le da a un admin del canal).
3. El bot tiene que ser admin para que Telegram le mande las fotos que
   se publican en el canal.

## Paso 4. Clonar el proyecto y poner tus datos

```sh
git clone https://github.com/Gontiered/TeleGalery-Serverless.git
cd TeleGallery
npm install
```

Cambia un solo valor por el tuyo: en **`site/app.js`**, pon el
@usuario de tu bot en `BOT_USERNAME` (sin la `@`):

```js
const BOT_USERNAME = 'MiGaleriaFotos_bot'
```

Se usa para abrir el chat del bot cuando todavía no hay canal
configurado y para el botón "Ver en Telegram" de las fotos viejas
del chat privado.

No hay que escribir tu id de Telegram en ningún sitio.

## Paso 6. Desplegar con el CLI de tgcloud

```sh
npx tgcloud login      # enlaza este proyecto con tu bot
npx tgcloud push       # sube el código y el sitio estático
npx tgcloud migrate    # aplica los cambios de tgcloud/schema.js a la BD
```

- `login` es interactivo: te pide el **CLI Access token** del paso 2.
  Lo guarda en tu ordenador, nunca en el repositorio.
- `push` imprime la URL de tu Mini App al final, algo como
  `https://app1234567890.tgcloud.ai/`. Apúntala: es la URL del paso 7.
- `migrate` crea las tablas (`items`, `albums`, `channels`, `users`).
  `push` no toca la base de datos; si cambias `tgcloud/schema.js`,
  hay que correr `migrate` después de `push`.
- Para comprobar que todo está en sincronía:
  `npx tgcloud webhook` (tiene que decir que el webhook está en sync).

## Paso 7. El botón de la Mini App en BotFather

Para que la galería se abra desde el bot:

1. En [@BotFather](https://t.me/BotFather), abre tu bot.
2. Ve a **Bot Settings → Menu Button → Configure Menu Button**.
3. Pega la URL que imprimió `push` (por ejemplo
   `https://app1234567890.tgcloud.ai/`) y ponle un texto corto, por
   ejemplo `Galería`.

Ahora, al abrir el bot, el botón del menú abre la Mini App.

## Paso 8. Configurar el canal desde el bot

1. Abre tu bot y manda `/start`: salen dos botones, "📺 Configurar
   canal" y "📋 Mis canales".
2. Toca **"📺 Configurar canal"** y sigue las instrucciones: reenvíale
   cualquier mensaje del canal o mándale su @usuario, su enlace
   `t.me/...` o su id.
3. El bot comprueba que existe, que es un canal y que él es admin. Si
   todo está bien, responde "Canal configurado".
4. Se pueden configurar varios canales. Con `/canales` ves los
   configurados y tocando uno lo quitas.

## Paso 9. Probarlo

1. Manda una foto al canal (o varias juntas con un pie de foto).
2. Abre la Mini App con el botón del menú del bot.
3. La foto tiene que aparecer en la galería. Si mandaste varias con un
   hashtag, buscar ese hashtag las encuentra a todas.

Si la Mini App muestra una versión vieja (por ejemplo, después de un
`push`), ciérrala por completo y vuelve a abrirla: Telegram guarda la
versión en caché.

## Actualizar tu copia

Cuando quieras actualizar a una versión nueva del repositorio (o
después de cambiar el código):

```sh
git pull
npx tgcloud push
npx tgcloud migrate    # solo si cambió tgcloud/schema.js
```

Cierra y vuelve a abrir la Mini App para ver los cambios.

## Problemas comunes

| Síntoma | Causa probable y arreglo |
| --- | --- |
| `login` devuelve 401 | Se pegó el token del bot en vez del CLI Access token. Repite el paso 2 y usa el de Serverless → CLI Access. |
| `push` falla con `COMPILE_FAILED` | Un módulo no se encuentra (import sin `.js` o ruta mal escrita). Revisa que los imports relativos terminen en `.js`. |
| Las fotos no aparecen en la galería | El bot no es admin del canal, o el canal no está configurado (`/start` → "Mis canales"). También revisa que las fotos vayan al canal, no al chat del bot ni a un grupo. |
| La Mini App se ve vacía o vieja | Ciérrala por completo y vuelve a abrirla (caché de Telegram). |
| `webhook` dice que no está en sync | Corre `npx tgcloud push` de nuevo; la plataforma refresca el webhook al desplegar. |
| La Mini App dice "No autorizado" | La galería solo la puede abrir quien configuró el bot. |
| "Ver en Telegram" no hace nada | Ese botón solo funciona con enlaces `t.me/...`. Las fotos del chat privado no tienen enlace al mensaje: por eso las fotos se toman del canal. |
| Una foto no carga en el visor | La respuesta del visor no puede pasar de ~2 MB. Las fotos nuevas usan la medida mediana (~1280 px) y no llegan a ese límite; una foto vieja muy pesada puede fallar (su miniatura y "Ver en Telegram" siguen funcionando). |

## Seguridad

- **Nunca subas un token a GitHub.** El token del bot y el CLI Access
  token viven en tu ordenador (el login del CLI los guarda localmente),
  nunca en el repositorio. El archivo `.gitignore` ya excluye
  `node_modules/` y `.tgcloud/` (el estado local del CLI).
- El token del bot tampoco va en el front-end: la plataforma lo guarda
  y lo usa internamente para descargar las fotos. El endpoint
  `getThumb` descarga los bytes en el servidor y los devuelve en
  base64 solo al dueño de la foto.
