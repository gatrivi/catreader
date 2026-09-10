export const APP_VERSION = 'v2.10.23';

export const RELEASE_NOTES_SEEN_KEY = `catreader_release_notes_seen_${APP_VERSION}`;

export const RELEASE_NOTES = [
  'Almacenamiento persistente: pedimos al navegador que no borre tus libros y portadas descargados.',
  'Fijá libros (pin): un libro fijado nunca se borra del dispositivo, y el pin se sincroniza.',
  'Insignias de caché en la biblioteca: check verde = en el dispositivo, flecha = se descarga al abrir.',
  'Miniaturas de portadas guardadas localmente: la biblioteca no vuelve a tocar la red tras la primera carga.',
  'PDFs: una sola descarga con progreso (antes: decenas de pedidos de 64KB → apertura de ~20s).',
  'La descarga queda en cache: segundas aperturas al instante.',
  'Sin descarga duplicada en segundo plano mientras leés.',
  'PDFs por demanda: sin esperar la descarga completa ni recorrer todo el libro.',
  'Menos paginas simultaneas y un solo runtime PDF para reducir memoria y carga.',
  'Modo lector conserva la pagina al abrir y cancela trabajo de libros anteriores.',
  'Portadas disponibles visibles desde el inicio; busquedas con limite de espera.',
  'El PDF original vuelve a usar el worker recomendado por React-PDF.',
  'Firebase ya no inventa usuarios guest cuando Auth tarda o la red falla.',
  'El sync cloud corta rápido si Firebase está offline y CatReader sigue local-first.',
  'Descubrir usa grain + manchas + tinta Paper Soul (fallback si no hay bake).',
  'Descubrir Paper Soul mas oscuro: pergamino envejecido, mas grano.',
  'Descubrir mezcla libros para no saturar con un solo título.',
  'Audio en vivo limpia títulos/autores repetidos del PDF antes de TTS.',
  'Descubrir usa Paper Soul y permite copiar arte + párrafo para compartir.',
  'Los fragmentos solo abren el libro desde el botón Abrir.',
  'Tu página, zoom y tema siguen protegidos al actualizar.',
];
