import fs from 'fs';
import path from 'path';

const dist = path.join(process.cwd(), 'dist');
const index = path.join(dist, 'index.html');
const notFound = path.join(dist, '404.html');

if (fs.existsSync(index)) {
  fs.copyFileSync(index, notFound);
  console.log('[Post Build] Copied index.html to 404.html');
} else {
  console.error('[Post Build] dist/index.html not found');
  process.exit(1);
}
