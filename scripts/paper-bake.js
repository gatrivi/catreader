/**
 * Paper Soul bake — catreader stand-in for catts `paper_bake.py`.
 * Usage: node scripts/paper-bake.js [filename...]
 * Default: README.txt + The_Cloud_of_Unknowing-Unknown.epub
 *
 * Output: public/books/paper/<safeId>/paper-manifest.json + stains/*.svg
 * ponytail: SVG stains (no sharp/webp dep); swap to webp when catts bake lands.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const booksDir = path.join(process.cwd(), 'public', 'books');
const paperRoot = path.join(booksDir, 'paper');

const DEFAULTS = ['README.txt', 'The_Cloud_of_Unknowing-Unknown.epub'];

function safeId(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96);
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(bookId) {
  return crypto.createHash('sha256').update(bookId).digest('hex');
}

function stainSvg(seed, intensity) {
  // Domain-warped-ish blob via layered radial gradients (deterministic colors from seed)
  const n = parseInt(seed.slice(0, 8), 16);
  const hue = 25 + (n % 20);
  const sat = 30 + (n % 25);
  const light = 35 + (n % 20);
  const c = `hsl(${hue} ${sat}% ${light}%)`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <radialGradient id="g" cx="45%" cy="40%" r="55%">
      <stop offset="0%" stop-color="${c}" stop-opacity="${Math.min(0.85, intensity + 0.3)}"/>
      <stop offset="55%" stop-color="${c}" stop-opacity="${intensity * 0.45}"/>
      <stop offset="100%" stop-color="${c}" stop-opacity="0"/>
    </radialGradient>
    <filter id="w">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="${n % 9999}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="18"/>
    </filter>
  </defs>
  <circle cx="128" cy="128" r="110" fill="url(#g)" filter="url(#w)"/>
</svg>`;
}

function bakeBook(bookId, estimatedPages = 40) {
  const seed = seedFrom(bookId);
  const rng = mulberry32(parseInt(seed.slice(0, 8), 16));
  const id = safeId(bookId);
  const outDir = path.join(paperRoot, id);
  const stainsDir = path.join(outDir, 'stains');
  fs.mkdirSync(stainsDir, { recursive: true });

  const k = 5 + Math.floor(rng() * 11); // 5–15
  const stains = [];
  for (let i = 0; i < k; i++) {
    const stainSeed = seed.slice(i * 2, i * 2 + 8) || seed.slice(0, 8);
    const intensity = 0.15 + rng() * 0.35;
    const file = `stain-${i}.svg`;
    fs.writeFileSync(path.join(stainsDir, file), stainSvg(stainSeed + String(i), intensity));
    stains.push({
      id: `s${i}`,
      page_center: 1 + Math.floor(rng() * Math.max(1, estimatedPages)),
      radius_pages: 1.5 + rng() * 4,
      x: 0.1 + rng() * 0.8,
      y: 0.1 + rng() * 0.8,
      r_px: 60 + Math.floor(rng() * 100),
      intensity,
      src: `/books/paper/${id}/stains/${file}`,
    });
  }

  const manifest = {
    seed,
    bookId,
    paletteTint: '#f4ead5',
    stains,
  };
  fs.writeFileSync(path.join(outDir, 'paper-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[paper-bake] ${bookId} → ${k} stains @ books/paper/${id}/`);
  return manifest;
}

const targets = process.argv.slice(2);
const list = targets.length ? targets : DEFAULTS.filter((f) => fs.existsSync(path.join(booksDir, f)));

if (!list.length) {
  console.warn('[paper-bake] No target books found. Pass filenames as args.');
  process.exit(0);
}

fs.mkdirSync(paperRoot, { recursive: true });
for (const f of list) bakeBook(f);
console.log('[paper-bake] done. Run generate-library to fold into books.json.');
