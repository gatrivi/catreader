import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const fail = (message) => {
  console.error(`[critical-smoke] FAIL: ${message}`);
  process.exitCode = 1;
};
const pass = (message) => console.log(`[critical-smoke] PASS: ${message}`);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  fail('dist/index.html missing');
} else {
  pass('index.html exists');
}

const booksPath = path.join(dist, 'books.json');
let books = [];
if (!fs.existsSync(booksPath)) {
  fail('dist/books.json missing');
} else {
  books = readJson(booksPath);
  if (!Array.isArray(books) || books.length === 0) fail('books.json empty/invalid');
  else pass(`${books.length} books in production manifest`);
}

if (books.length) {
  const missingAssets = books.filter((book) => {
    const file = path.join(dist, 'books', book.filename);
    return !fs.existsSync(file) || fs.statSync(file).size === 0;
  });
  if (missingAssets.length) {
    fail(`${missingAssets.length} manifest books missing from dist/books: ${missingAssets.slice(0, 8).map((book) => book.filename).join(', ')}`);
  } else {
    pass(`all ${books.length} manifest book assets exist and are non-empty`);
  }

  const realSources = new Set(['openlibrary', 'google-books', 'wikimedia']);
  const realCovers = books.filter((book) => realSources.has(book.coverSource?.type) && /^https?:\/\//.test(book.coverSource?.url || ''));
  const minRealCovers = Math.min(5, books.length);
  if (realCovers.length < minRealCovers) {
    fail(`real cover sources collapsed: ${realCovers.length} found, expected at least ${minRealCovers}`);
  } else {
    const bySource = realCovers.reduce((acc, book) => {
      const source = book.coverSource.type;
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});
    pass(`${realCovers.length} real covers preserved in built books.json ${JSON.stringify(bySource)}`);
  }
}

const feedPath = path.join(dist, 'feed.json');
if (!fs.existsSync(feedPath)) {
  fail('dist/feed.json missing');
} else {
  const feed = readJson(feedPath);
  const items = Array.isArray(feed.items) ? feed.items : [];
  if (!items.length) {
    fail('Discover feed has no items');
  } else {
    const filenames = new Set(books.map((book) => book.filename));
    const orphaned = items.filter((item) => !item.filename || !filenames.has(item.filename));
    const empty = items.filter((item) => typeof item.text !== 'string' || item.text.trim().length < 10);
    if (orphaned.length) fail(`${orphaned.length} Discover items reference unknown books`);
    if (empty.length) fail(`${empty.length} Discover items have empty/tiny text`);
    if (!orphaned.length && !empty.length) pass(`${items.length} Discover fragments reference valid books`);
  }
}

const manifestCandidates = ['manifest.webmanifest', 'manifest.json'];
if (!manifestCandidates.some((name) => fs.existsSync(path.join(dist, name)))) {
  fail('PWA manifest missing from dist');
} else {
  pass('PWA manifest exists');
}

const assetsDir = path.join(dist, 'assets');
if (fs.existsSync(assetsDir)) {
  const jsFiles = fs.readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
  const bundleText = jsFiles.map((name) => fs.readFileSync(path.join(assetsDir, name), 'utf8')).join('\n');
  if (/unpkg\.com\/pdfjs|cdn\.jsdelivr\.net\/.*pdfjs/i.test(bundleText)) {
    fail('production JS still references a remote PDF.js worker/CDN');
  } else {
    pass('PDF.js runtime is not pinned to a remote CDN');
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log('[critical-smoke] ALL CRITICAL ARTIFACT CHECKS PASSED');
