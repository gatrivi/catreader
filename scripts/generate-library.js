import fs from 'fs';
import path from 'path';

const booksDir = path.join(process.cwd(), 'public', 'books');
const outputFile = path.join(process.cwd(), 'public', 'books.json');
const generatedCoversDir = path.join(process.cwd(), 'public', 'generated-covers');

// Create the directory if it doesn't exist
if (!fs.existsSync(booksDir)) {
  fs.mkdirSync(booksDir, { recursive: true });
}

fs.rmSync(generatedCoversDir, { recursive: true, force: true });
fs.mkdirSync(generatedCoversDir, { recursive: true });

const supportedExtensions = ['.pdf', '.txt', '.epub', '.docx', '.doc'];
const files = fs.readdirSync(booksDir);

const currentBooks = fs.existsSync(outputFile)
  ? JSON.parse(fs.readFileSync(outputFile, 'utf8'))
  : [];

function paperSafeId(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96);
}

function paperManifestPath(filename) {
  const p = path.join(booksDir, 'paper', paperSafeId(filename), 'paper-manifest.json');
  return fs.existsSync(p) ? `/books/paper/${paperSafeId(filename)}/paper-manifest.json` : undefined;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function titleLines(title) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > 22 && line) {
      lines.push(line);
      line = word;
      if (lines.length === 2) break;
    } else {
      line = next;
    }
  }
  if (lines.length < 3 && line) lines.push(line);
  return lines.slice(0, 3);
}

const palettes = [
  ['#5b1238', '#a33658', '#e0a458', '#173f5f', '#f3d9a4'],
  ['#18264b', '#28527a', '#d49a40', '#7a1f3d', '#f0d6a3'],
  ['#173f35', '#2f6b52', '#c98a2e', '#6e2444', '#ead4a2'],
  ['#3f193d', '#7c2d59', '#c89b3c', '#1e4d66', '#f1ddb3'],
  ['#351b13', '#7b3f21', '#d6a23e', '#294b61', '#efd7a7'],
  ['#203244', '#315d66', '#c7933f', '#7a294d', '#eed9b1'],
];

function motifFor(title, author) {
  const text = `${title} ${author || ''}`.toLowerCase();
  if (/passion|cross|cruc|holy week|salvation/.test(text)) return 'cross';
  if (/mary|maria|rosary|glories|montfort/.test(text)) return 'rose';
  if (/office|sermon|letter|rule|conference|catech/.test(text)) return 'book';
  if (/buddha|dogen|zen|jhana|abhidhamma|meditation/.test(text)) return 'lotus';
  if (/universe|light|atomic|russell/.test(text)) return 'sun';
  if (/gurdjieff|nicoll|ouspensky/.test(text)) return 'enneagram';
  return 'window';
}

function motifSvg(motif, accent, pale) {
  if (motif === 'cross') {
    return `<g fill='none' stroke='${accent}' stroke-width='10' stroke-linecap='round'><path d='M200 145v170'/><path d='M145 205h110'/></g><circle cx='200' cy='215' r='92' fill='none' stroke='${pale}' stroke-width='4' opacity='.72'/>`;
  }
  if (motif === 'rose') {
    return `<g fill='none' stroke='${accent}' stroke-width='5'><circle cx='200' cy='215' r='84'/><circle cx='200' cy='215' r='42'/><path d='M200 131v168M116 215h168M141 156l118 118M259 156L141 274'/></g>`;
  }
  if (motif === 'book') {
    return `<g fill='none' stroke='${accent}' stroke-width='6' stroke-linejoin='round'><path d='M112 160q48-18 88 14v132q-40-28-88-10z'/><path d='M288 160q-48-18-88 14v132q40-28 88-10z'/><path d='M200 174v132'/></g>`;
  }
  if (motif === 'lotus') {
    return `<g fill='none' stroke='${accent}' stroke-width='5'><path d='M200 290q-58-48 0-125q58 77 0 125z'/><path d='M198 286q-78-18-72-91q67 14 72 91z'/><path d='M202 286q78-18 72-91q-67 14-72 91z'/><path d='M138 300q62 22 124 0'/></g>`;
  }
  if (motif === 'sun') {
    return `<g fill='none' stroke='${accent}' stroke-width='5'><circle cx='200' cy='215' r='62'/><circle cx='200' cy='215' r='18' fill='${accent}'/><path d='M200 118v38M200 274v38M103 215h38M259 215h38M132 147l27 27M241 256l27 27M268 147l-27 27M159 256l-27 27'/></g>`;
  }
  if (motif === 'enneagram') {
    return `<g fill='none' stroke='${accent}' stroke-width='4'><circle cx='200' cy='215' r='88'/><path d='M200 127l76 132H124z'/><path d='M200 127l-28 171l104-39l-152 0l104 39z'/></g>`;
  }
  return `<g fill='none' stroke='${accent}' stroke-width='5'><path d='M118 305V202a82 82 0 01164 0v103z'/><circle cx='200' cy='214' r='48'/><path d='M200 166v96M152 214h96M166 180l68 68M234 180l-68 68'/></g>`;
}

