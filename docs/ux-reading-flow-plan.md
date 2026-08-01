# CatReader — plan UX: entrar y leer

Fecha: 2026-08-01  
Referencia: `main` / `17a5835`  
Alcance: recorrido desde la entrada hasta la primera página legible.

## Verificación actual

El punto 1 no puede considerarse resuelto en el estado publicado de `main`.

- `src/hooks/useLibrary.ts` mantiene `isLoadingLibrary=true` mientras recorre las portadas.
- La hidratación usa un `for...of` secuencial y espera IndexedDB, red y escrituras locales.
- `setLibrary(...)` ocurre recién después de esa hidratación.
- `LibraryView` muestra únicamente el spinner mientras `isLoading` sea verdadero.
- Una portada remota o una operación de IndexedDB lenta todavía puede retrasar la biblioteca.
- El bundle de producción actual pre-carga PDF.js y todos los vendors: aproximadamente 2,4 MB raw / 699 KiB gzip de JavaScript.

Chequeos del estado local:

- `npm test`: 21 archivos, 101 tests — pasa.
- `npm run lint`: `tsc --noEmit` — pasa.
- `npm run build`: pasa.
- El build advierte un ciclo entre chunks `vendor` y `vendor-react`.

La solución previamente descrita —pintar primero y cargar portadas, Firebase, Gemini, PDF.js y Drive bajo demanda— no está presente en `main`. Puede haber existido en una copia local no publicada.

## Objetivo UX

El usuario debe poder:

1. Ver una biblioteca utilizable aunque las portadas, la nube o IndexedDB estén lentas.
2. Tocar un libro y recibir feedback inmediato.
3. Llegar a una página, texto o error explicativo; nunca una pantalla vacía indefinida.
4. Volver con Atrás a la vista anterior sin perder contexto.
5. Usar el flujo en móvil sin scroll horizontal ni controles tapando el texto.

## Plan por etapas

### P0 — Biblioteca primero

Separar el estado `library shell ready` del estado `covers hydrated`.

- Parsear `books.json` y publicar títulos, autores y slots inmediatamente.
- Pintar una portada placeholder estable cuando aún no exista portada.
- Ejecutar hidratación de portadas después del primer render.
- Usar una cola limitada y `Promise.allSettled`; ninguna portada individual debe bloquear las demás.
- Poner timeout y fallback para portadas remotas, custom covers y operaciones de IndexedDB.
- Mantener Firebase, Gemini y enriquecimiento como tareas posteriores.
- No guardar metadata de todos los libros antes de mostrar la biblioteca.
- Evaluar `import()` para PDF.js, Gemini, Drive y paneles no necesarios en la entrada.
- Revisar `modulepreload`: el lector no debería descargar PDF.js para mostrar el estante.

Criterio de cierre:

- La biblioteca muestra libros aunque una portada nunca responda.
- No existe spinner infinito por una portada.
- Un primer render de biblioteca no depende de Firebase, Gemini, Drive ni PDF.js.
- El número de libros visible no cambia por un fallo de metadata; solo mejora progresivamente.

### P1 — Apertura del libro

Convertir la apertura en estados explícitos y cancelables:

`idle → opening → reader-shell → content-ready | error`.

- Mostrar `Abriendo…` en el shell del lector mientras llega el blob.
- Resolver contenido desde IndexedDB primero; descargar solo si no hay cache válida.
- Deduplicar aperturas del mismo archivo.
- Cancelar o invalidar la apertura anterior al tocar otro libro o volver atrás.
- Mantener progreso local y descarga del libro en paralelo, sin hacer que la nube bloquee el lector.
- No crear ni revocar URLs de objeto de una solicitud que ya quedó obsoleta.
- Deshabilitar el doble toque solo durante la transición real, sin bloquear el primer toque.

Criterio de cierre:

- El usuario ve feedback inmediato al tocar.
- Dos toques rápidos no abren dos libros ni dejan el estado mezclado.
- Atrás cancela una apertura pendiente y devuelve a la vista anterior.
- Un blob ausente, vacío o con HTTP inválido termina en un error accionable.

Nota: el working tree actual ya contiene parte de esta dirección (`getBookBlob`, deduplicación y `openRequestRef`) dentro del trabajo de Descubrir. Debe revisarse y conservarse, pero no se incluye en este plan como cambio publicado.

### P1 — Lector visible

Eliminar estados visualmente vacíos durante la carga de PDF/EPUB/TXT.

