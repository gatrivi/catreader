export const APP_VERSION = 'v2.10.21';

export const RELEASE_NOTES_SEEN_KEY = `catreader_release_notes_seen_${APP_VERSION}`;

export const RELEASE_NOTES = [
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