function createStainedGlassCover(title, author, filename) {
  const seed = hashString(`${filename}|${title}|${author || ''}`);
  const palette = palettes[seed % palettes.length];
  const [deep, jewel, gold, blue, pale] = palette;
  const motif = motifFor(title, author);
  const lines = titleLines(title || filename.replace(/\.[^/.]+$/, ''));

  const panes = Array.from({ length: 18 }, (_, index) => {
    const local = hashString(`${seed}:${index}`);
    const x = (local % 330) + 35;
    const y = ((local >>> 8) % 500) + 35;
    const r = ((local >>> 16) % 46) + 20;
    const fill = palette[(local >>> 24) % palette.length];
    const opacity = 0.12 + ((local % 35) / 100);
    return `<circle cx='${x}' cy='${y}' r='${r}' fill='${fill}' opacity='${opacity.toFixed(2)}'/>`;
  }).join('');

  const titleText = lines.map((line, index) => (
    `<text x='200' y='${380 + index * 34}' text-anchor='middle' font-family='Georgia,serif' font-size='${index === 0 ? 27 : 23}' font-weight='700' fill='${pale}' letter-spacing='.7'>${escapeXml(line)}</text>`
  )).join('');

  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 600'>
  <defs>
    <linearGradient id='bg-${seed}' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${deep}'/><stop offset='.52' stop-color='${jewel}'/><stop offset='1' stop-color='${blue}'/>
    </linearGradient>
    <radialGradient id='glow-${seed}' cx='50%' cy='35%' r='55%'>
      <stop offset='0' stop-color='${gold}' stop-opacity='.5'/><stop offset='1' stop-color='${gold}' stop-opacity='0'/>
    </radialGradient>
  </defs>
  <rect width='400' height='600' fill='url(#bg-${seed})'/>
  ${panes}
  <rect width='400' height='600' fill='url(#glow-${seed})'/>
  <g stroke='#1a1315' stroke-width='7' opacity='.9'>
    <path d='M0 96h400M0 328h400M72 0v600M328 0v600'/>
    <path d='M0 0l400 600M400 0L0 600' opacity='.38'/>
  </g>
  <rect x='18' y='18' width='364' height='564' rx='8' fill='none' stroke='${gold}' stroke-width='5'/>
  <rect x='29' y='29' width='342' height='542' rx='5' fill='none' stroke='#171114' stroke-width='4'/>
  ${motifSvg(motif, gold, pale)}
  <rect x='52' y='346' width='296' height='142' rx='10' fill='#120d12' opacity='.73' stroke='${gold}' stroke-width='2'/>
  ${titleText}
  <text x='200' y='530' text-anchor='middle' font-family='Georgia,serif' font-size='14' fill='${pale}' opacity='.92' letter-spacing='2'>${escapeXml(author || 'CATREADER')}</text>
</svg>`;
}

function writeGeneratedCover(title, author, filename) {
  const seed = hashString(`${filename}|${title}|${author || ''}`);
  const basename = paperSafeId(filename.replace(/\.[^/.]+$/, '')).slice(0, 72) || 'book';
  const coverFilename = `${basename}-${seed.toString(16)}.svg`;
  fs.writeFileSync(
    path.join(generatedCoversDir, coverFilename),
    createStainedGlassCover(title, author, filename),
    'utf8',
  );
  return `/generated-covers/${coverFilename}`;
}

const usedCoverUrls = new Set();
let generatedCoverCount = 0;
let duplicateCoverCount = 0;

const books = files
  .filter(file => supportedExtensions.some(ext => file.toLowerCase().endsWith(ext)))
  .map(file => {
    const ext = path.extname(file);
    const existing = currentBooks.find(b => b.filename === file);
    const paper = paperManifestPath(file);
    const title = existing?.title || file.replace(ext, '');
    const author = existing?.author;
    const source = existing?.coverSource;
    const sourceUrl = typeof source?.url === 'string' && source.url.trim() ? source.url.trim() : '';
    const repeatedSource = !!sourceUrl && usedCoverUrls.has(sourceUrl);

    if (sourceUrl && !repeatedSource) usedCoverUrls.add(sourceUrl);
    if (repeatedSource) duplicateCoverCount += 1;

    let coverSource = sourceUrl && !repeatedSource ? source : undefined;
    if (!coverSource) {
      const url = writeGeneratedCover(title, author, file);
      generatedCoverCount += 1;
      // Compatibility note: runtime currently treats `wikimedia` as canonical
      // catalogue artwork. Attribution keeps the actual provenance explicit.
      coverSource = {
        type: 'wikimedia',
        url,
        attribution: 'CatReader generated stained-glass artwork (bundled).',
        updatedAt: 1,
      };
    }

    return {
      id: file,
      filename: file,
      type: ext.substring(1).toLowerCase(),
      title,
      author,
      ...(existing?.audio ? { audio: existing.audio } : {}),
      ...(existing?.cattsBookId ? { cattsBookId: existing.cattsBookId } : {}),
      ...(coverSource ? { coverSource } : {}),
      ...(paper ? { paper } : {})
    };
  });

fs.writeFileSync(outputFile, JSON.stringify(books, null, 2));
console.log(`[Library Generator] Generated books.json with ${books.length} books.`);
console.log(`[Library Generator] Stained-glass covers: ${generatedCoverCount}; repeated catalogue covers replaced: ${duplicateCoverCount}.`);