- Dar contenido a `Document.loading`; no usar `null`.
- Mostrar loader con título del libro y acción para volver.
- Tratar `numPages=0` como `loading`, no como una página vacía válida.
- Conectar `onLoadSuccess`, `onLoadError` y error de render de página a estados visibles.
- Hacer visible la restauración de posición solo cuando realmente esté restaurando.
- Liberar el overlay al llegar a la página objetivo o al vencer un timeout controlado.
- Diferenciar PDF, EPUB y TXT: cada formato necesita su propio estado de contenido listo.
- Para EPUB corrupto o sin capítulos legibles, mostrar error y acciones, no un viewer vacío.

Criterio de cierre:

- Siempre se ve una de estas tres cosas: loader, contenido o error explicativo.
- Un PDF lento no parece roto.
- Un libro corrupto se puede cerrar y abrir otro sin recargar toda la aplicación.

### P1 — Layout móvil y barra inferior

- Medir el contenedor disponible con `ResizeObserver`.
- Calcular el ancho de página como el mínimo entre el ancho disponible y el máximo elegido.
- Evitar que `width={800}` provoque overflow horizontal en pantallas de 360–390 px.
- Reservar `padding-bottom` para la botonera y `env(safe-area-inset-bottom)`.
- Verificar que la última página y el final del texto puedan quedar completamente por encima de la botonera.
- Mantener controles accesibles aunque el header se oculte.

Criterio de cierre:

- No hay scroll horizontal en 360×800 ni 390×844.
- La última línea/página no queda debajo de controles fijos.
- Atrás, biblioteca y cierre siguen siendo alcanzables con una mano.

### P1 — Errores y contingencias

Reemplazar fallos ambiguos por estados recuperables:

- `books.json` ausente o inválido: mostrar “No se pudo cargar la biblioteca”, reintentar y diagnóstico básico; no mostrar “Biblioteca vacía”.
- Portada fallida: placeholder y reintento individual; no bloquear el estante.
- Libro no encontrado: explicar que el archivo ya no está disponible y volver a biblioteca.
- PDF/EPUB/TXT inválido: indicar formato/archivo, ofrecer volver y reintentar.
- Error de red durante apertura: conservar la biblioteca y permitir otro libro.
- Timeout de restauración: abrir desde el inicio o conservar la posición local conocida, con aviso breve.
- Errores no controlados: añadir una frontera de error por lector para que no caiga toda la app.

### P2 — Navegación y contrato de regreso

Probar como una máquina de estados, no solo como botones aislados:

1. Biblioteca → libro → Atrás → biblioteca.
2. Feed → fragmento → libro → Atrás → feed en la misma posición.
3. Enlace directo → libro → Atrás → biblioteca.
4. Archivo local → lector → Atrás → biblioteca, sin dejar una URL imposible.
5. Apertura pendiente → Atrás → no reaparece el libro cancelado.

El historial debe tener una única fuente de verdad: la URL y el estado de navegación, no combinaciones accidentales de `fileUrl`, `fileName` y `history.length`.

## Validación

### Tests automatizados

- Biblioteca: publica el shell antes de terminar portadas.
- Biblioteca: portada que nunca responde no deja `isLoading` bloqueado.
- Apertura: cache hit, cache miss, blob vacío, HTTP 404 y doble apertura.
- Cancelación: Atrás invalida la solicitud pendiente.
- Lector: loading, success, error y `numPages=0`.
- Layout: ancho móvil y padding inferior seguro.
- Rutas: biblioteca, feed, deep link, archivo local y regreso.

### Smoke E2E

Ejecutar en 360×800 y 390×844, con:

- red normal;
- red lenta;
- portada remota que no responde;
- IndexedDB demorado;
- libro PDF grande;
- EPUB válido y EPUB corrupto;
- doble toque;
- recarga durante la apertura;
- Atrás desde cada vista.

Registrar consola, requests fallidas, tiempo hasta biblioteca visible y tiempo hasta shell/contenido/error del lector.

## Orden de implementación

1. Separar `library shell` de hidratación de portadas.
2. Lazy-load de dependencias pesadas y eliminar preloads innecesarios.
3. Consolidar apertura cancelable y feedback inmediato.
4. Hacer explícitos los estados del lector.
5. Corregir ancho, padding inferior y safe areas.
6. Añadir errores recuperables.
7. Completar pruebas E2E y repetir con build de producción.

## Fuera de alcance

Este documento no modifica ni evalúa la funcionalidad de Descubrir, actualizaciones PWA, audio, generación de portadas o sincronización completa. Se preservan como trabajo separado para no mezclar regresiones con la ruta básica de lectura.

