// TeleGallery — front-end de la Mini App. Solo fotos.
// Habla con el bot solo a través de endpoints tgcloud:
//   Telegram.WebApp.Serverless.call('listItems', …)
//   Telegram.WebApp.Serverless.call('getThumb', …)
// Si se abre fuera de Telegram, muestra un aviso y no llama a la API.
(function () {
  const tg = window.Telegram && window.Telegram.WebApp
  const grid = document.getElementById('grid')
  const status = document.getElementById('status')
  const empty = document.getElementById('empty')
  const emptyOpenBot = document.getElementById('emptyOpenBot')
  const sentinel = document.getElementById('sentinel')
  const loadingMore = document.getElementById('loadingMore')
  const tagsSection = document.getElementById('tagsSection')
  const tagsList = document.getElementById('tagsList')
  const toolbar = document.getElementById('toolbar')
  const backRow = document.getElementById('backRow')
  const backBtn = document.getElementById('backBtn')
  const albumTitle = document.getElementById('albumTitle')
  const deleteAlbumBtn = document.getElementById('deleteAlbumBtn')

  // Configuración de tu propia copia: el @usuario de tu bot (sin @).
  // Se usa para abrir el chat del bot cuando todavía no hay canal
  // configurado y para el botón "Ver en Telegram" de las fotos viejas
  // del chat privado (ahí no existe enlace al mensaje).
  const BOT_USERNAME = 'TelegGallery_bot'

  // Vista actual: 'albums' (la portada con las carpetas) o 'photos'
  // (la cuadrícula de una carpeta o de todas las fotos).
  let view = { name: 'albums' }

  // Estado vacío: una sola acción principal que abre el canal.
  // El canal es el primero configurado desde el bot (endpoint
  // getChannels). Si no hay ninguno configurado, se abre el chat del
  // bot, donde /start muestra cómo configurar uno.
  let firstChannelUrl = 'https://t.me/' + BOT_USERNAME
  async function loadChannels() {
    try {
      const res = await call('getChannels', {})
      if (res.channels && res.channels.length) firstChannelUrl = res.channels[0].url
    } catch (e) {}
  }
  function openChannel() {
    const url = firstChannelUrl
    if (tg && tg.openTelegramLink) tg.openTelegramLink(url)
    else if (tg && tg.openLink) tg.openLink(url)
    else window.open(url, '_blank')
  }
  emptyOpenBot.addEventListener('click', openChannel)
  const search = document.getElementById('search')
  const viewer = document.getElementById('viewer')
  const viewerStage = document.getElementById('viewerStage')
  const viewerTrack = document.getElementById('viewerTrack')
  const viewerCaption = document.getElementById('viewerCaption')
  const viewerMeta = document.getElementById('viewerMeta')
  const detailsSheet = document.getElementById('detailsSheet')
  const detailsTitle = document.getElementById('detailsTitle')
  const detailsList = document.getElementById('detailsList')

  let q = ''
  let offset = 0
  let total = 0
  // Clave del grupo de fecha del último encabezado puesto en la
  // cuadrícula: así un grupo no se repite al cargar otra página.
  let lastGroupKey = null
  // true mientras una página está cargando: evita dos cargas a la vez
  // (el centinela puede dispararse varias veces seguidas).
  let loading = false
  const LIMIT = 60
  // Fotos cargadas en la cuadrícula (en el orden que se muestran) y la
  // posición de la que está abierta en el visor, para pasar de una a otra
  // deslizando o con las flechas.
  let items = []
  let currentIndex = -1
  // Selección múltiple: modo de selección y las fotos marcadas.
  let selectMode = false
  const selected = new Set()
  const selectModeBtn = document.getElementById('selectMode')
  const selectAllBtn = document.getElementById('selectAll')
  const selectBar = document.getElementById('selectBar')
  const selectCount = document.getElementById('selectCount')
  const selectMoveBtn = document.getElementById('selectMove')
  const selectDeleteBtn = document.getElementById('selectDelete')
  const selectCancelBtn = document.getElementById('selectCancel')

  function haptic(kind) {
    if (tg && tg.HapticFeedback && typeof tg.HapticFeedback[kind] === 'function') {
      if (kind === 'selectionChanged') tg.HapticFeedback.selectionChanged()
    }
  }

  function goBack() { showAlbums() }

  // El botón nativo de atrás: en el visor cierra el visor, en una
  // carpeta vuelve a las carpetas, en las carpetas no aparece.
  function syncBackButton() {
    if (!tg || !tg.BackButton) return
    tg.BackButton.offClick(closeViewer)
    tg.BackButton.offClick(goBack)
    if (!viewer.hidden) {
      tg.BackButton.onClick(closeViewer)
      tg.BackButton.show()
    } else if (view.name === 'photos') {
      tg.BackButton.onClick(goBack)
      tg.BackButton.show()
    } else {
      tg.BackButton.hide()
    }
  }

  function closeViewer() {
    viewer.hidden = true
    closeDetails()
    resetZoom()
    setChrome(false)
    viewer.style.transform = ''
    viewer.style.opacity = ''
    viewer.style.transition = ''
    syncBackButton()
    updateFastScroll()
  }

  // Acciones del visor, estilo Google Fotos: viven en la barra
  // inferior, a la vista (antes estaban en el menú ⋮). La descarga no
  // existe: no funcionaba dentro del WebView y guardar se hace desde
  // Telegram con "Ver en Telegram".
  document.getElementById('viewerBack').addEventListener('click', closeViewer)
  document.getElementById('viewerInfo').addEventListener('click', openDetails)
  document.getElementById('viewerView').addEventListener('click', openInTelegram)
  document.getElementById('viewerMove').addEventListener('click', () => {
    const item = items[currentIndex]
    if (item) openMoveSheet([item.id])
  })
  document.getElementById('viewerDelete').addEventListener('click', () => {
    const item = items[currentIndex]
    if (item) askDelete(item)
  })
  document.getElementById('detailsClose').addEventListener('click', closeDetails)
  document.getElementById('detailsBackdrop').addEventListener('click', closeDetails)

  // Salta a la foto en Telegram. Para fotos de un grupo o canal, el
  // enlace directo al mensaje sí existe: t.me/c/<id>/<message_id>,
  // donde <id> es el chat_id sin el -100 inicial. Para fotos del chat
  // privado con el bot no hay enlace al mensaje (t.me/c/ solo vale
  // para grupos/canales), así que se abre el chat del bot.
  function telegramLinkFor(item) {
    if (item.chatId < 0) {
      const shortId = String(item.chatId).replace(/^-100/, '')
      return 'https://t.me/c/' + shortId + '/' + item.messageId
    }
    return 'https://t.me/' + BOT_USERNAME
  }

  function openInTelegram() {
    const item = items[currentIndex]
    if (!item) return
    const url = telegramLinkFor(item)
    if (tg && tg.openTelegramLink) tg.openTelegramLink(url)
    else if (tg && tg.openLink) tg.openLink(url)
    else window.open(url, '_blank')
  }

  function showAlert(msg) {
    if (tg && tg.showAlert) tg.showAlert(msg)
    else alert(msg)
  }

  function confirmDelete() {
    return new Promise((resolve) => {
      const msg = '¿Eliminar esta foto? Se borrará de la galería y del chat con el bot.'
      if (tg && tg.showConfirm) tg.showConfirm(msg, (ok) => resolve(ok))
      else resolve(window.confirm(msg))
    })
  }

  // Selección múltiple, estilo Google Fotos: "Seleccionar" en la barra
  // superior, tocar fotos para marcarlas y borrarlas todas de una vez.
  function setSelectMode(on) {
    selectMode = on
    if (!on) selected.clear()
    grid.classList.toggle('selecting', on)
    document.body.classList.toggle('selecting', on)
    selectBar.hidden = !on
    selectAllBtn.hidden = !on
    if (!on) selectAllBtn.disabled = false
    selectModeBtn.textContent = on ? 'Listo' : 'Seleccionar'
    updateSelectBar()
    if (on) haptic('selectionChanged')
  }

  function updateSelectBar() {
    const n = selected.size
    selectCount.textContent = n + (n === 1 ? ' seleccionada' : ' seleccionadas')
    selectMoveBtn.disabled = n === 0
    selectDeleteBtn.disabled = n === 0
    // Si ya están todas las de la vista, el botón ofrece quitarlas.
    selectAllBtn.textContent = (total > 0 && n >= total) ? 'Ninguno' : 'Todo'
    grid.querySelectorAll('.card').forEach((cardEl) => {
      const id = Number(cardEl.dataset.id)
      cardEl.classList.toggle('selected', selected.has(id))
    })
  }

  // Seleccionar todo: todas las fotos de la vista actual (búsqueda y
  // carpeta), no solo las 60 cargadas en la cuadrícula. Si ya están
  // todas, las quita. Trae los ids página por página.
  let selectingAll = false
  async function toggleSelectAll() {
    if (selectingAll || total === 0) return
    if (selectAllBtn.textContent === 'Ninguno') {
      selected.clear()
      updateSelectBar()
      return
    }
    selectingAll = true
    selectAllBtn.disabled = true
    selectAllBtn.textContent = '…'
    try {
      let off = 0
      while (true) {
        const input = { q, limit: 100, offset: off }
        if (view.name === 'photos' && view.albumId !== null) input.albumId = view.albumId
        const res = await call('listItems', input)
        res.items.forEach((it) => selected.add(it.id))
        off += res.items.length
        if (off >= (res.total || 0) || res.items.length === 0) break
      }
      updateSelectBar()
    } catch (e) {
      showAlert('No se pudieron seleccionar todas: ' + (e && e.message ? e.message : e))
    } finally {
      selectingAll = false
      selectAllBtn.disabled = false
    }
  }

  function toggleSelect(item) {
    if (selected.has(item.id)) selected.delete(item.id)
    else selected.add(item.id)
    haptic('selectionChanged')
    updateSelectBar()
  }

  async function deleteSelected() {
    const n = selected.size
    if (n === 0) return
    const msg = '¿Eliminar ' + n + (n === 1 ? ' foto' : ' fotos') + '? Se borrarán de la galería y del chat.'
    const ok = await new Promise((resolve) => {
      if (tg && tg.showConfirm) tg.showConfirm(msg, (v) => resolve(v))
      else resolve(window.confirm(msg))
    })
    if (!ok) return
    // El servidor acepta 100 por llamada: borrar en tandas de 50 para
    // que nunca salga "Demasiadas imágenes a la vez", con progreso en
    // la barra. Las que no se puedan borrar se cuentan al final.
    const ids = [...selected]
    const CHUNK = 50
    let deleted = 0
    const failed = []
    selectMoveBtn.disabled = true
    selectDeleteBtn.disabled = true
    selectCancelBtn.disabled = true
    selectAllBtn.disabled = true
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        selectCount.textContent = 'Eliminando ' + Math.min(i + chunk.length, n) + ' de ' + n + '…'
        const res = await call('deleteItems', { ids: chunk })
        deleted += res.deleted.length
        failed.push(...(res.failed || []))
      }
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success')
      setSelectMode(false)
      load(true)
      if (failed.length) showAlert('Se eliminaron ' + deleted + ' de ' + n + ' fotos.')
    } catch (e) {
      setSelectMode(false)
      load(true)
      showAlert('Se eliminaron ' + deleted + ' de ' + n + ' fotos. Error: ' + (e && e.message ? e.message : e))
    }
  }

  selectModeBtn.addEventListener('click', () => setSelectMode(!selectMode))
  selectAllBtn.addEventListener('click', toggleSelectAll)
  selectMoveBtn.addEventListener('click', () => {
    if (selected.size) openMoveSheet([...selected])
  })
  selectDeleteBtn.addEventListener('click', deleteSelected)
  selectCancelBtn.addEventListener('click', () => setSelectMode(false))

  // Hoja inferior para mover fotos a una carpeta o crear una nueva.
  const moveSheetWrap = document.getElementById('moveSheetWrap')
  const moveSheetTitle = document.getElementById('moveSheetTitle')
  const moveList = document.getElementById('moveList')
  const moveCreate = document.getElementById('moveCreate')
  const moveNewName = document.getElementById('moveNewName')
  const moveCreateBtn = document.getElementById('moveCreateBtn')
  let moveIds = null

  function closeMoveSheet() {
    moveSheetWrap.hidden = true
    moveIds = null
    moveNewName.value = ''
  }

  function moveRow(label, count, onClick) {
    const btn = document.createElement('button')
    btn.className = 'sheet-row'
    btn.type = 'button'
    btn.innerHTML = '<span class="sheet-row-name">' + escapeHtml(label) + '</span>' +
      (count === null ? '' : '<span class="sheet-row-count">' + count + (count === 1 ? ' foto' : ' fotos') + '</span>')
    btn.addEventListener('click', onClick)
    return btn
  }

  async function openMoveSheet(ids) {
    moveIds = ids
    moveSheetTitle.textContent = 'Mover a carpeta'
    moveList.innerHTML = ''
    moveCreate.hidden = true
    moveSheetWrap.hidden = false
    try {
      const res = await call('listAlbums', {})
      moveList.appendChild(moveRow('Sin carpeta', null, () => chooseAlbum(null)))
      res.albums.forEach((a) => {
        moveList.appendChild(moveRow(a.name, a.count, () => chooseAlbum(a.id)))
      })
      moveList.appendChild(moveRow('Nueva carpeta…', null, () => {
        moveCreate.hidden = false
        moveNewName.focus()
      }))
    } catch (e) {
      showAlert('No se pudieron cargar las carpetas: ' + (e && e.message ? e.message : e))
      closeMoveSheet()
    }
  }

  function openCreateSheet() {
    moveIds = null
    moveSheetTitle.textContent = 'Nueva carpeta'
    moveList.innerHTML = ''
    moveCreate.hidden = false
    moveSheetWrap.hidden = false
    moveNewName.focus()
  }

  async function chooseAlbum(albumId) {
    if (!moveIds) return
    // Igual que al borrar: el servidor acepta 100 por llamada, así
    // que mover en tandas de 50 para que "Todo" + Mover tampoco falle.
    const ids = moveIds
    const CHUNK = 50
    let moved = 0
    const failed = []
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const res = await call('movePhotos', { ids: ids.slice(i, i + CHUNK), albumId })
        moved += res.moved.length
        failed.push(...(res.failed || []))
      }
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success')
      closeMoveSheet()
      if (!viewer.hidden) closeViewer()
      if (selectMode) setSelectMode(false)
      refreshCurrentView()
      if (failed.length) showAlert('Se movieron ' + moved + ' de ' + ids.length + ' fotos.')
    } catch (e) {
      showAlert('No se pudieron mover las fotos: ' + (e && e.message ? e.message : e))
    }
  }

  async function createFromSheet() {
    const name = moveNewName.value.trim()
    if (!name) {
      showAlert('Escribe un nombre para la carpeta.')
      return
    }
    try {
      const album = await call('createAlbum', { name })
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success')
      if (moveIds) {
        await call('movePhotos', { ids: moveIds, albumId: album.id })
        closeMoveSheet()
        if (!viewer.hidden) closeViewer()
        if (selectMode) setSelectMode(false)
      } else {
        closeMoveSheet()
      }
      refreshCurrentView()
    } catch (e) {
      showAlert('No se pudo crear la carpeta: ' + (e && e.message ? e.message : e))
    }
  }

  moveCreateBtn.addEventListener('click', createFromSheet)
  moveNewName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createFromSheet()
  })
  document.getElementById('moveCancel').addEventListener('click', closeMoveSheet)
  document.getElementById('moveBackdrop').addEventListener('click', closeMoveSheet)

  function refreshCurrentView() {
    if (view.name === 'albums') showAlbums()
    else load(true)
  }

  async function askDelete(item) {
    if (!await confirmDelete()) return
    try {
      await call('deleteItem', { id: item.id })
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success')
      closeViewer()
      load(true)
    } catch (e) {
      if (tg && tg.showAlert) tg.showAlert('No se pudo eliminar la foto: ' + (e && e.message ? e.message : e))
      else alert('No se pudo eliminar la foto: ' + (e && e.message ? e.message : e))
    }
  }
  const thumbCache = new Map()
  const thumbObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target
        thumbObserver.unobserve(img)
        loadThumb(img)
      }
    })
  }, { rootMargin: '200px' })

  async function loadThumb(img, attempt) {
    attempt = attempt || 0
    const id = Number(img.dataset.id)
    if (thumbCache.has(id)) {
      img.src = thumbCache.get(id)
      img.classList.add('loaded')
      return
    }
    try {
      const res = await call('getThumb', { id, size: 'thumb' })
      const url = 'data:' + res.mime + ';base64,' + res.data
      thumbCache.set(id, url)
      img.src = url
      img.classList.add('loaded')
    } catch (e) {
      // Fallo transitorio (la red, o muchas miniaturas pidiendo a la vez
      // al desplazar rápido): reintentar dos veces con espera creciente.
      // Si sigue fallando, la imagen se queda en la tarjeta para que el
      // próximo recargado de la cuadrícula lo reintente; nunca se borra
      // y se deja el cuadro vacío para siempre.
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
        return loadThumb(img, attempt + 1)
      }
    }
  }

  function call(name, input) {
    return new Promise((resolve, reject) => {
      tg.Serverless.call(name, input, (err, result) => (err ? reject(err) : resolve(result)))
    })
  }

  function fmtDate(unixSeconds) {
    return new Date(unixSeconds * 1000).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Línea de tiempo estilo Google Fotos: Hoy, Ayer, el día de la
  // semana para la última semana y el mes para lo más viejo. La clave
  // agrupa por día (últimos 7 días) o por mes (lo demás); la etiqueta
  // es lo que se ve en la cuadrícula.
  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  function groupFor(item) {
    const d = new Date(item.date * 1000)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const day = new Date(d)
    day.setHours(0, 0, 0, 0)
    const diff = Math.round((today - day) / 86400000)
    if (diff <= 0) return { key: 'day:' + day.toDateString(), label: 'Hoy' }
    if (diff === 1) return { key: 'day:' + day.toDateString(), label: 'Ayer' }
    if (diff <= 7) return { key: 'day:' + day.toDateString(), label: capitalize(d.toLocaleDateString('es', { weekday: 'long' })) }
    return { key: 'month:' + d.getFullYear() + '-' + d.getMonth(), label: capitalize(d.toLocaleDateString('es', { month: 'long', year: 'numeric' })) }
  }

  function fmtSize(bytes) {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  function card(item) {
    const el = document.createElement('button')
    el.className = 'card'
    el.dataset.id = item.id
    el.setAttribute('aria-label', 'Foto del ' + fmtDate(item.date) + (item.caption ? ': ' + item.caption : ''))
    el.innerHTML =
      '<img class="preview" data-id="' + item.id + '" alt="Foto del ' + fmtDate(item.date) + '">' +
      '<span class="check" aria-hidden="true">✓</span>'
    const img = el.querySelector('.preview')
    if (img) thumbObserver.observe(img)
    if (selected.has(item.id)) el.classList.add('selected')
    el.addEventListener('click', () => {
      if (selectMode) toggleSelect(item)
      else openViewer(item)
    })
    return el
  }

  // La vista previa completa, con memoria: las últimas 5 fotos que ya
  // se vieron no vuelven a pedirse al servidor.
  const fullCache = new Map()
  const FULL_CACHE_MAX = 5
  function cacheFull(id, url) {
    fullCache.set(id, url)
    while (fullCache.size > FULL_CACHE_MAX) fullCache.delete(fullCache.keys().next().value)
  }
  // La misma foto no se pide dos veces a la vez: el carril renderiza
  // la anterior y la siguiente al mismo tiempo que la actual.
  const fullInFlight = new Map()
  async function fetchFull(item) {
    if (fullCache.has(item.id)) return fullCache.get(item.id)
    if (fullInFlight.has(item.id)) return fullInFlight.get(item.id)
    const p = (async () => {
      const res = await call('getThumb', { id: item.id, size: 'full' })
      const url = 'data:' + res.mime + ';base64,' + res.data
      cacheFull(item.id, url)
      return url
    })()
    fullInFlight.set(item.id, p)
    try { return await p } finally { fullInFlight.delete(item.id) }
  }

  function openViewer(item) {
    const idx = items.findIndex((i) => i.id === item.id)
    showPhoto(idx >= 0 ? idx : 0)
  }

  // Visor estilo Google Fotos: la foto llena la pantalla, la interfaz
  // se esconde al tocar, zoom con doble toque y pellizco, deslizar
  // sigue el dedo, abajo para cerrar y arriba para ver los detalles.
  // Nombre de cada carpeta por id, para los detalles de la foto.
  let albumsById = {}
  // Zoom de la foto actual: escala y desplazamiento en píxeles.
  let zoom = { scale: 1, x: 0, y: 0 }
  // Interfaz del visor visible o escondida (al tocar la foto).
  let chromeHidden = false
  // Cada renderizado del carril tiene un número: las cargas lentas de
  // una foto vieja no deben pintar encima de la foto actual.
  let trackToken = 0
  // true mientras el carril está animando el cambio de foto.
  let animating = false
  // Gesto en curso sobre la foto (deslizar, pellizcar, tocar).
  let drag = null
  // Último toque, para distinguir un toque (ocultar interfaz) de un
  // doble toque (zoom).
  let lastTap = 0
  let tapTimer = null

  function currentSlideImg() {
    const slide = viewerTrack.children[1]
    return slide ? slide.querySelector('img') : null
  }

  function applyZoom(animate) {
    const img = currentSlideImg()
    if (!img) return
    img.style.transition = animate ? 'transform .18s ease-out' : ''
    img.style.transform = zoom.scale === 1
      ? ''
      : 'translate(' + zoom.x + 'px,' + zoom.y + 'px) scale(' + zoom.scale + ')'
  }

  // La foto ampliada no puede salirse del escenario: se limita el
  // desplazamiento a lo que sobra de foto por cada lado. El tamaño que
  // se ve se calcula del aspecto real de la imagen (object-fit:
  // contain la deja con bandas cuando el aspecto no coincide).
  function clampZoom() {
    const img = currentSlideImg()
    if (!img || !img.naturalWidth) return
    const stage = viewerStage.getBoundingClientRect()
    const boxW = img.clientWidth
    const boxH = img.clientHeight
    const fit = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight)
    const dispW = img.naturalWidth * fit
    const dispH = img.naturalHeight * fit
    const maxX = Math.max(0, (dispW * zoom.scale - stage.width) / 2)
    const maxY = Math.max(0, (dispH * zoom.scale - stage.height) / 2)
    zoom.x = Math.max(-maxX, Math.min(maxX, zoom.x))
    zoom.y = Math.max(-maxY, Math.min(maxY, zoom.y))
  }

  function resetZoom() {
    zoom = { scale: 1, x: 0, y: 0 }
    applyZoom(false)
  }

  // Doble toque: ampliar al 220% centrado en el punto tocado, o volver
  // a la foto entera si ya estaba ampliada.
  function toggleZoomAt(clientX, clientY) {
    const img = currentSlideImg()
    if (!img) return
    if (zoom.scale > 1) {
      resetZoom()
      applyZoom(true)
      return
    }
    const stage = viewerStage.getBoundingClientRect()
    const s = 2.2
    const px = clientX - stage.left - stage.width / 2
    const py = clientY - stage.top - stage.height / 2
    zoom.scale = s
    zoom.x = px * (1 - s)
    zoom.y = py * (1 - s)
    clampZoom()
    applyZoom(true)
  }

  function setChrome(hidden) {
    chromeHidden = hidden
    viewer.classList.toggle('chrome-hidden', hidden)
  }

  function openDetails() {
    const item = items[currentIndex]
    if (!item) return
    const albumName = item.albumId ? (albumsById[item.albumId] || 'Carpeta') : 'Sin carpeta'
    detailsTitle.textContent = item.caption || 'Detalles'
    const rows = [
      ['Fecha', fmtDate(item.date)],
      ['Tamaño', fmtSize(item.fileSize)],
      ['Dimensiones', item.width && item.height ? item.width + ' × ' + item.height : ''],
      ['Carpeta', albumName],
      ['Pie de foto', item.caption || ''],
      ['Archivo', item.fileName || ''],
    ].filter((r) => r[1])
    detailsList.innerHTML = rows.map((r) =>
      '<dt>' + escapeHtml(r[0]) + '</dt><dd>' + escapeHtml(r[1]) + '</dd>').join('')
    detailsSheet.hidden = false
  }

  function closeDetails() {
    detailsSheet.hidden = true
  }

  function updateViewerTop() {
    const item = items[currentIndex]
    if (!item) return
    viewerCaption.textContent = item.caption || 'Foto'
    viewerMeta.textContent = fmtDate(item.date) + ' · foto ' + (currentIndex + 1) + ' de ' + items.length
  }

  // Una diapositiva del carril: la miniatura borrosa mientras llega la
  // completa (como antes), y si la completa falla, el aviso en vez de
  // la foto. La barra inferior sigue ahí, así que una foto huérfana se
  // puede borrar igual.
  async function renderSlide(slide, item, token) {
    slide.innerHTML = ''
    if (!item) return
    slide.dataset.id = item.id
    const loading = document.createElement('span')
    loading.className = 'slide-loading'
    loading.textContent = 'Cargando vista previa…'
    slide.appendChild(loading)
    const img = document.createElement('img')
    img.className = 'slide-img'
    img.dataset.id = item.id
    img.alt = item.fileName || item.caption || 'Foto'
    slide.appendChild(img)
    const stillCurrent = () => token === trackToken && slide.dataset.id == item.id
    // Si la completa llega antes que la miniatura (la miniatura
    // reintenta cuando la red falla), la miniatura tardía no debe
    // volver a poner borrosa la foto ya cargada.
    let fullLoaded = false
    // Miniatura borrosa al instante si ya está en el teléfono.
    if (thumbCache.has(item.id)) {
      img.src = thumbCache.get(item.id)
      img.classList.add('loaded', 'blur')
      loading.remove()
    } else {
      loadThumb(img).then(() => {
        if (img.src && stillCurrent() && !fullLoaded) {
          img.classList.add('blur')
          loading.remove()
        }
      })
    }
    try {
      const url = await fetchFull(item)
      if (!stillCurrent()) return
      fullLoaded = true
      img.src = url
      img.classList.add('loaded')
      img.classList.remove('blur')
      loading.remove()
    } catch (e) {
      if (!stillCurrent()) return
      loading.textContent = 'No se pudo cargar la vista previa.'
      img.remove()
    }
  }

  // El carril tiene tres diapositivas: anterior, actual y siguiente.
  // La actual queda en el centro (translateX -100%).
  function renderTrack() {
    trackToken++
    const token = trackToken
    viewerTrack.classList.remove('animating')
    viewerTrack.style.transform = 'translateX(-100%)'
    viewerTrack.innerHTML = ''
    for (let off = -1; off <= 1; off++) {
      const slide = document.createElement('div')
      slide.className = 'viewer-slide'
      viewerTrack.appendChild(slide)
      renderSlide(slide, items[currentIndex + off], token)
    }
  }

  function showPhoto(index) {
    if (index < 0 || index >= items.length) return
    closeDetails()
    resetZoom()
    setChrome(false)
    currentIndex = index
    renderTrack()
    updateViewerTop()
    viewer.hidden = false
    syncBackButton()
    updateFastScroll()
  }

  // Cambio de foto con animación: el carril se desliza hasta la foto
  // vecina y luego se vuelve a centrar sin que se note.
  function animateTo(step) {
    const target = currentIndex + step
    if (animating || target < 0 || target >= items.length) return
    animating = true
    viewerTrack.classList.add('animating')
    viewerTrack.style.transform = 'translateX(' + (-100 - step * 100) + '%)'
    let done = false
    const finish = () => {
      if (done) return
      done = true
      animating = false
      viewerTrack.removeEventListener('transitionend', finish)
      showPhoto(target)
    }
    viewerTrack.addEventListener('transitionend', finish)
    setTimeout(finish, 350)
  }

  // Volver a centrar el carril (el deslizamiento no llegó a cambiar de
  // foto, o el arrastre vertical no llegó a cerrar ni a abrir detalles).
  function snapBack() {
    viewerTrack.classList.add('animating')
    viewerTrack.style.transform = 'translateX(-100%)'
    // El visor también vuelve a su sitio con animación (si el arrastre
    // era vertical, estaba desplazado y desvanecido).
    viewer.style.transition = 'transform .18s ease-out, opacity .18s ease-out'
    viewer.style.transform = ''
    viewer.style.opacity = ''
    let done = false
    const finish = () => {
      if (done) return
      done = true
      viewerTrack.classList.remove('animating')
      viewer.style.transition = ''
      viewerTrack.removeEventListener('transitionend', finish)
    }
    viewerTrack.addEventListener('transitionend', finish)
    setTimeout(finish, 350)
  }

  function navPhoto(step) {
    if (animating) return
    const target = currentIndex + step
    if (target < 0 || target >= items.length) return
    haptic('selectionChanged')
    animateTo(step)
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  // Vista de carpetas: la portada de la app. Una tarjeta por carpeta
  // (portada + nombre + contador), una para todas las fotos y una para
  // crear una carpeta nueva.
  function albumCard(name, count, coverId, onClick, isNew) {
    const el = document.createElement('button')
    el.className = 'album-card' + (isNew ? ' album-new' : '')
    el.type = 'button'
    if (isNew) {
      el.innerHTML = '<span class="album-new-label">+ Nueva carpeta</span>'
    } else {
      el.innerHTML =
        (coverId
          ? '<img class="album-cover" data-id="' + coverId + '" alt="">'
          : '<div class="album-cover-empty"><span>' + escapeHtml(name) + '</span></div>') +
        '<span class="album-meta"><span class="album-name">' + escapeHtml(name) + '</span>' +
        '<span class="album-count">' + count + (count === 1 ? ' foto' : ' fotos') + '</span></span>'
      const img = el.querySelector('.album-cover')
      if (img) thumbObserver.observe(img)
    }
    el.addEventListener('click', onClick)
    return el
  }

  // Hashtags: una pastilla por pie de foto (miniatura + texto +
  // contador). Tocar una abre las fotos que llevan ese pie.
  function tagChip(caption, count, coverId) {
    const el = document.createElement('button')
    el.className = 'tag-chip'
    el.type = 'button'
    el.innerHTML =
      (coverId
        ? '<img class="tag-thumb" data-id="' + coverId + '" alt="">'
        : '') +
      '<span class="tag-name">' + escapeHtml(caption) + '</span>' +
      '<span class="tag-count">' + count + '</span>'
    const img = el.querySelector('.tag-thumb')
    if (img) thumbObserver.observe(img)
    el.addEventListener('click', () => showPhotos(null, caption, caption))
    return el
  }

  async function loadTags() {
    tagsSection.hidden = true
    tagsList.innerHTML = ''
    try {
      const res = await call('listCaptions', {})
      if (!res.captions || !res.captions.length) return
      if (view.name !== 'albums') return
      res.captions.forEach((c) => {
        tagsList.appendChild(tagChip(c.caption, c.count, c.coverId))
      })
      tagsSection.hidden = false
    } catch (e) {}
  }

  async function showAlbums() {
    view = { name: 'albums' }
    if (selectMode) setSelectMode(false)
    q = ''
    search.value = ''
    toolbar.hidden = true
    backRow.hidden = true
    empty.hidden = true
    sentinel.hidden = true
    loadingMore.hidden = true
    tagsSection.hidden = true
    grid.classList.add('albums')
    grid.innerHTML = ''
    status.hidden = false
    status.textContent = 'Carpetas'
    syncBackButton()
    try {
      const res = await call('listAlbums', {})
      albumsById = {}
      res.albums.forEach((a) => { albumsById[a.id] = a.name })
      grid.appendChild(albumCard('Todas las fotos', res.total, res.latestId, () => showPhotos(null, 'Todas las fotos')))
      res.albums.forEach((a) => {
        grid.appendChild(albumCard(a.name, a.count, a.coverId, () => showPhotos(a.id, a.name)))
      })
      grid.appendChild(albumCard('', 0, null, openCreateSheet, true))
    } catch (e) {
      status.textContent = 'No se pudieron cargar las carpetas: ' + (e && e.message ? e.message : e)
    }
    loadTags()
    updateFastScroll()
  }

  function showPhotos(albumId, albumName, query) {
    view = { name: 'photos', albumId: albumId === undefined ? null : albumId, albumName }
    if (selectMode) setSelectMode(false)
    q = query || ''
    search.value = q
    toolbar.hidden = false
    backRow.hidden = false
    tagsSection.hidden = true
    albumTitle.textContent = albumName
    deleteAlbumBtn.hidden = view.albumId === null
    grid.classList.remove('albums')
    syncBackButton()
    load(true)
  }

  backBtn.addEventListener('click', () => showAlbums())

  deleteAlbumBtn.addEventListener('click', async () => {
    if (view.name !== 'photos' || view.albumId === null) return
    const name = view.albumName
    const ok = await new Promise((resolve) => {
      const msg = '¿Eliminar la carpeta "' + name + '"? Las fotos no se borran, vuelven a Todas las fotos.'
      if (tg && tg.showConfirm) tg.showConfirm(msg, (v) => resolve(v))
      else resolve(window.confirm(msg))
    })
    if (!ok) return
    try {
      await call('deleteAlbum', { id: view.albumId })
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success')
      showAlbums()
    } catch (e) {
      showAlert('No se pudo eliminar la carpeta: ' + (e && e.message ? e.message : e))
    }
  })

  // Scroll infinito: en lugar del botón "Cargar más", un centinela
  // invisible al final de la cuadrícula carga la siguiente página
  // sola cuando entra en pantalla (600px de margen: empieza antes de
  // llegar al final). No carga con el visor abierto ni mientras otra
  // página está cargando.
  const moreObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && view.name === 'photos' && viewer.hidden && !loading && offset < total) {
        load(false)
      }
    })
  }, { rootMargin: '600px' })
  moreObserver.observe(sentinel)

  async function load(reset) {
    if (loading && !reset) return
    loading = true
    if (reset) { offset = 0; grid.innerHTML = ''; items = []; lastGroupKey = null }
    if (reset) status.textContent = 'Cargando…'
    else loadingMore.hidden = false
    try {
      const input = { q, limit: LIMIT, offset }
      if (view.name === 'photos' && view.albumId !== null) input.albumId = view.albumId
      const res = await call('listItems', input)
      total = res.total || 0
      items = items.concat(res.items)
      res.items.forEach((item) => {
        const g = groupFor(item)
        if (g.key !== lastGroupKey) {
          lastGroupKey = g.key
          const h = document.createElement('h2')
          h.className = 'date-header'
          h.textContent = g.label
          grid.appendChild(h)
        }
        grid.appendChild(card(item))
      })
      offset += res.items.length
      if (total === 0) {
        status.hidden = true
        empty.hidden = false
      } else {
        status.hidden = false
        empty.hidden = true
        status.innerHTML = '<strong>' + total + '</strong> foto' + (total === 1 ? '' : 's') + ' guardada' + (total === 1 ? '' : 's')
      }
      // Quedan más: el centinela visible sigue cargando al desplazar;
      // si la página vino vacía, esconderlo para no pedir en bucle.
      sentinel.hidden = offset >= total || res.items.length === 0
    } catch (e) {
      status.hidden = false
      empty.hidden = true
      status.textContent = 'No se pudo cargar la galería: ' + (e && e.message ? e.message : e)
    } finally {
      loading = false
      loadingMore.hidden = true
      updateFastScroll()
    }
  }

  // Desplazamiento rápido estilo Google Fotos: una barrita en el borde
  // derecho para volar por las fotos. Al arrastrarla, la burbuja
  // muestra la fecha por la que se va pasando.
  const fastScroll = document.getElementById('fastScroll')
  const fastScrollThumb = document.getElementById('fastScrollThumb')
  const fastScrollBubble = document.getElementById('fastScrollBubble')
  let fastScrolling = false

  // Posición y tamaño de la barrita según lo que se ve y lo que hay
  // cargado. Solo en la vista de fotos, con el visor cerrado y cuando
  // hay más fotos que pantalla.
  function updateFastScroll() {
    if (view.name !== 'photos' || !viewer.hidden) {
      fastScroll.hidden = true
      fastScrollBubble.hidden = true
      return
    }
    const docH = document.documentElement.scrollHeight
    const winH = window.innerHeight
    if (docH <= winH + 50) {
      fastScroll.hidden = true
      fastScrollBubble.hidden = true
      return
    }
    fastScroll.hidden = false
    const trackH = fastScroll.clientHeight
    const thumbH = Math.max(32, (winH / docH) * trackH)
    const frac = window.scrollY / (docH - winH)
    fastScrollThumb.style.height = thumbH + 'px'
    fastScrollThumb.style.top = (frac * (trackH - thumbH)) + 'px'
  }

  // La fecha del encabezado que queda a la altura de ese scroll: es lo
  // que muestra la burbuja mientras se arrastra la barrita.
  function dateAtScroll(scrollY) {
    let label = ''
    grid.querySelectorAll('.date-header').forEach((h) => {
      if (!label) label = h.textContent
      if (h.getBoundingClientRect().top + window.scrollY <= scrollY + 80) label = h.textContent
    })
    return label
  }

  function fastScrollTo(clientY) {
    const rect = fastScroll.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    const docH = document.documentElement.scrollHeight
    const winH = window.innerHeight
    const y = frac * Math.max(0, docH - winH)
    window.scrollTo(0, y)
    const label = dateAtScroll(y)
    if (label) {
      fastScrollBubble.textContent = label
      fastScrollBubble.style.top = Math.max(rect.top + 24, Math.min(rect.bottom - 24, clientY)) + 'px'
      fastScrollBubble.hidden = false
    } else {
      fastScrollBubble.hidden = true
    }
    updateFastScroll()
  }

  fastScrollThumb.addEventListener('pointerdown', (e) => {
    fastScrolling = true
    fastScroll.classList.add('dragging')
    fastScrollThumb.setPointerCapture(e.pointerId)
    fastScrollTo(e.clientY)
    e.preventDefault()
  })
  fastScrollThumb.addEventListener('pointermove', (e) => {
    if (!fastScrolling) return
    fastScrollTo(e.clientY)
  })
  const endFastScroll = () => {
    if (!fastScrolling) return
    fastScrolling = false
    fastScroll.classList.remove('dragging')
    fastScrollBubble.hidden = true
  }
  fastScrollThumb.addEventListener('pointerup', endFastScroll)
  fastScrollThumb.addEventListener('pointercancel', endFastScroll)

  window.addEventListener('scroll', updateFastScroll, { passive: true })
  window.addEventListener('resize', updateFastScroll)

  let searchTimer = null
  search.addEventListener('input', () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => { q = search.value.trim(); load(true) }, 400)
  })
  // El arrastre vertical mueve y desvanece el visor entero para cerrar.
  // Si un pellizco lo interrumpe, ese desvanecido se quedaba pegado y
  // la foto se veía transparente para siempre: aquí se limpia.
  function clearViewerDrag() {
    viewer.style.transform = ''
    viewer.style.opacity = ''
    viewer.style.transition = ''
  }

  // Gestos sobre la foto: un dedo desliza (la foto sigue el dedo),
  // dos dedos pellizcan para ampliar, un toque esconde la interfaz y
  // un doble toque amplía. Arrastrar hacia abajo cierra el visor y
  // hacia arriba abre los detalles.
  viewerStage.addEventListener('touchstart', (e) => {
    if (animating || viewer.hidden) return
    // Si el carril estaba volviendo a su sitio, el dedo manda desde ya.
    viewerTrack.classList.remove('animating')
    const touches = e.touches
    if (touches.length === 2) {
      // Pellizco: guardar distancia, punto medio y zoom inicial.
      // Si venía de un arrastre vertical, limpiar su desvanecido.
      clearViewerDrag()
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null }
      const a = touches[0]
      const b = touches[1]
      drag = {
        type: 'pinch',
        dist0: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
        scale0: zoom.scale,
      }
      const img = currentSlideImg()
      if (img) img.style.transition = ''
      return
    }
    if (touches.length === 1) {
      const t = touches[0]
      drag = { type: 'maybe', x0: t.clientX, y0: t.clientY, t0: Date.now(), lastDx: 0, lastDy: 0 }
    }
  }, { passive: true })

  viewerStage.addEventListener('touchmove', (e) => {
    if (!drag || animating || viewer.hidden) return
    const touches = e.touches
    if (drag.type === 'pinch' && touches.length === 2) {
      const a = touches[0]
      const b = touches[1]
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
      const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
      const stage = viewerStage.getBoundingClientRect()
      // El punto bajo los dedos se queda quieto: el desplazamiento
      // nuevo es el punto medio menos el punto de la foto que había
      // debajo, escalado.
      const px = mid.x - stage.left - stage.width / 2
      const py = mid.y - stage.top - stage.height / 2
      const newScale = Math.max(1, Math.min(3, drag.scale0 * dist / drag.dist0))
      const ratio = newScale / zoom.scale
      zoom.x = px - (px - zoom.x) * ratio
      zoom.y = py - (py - zoom.y) * ratio
      zoom.scale = newScale
      clampZoom()
      applyZoom(false)
      return
    }
    if (touches.length !== 1) return
    const t = touches[0]
    const dx = t.clientX - drag.x0
    const dy = t.clientY - drag.y0
    if (drag.type === 'maybe') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null }
      if (zoom.scale > 1) drag.type = 'pan'
      else if (Math.abs(dx) > Math.abs(dy)) drag.type = 'nav'
      else drag.type = 'vertical'
    }
    if (drag.type === 'pan') {
      zoom.x += dx - drag.lastDx
      zoom.y += dy - drag.lastDy
      drag.lastDx = dx
      drag.lastDy = dy
      clampZoom()
      applyZoom(false)
    } else if (drag.type === 'nav') {
      const step = dx < 0 ? 1 : -1
      const canGo = currentIndex + step >= 0 && currentIndex + step < items.length
      const resisted = canGo ? dx : dx * 0.3
      viewerTrack.style.transform = 'translateX(calc(-100% + ' + resisted + 'px))'
    } else if (drag.type === 'vertical') {
      viewer.style.transform = 'translateY(' + dy + 'px)'
      viewer.style.opacity = dy > 0 ? String(Math.max(0.3, 1 - dy / 400)) : ''
    }
  }, { passive: true })

  function endGesture(e) {
    if (!drag) return
    const d = drag
    drag = null
    if (d.type === 'pinch') {
      clearViewerDrag()
      if (zoom.scale < 1.05) {
        zoom = { scale: 1, x: 0, y: 0 }
        applyZoom(true)
      } else {
        clampZoom()
        applyZoom(true)
      }
      return
    }
    const t = e.changedTouches[0]
    if (d.type === 'maybe') {
      // Un toque: si viene otro enseguida es doble toque (zoom),
      // si no, esconde o muestra la interfaz.
      const now = Date.now()
      if (now - lastTap < 300) {
        lastTap = 0
        toggleZoomAt(t.clientX, t.clientY)
      } else {
        lastTap = now
        tapTimer = setTimeout(() => { tapTimer = null; setChrome(!chromeHidden) }, 280)
      }
      return
    }
    const dx = t.clientX - d.x0
    const dy = t.clientY - d.y0
    const dt = Date.now() - d.t0
    if (d.type === 'pan') return
    if (d.type === 'nav') {
      const stageW = viewerStage.clientWidth
      const flick = dt < 250 && Math.abs(dx) > 50
      if (Math.abs(dx) > stageW * 0.25 || flick) {
        const step = dx < 0 ? 1 : -1
        if (currentIndex + step >= 0 && currentIndex + step < items.length) {
          haptic('selectionChanged')
          animateTo(step)
          return
        }
      }
      snapBack()
      return
    }
    if (d.type === 'vertical') {
      if (dy > 110) {
        // Cerrar con animación: la foto se va hacia abajo y se apaga.
        viewer.style.transition = 'transform .2s ease-out, opacity .2s ease-out'
        viewer.style.transform = 'translateY(100%)'
        viewer.style.opacity = '0'
        setTimeout(closeViewer, 200)
      } else if (dy < -90) {
        snapBack()
        openDetails()
      } else {
        snapBack()
      }
    }
  }
  viewerStage.addEventListener('touchend', endGesture)
  viewerStage.addEventListener('touchcancel', endGesture)

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !moveSheetWrap.hidden) {
      closeMoveSheet()
      return
    }
    if (viewer.hidden) {
      if (e.key === 'Escape' && selectMode) setSelectMode(false)
      return
    }
    if (e.key === 'ArrowRight') navPhoto(1)
    else if (e.key === 'ArrowLeft') navPhoto(-1)
    else if (e.key === 'Escape') {
      if (!detailsSheet.hidden) closeDetails()
      else if (zoom.scale > 1) resetZoom()
      else closeViewer()
    }
  })

  if (!tg) {
    status.textContent = 'Abre TeleGallery desde Telegram para ver tu galería.'
    return
  }
  tg.ready()
  tg.expand()
  showAlbums()
  loadChannels()
  // Al volver a la Mini App (venía del chat, por ejemplo), recargar la
  // vista: Telegram no avisa cuando se borra algo en el chat y la vista
  // abierta se queda con la lista vieja.
  if (tg.onEvent) {
    tg.onEvent('activated', () => { if (viewer.hidden) refreshCurrentView() })
  }
})()
