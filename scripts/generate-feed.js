import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { strFromU8, unzipSync } from 'fflate';

const root = process.cwd();
const booksDir = path.join(root, 'public', 'books');
const booksFile = path.join(root, 'public', 'books.json');
const feedFile = path.join(root, 'public', 'feed.json');

const MAX_ITEMS_PER_BOOK = 48;
const MAX_PASSAGE_CHARS = 860;
const MIN_PASSAGE_WORDS = 18;

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1] || '';
}

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&(nbsp|amp|quot|apos|lt|gt);/gi, (_, entity) => ({
      nbsp: ' ',
      amp: '&',
      quot: '"',
      apos: "'",
      lt: '<',
      gt: '>',
    })[entity.toLowerCase()] || _);
}

function stripMarkup(value) {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(value) {
  return value.split(/\s+/).filter(Boolean).length;
}

function splitPassage(value) {
  const text = value.trim();
  if (text.length <= MAX_PASSAGE_CHARS) return [text];

  const chunks = [];
  let rest = text;
  while (rest.length > MAX_PASSAGE_CHARS) {
    const window = rest.slice(0, MAX_PASSAGE_CHARS);
    const matches = [...window.matchAll(/[.!?]["'”»)]?\s/g)];
    const boundary = matches.at(-1)?.index;
    const cut = boundary != null && boundary > MAX_PASSAGE_CHARS * 0.45
      ? boundary + 1
      : window.lastIndexOf(' ');
    if (cut < 1) break;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function isReadablePassage(value) {
  const text = value.trim();
  const lower = text.toLowerCase();
  if (/https?:\/\/|www\./i.test(text)) return false;
  if (/^(?:about|title|url|author|publication|copyright)\b/i.test(text)) return false;
  if (/(?:\.\s*){3,}/.test(text)) return false;
  if (/table of contents|contents page/i.test(lower) && text.length < 1400) return false;
  return true;
}

function makeCandidates(text, locator) {
  return splitPassage(stripMarkup(text))
    .filter((passage) => wordCount(passage) >= MIN_PASSAGE_WORDS && isReadablePassage(passage))
    .map((text) => ({ text, locator }));
}

function joinPdfLine(parts) {
  let line = '';
  for (const part of parts) {
    const value = part.trim();
    if (!value) continue;
    if (!line) {
      line = value;
    } else if (/^[,.;:!?%\])}]/.test(value)) {
      line += value;
    } else if (/[—–-]$/.test(line)) {
      line += value;
    } else {
      line += ` ${value}`;
    }
  }
  return line;
}

async function extractPdf(filename) {
  const data = new Uint8Array(fs.readFileSync(path.join(booksDir, filename)));
  const pdf = await pdfjs.getDocument({
    data,
    disableWorker: true,
    useSystemFonts: true,
  }).promise;
  const candidates = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    try {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const rows = [];

      for (const item of content.items) {
        if (!('str' in item) || !item.str?.trim()) continue;
        const x = item.transform?.[4] || 0;
        const y = item.transform?.[5] || 0;
        let row = rows.find((candidate) => Math.abs(candidate.y - y) < 2.5);
        if (!row) {
          row = { y, parts: [] };
          rows.push(row);
        }
        row.parts.push({ x, text: item.str });
      }

      rows.sort((a, b) => b.y - a.y);
      const pageText = rows
        .sort((a, b) => b.y - a.y)
        .map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text))
        .map(joinPdfLine)
        .filter(Boolean)
        .join(' ');

      candidates.push(...makeCandidates(pageText, {
        kind: 'pdf',
        page: pageNumber,
        label: `p. ${pageNumber}`,
      }));
    } catch (error) {
      console.warn(`[Feed] PDF page ${pageNumber} skipped in ${filename}:`, error.message);
    }
  }

  return candidates;
}

function resolveZipPath(base, href) {
  const cleanHref = decodeURIComponent((href || '').split('#')[0]);
  return path.posix.normalize(path.posix.join(path.posix.dirname(base), cleanHref));
}

function epubSpine(zip, opfPath, opfText) {
  const manifest = {};
  for (const match of opfText.matchAll(/<item\b[^>]*>/gi)) {
    const tag = match[0];
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    const mediaType = attr(tag, 'media-type');
    if (id && href && /xhtml|html/i.test(mediaType)) manifest[id] = href;
  }

  const spine = [];
  for (const match of opfText.matchAll(/<itemref\b[^>]*>/gi)) {
    const idref = attr(match[0], 'idref');
    if (idref && manifest[idref]) spine.push(manifest[idref]);
  }
  return spine.length ? spine : Object.values(manifest);
}

function extractEpubBlocks(html) {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');
  const blocks = [];

  for (const match of withoutNoise.matchAll(/<(p|blockquote|li|h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const openingTag = match[0].slice(0, match[0].indexOf('>') + 1);
    blocks.push({
      text: match[3],
      id: attr(openingTag, 'id') || attr(openingTag, 'xml:id'),
      heading: /^h[1-6]$/i.test(match[1]),
    });
  }

  if (blocks.length) return blocks;
  return [{ text: withoutNoise, id: '', heading: false }];
}

async function extractEpub(filename) {
  const zip = unzipSync(new Uint8Array(fs.readFileSync(path.join(booksDir, filename))));
  const containerPath = 'META-INF/container.xml';
  const containerText = zip[containerPath] ? strFromU8(zip[containerPath]) : '';
  const containerMatch = containerText.match(/<rootfile\b[^>]*>/i);
  const opfPath = attr(containerMatch?.[0] || '', 'full-path') || Object.keys(zip).find((key) => key.endsWith('.opf'));
  if (!opfPath || !zip[opfPath]) return [];

  const opfText = strFromU8(zip[opfPath]);
  const spine = epubSpine(zip, opfPath, opfText);
  const candidates = [];

  for (const href of spine) {
    const zipPath = resolveZipPath(opfPath, href);
    if (!zip[zipPath]) continue;
    const blocks = extractEpubBlocks(strFromU8(zip[zipPath]));
    const heading = blocks.find((block) => block.heading);
    const chapterLabel = stripMarkup(heading?.text || '') || path.basename(href, path.extname(href));
    let paragraphIndex = 0;

    for (const block of blocks) {
      const text = stripMarkup(block.text);
      if (wordCount(text) < MIN_PASSAGE_WORDS) continue;
      paragraphIndex += 1;
      const location = {
        kind: 'epub',
        href: block.id ? `${href}#${block.id}` : href,
        label: chapterLabel,
        paragraph: paragraphIndex,
      };
      candidates.push(...makeCandidates(text, location));
    }
  }

  return candidates;
}

function extractTxt(filename) {
  const raw = fs.readFileSync(path.join(booksDir, filename), 'utf8');
  const candidates = [];
  const blocks = [];
  let start = 0;
  for (const separator of raw.matchAll(/\n\s*\n/g)) {
    const end = separator.index || 0;
    const text = raw.slice(start, end).trim();
    if (text) blocks.push({ text, offset: start });
    start = end + separator[0].length;
  }
  const tail = raw.slice(start).trim();
  if (tail) blocks.push({ text: tail, offset: start });

  if (blocks.length < 3) {
    return makeCandidates(raw, {
      kind: 'txt',
      offset: 0,
      sourceLength: raw.length,
      label: 'texto',
    });
  }

  blocks.forEach((block, index) => {
    const text = block.text;
    const offset = block.offset;
    candidates.push(...makeCandidates(text, {
      kind: 'txt',
      offset,
      sourceLength: raw.length,
      label: `fragmento ${index + 1}`,
    }));
  });
  return candidates;
}

function sourceSignature(books) {
  return books
    .map((book) => {
      const file = path.join(booksDir, book.filename);
      const stat = fs.statSync(file);
      return `${book.filename}:${stat.size}:${stat.mtimeMs}`;
    })
    .sort()
    .join('|');
}

function sampleCandidates(candidates) {
  if (candidates.length <= MAX_ITEMS_PER_BOOK) return candidates;
  const step = candidates.length / MAX_ITEMS_PER_BOOK;
  return Array.from({ length: MAX_ITEMS_PER_BOOK }, (_, index) => candidates[Math.floor(index * step)]);
}

async function main() {
  const books = JSON.parse(fs.readFileSync(booksFile, 'utf8'))
    .filter((book) => ['pdf', 'epub', 'txt'].includes(book.type))
    .filter((book) => fs.existsSync(path.join(booksDir, book.filename)));
  const signature = sourceSignature(books);

  if (!process.argv.includes('--force') && fs.existsSync(feedFile)) {
    try {
      const previous = JSON.parse(fs.readFileSync(feedFile, 'utf8'));
      if (previous.sourceSignature === signature && previous.items?.length) {
        console.log(`[Feed] Up to date: ${previous.items.length} passages.`);
        return;
      }
    } catch {
      // Rebuild malformed or old feed files.
    }
  }

  const items = [];
  for (const book of books) {
    try {
      const candidates = book.type === 'pdf'
        ? await extractPdf(book.filename)
        : book.type === 'epub'
          ? await extractEpub(book.filename)
          : extractTxt(book.filename);

      sampleCandidates(candidates).forEach((candidate, index) => {
        items.push({
          id: `${book.filename}:${candidate.locator.kind}:${candidate.locator.page || candidate.locator.href || candidate.locator.offset || index}:${index}`,
          bookId: book.id,
          filename: book.filename,
          type: book.type,
          title: book.title,
          author: book.author || '',
          text: candidate.text,
          locator: candidate.locator,
        });
      });
      console.log(`[Feed] ${book.title}: ${candidates.length} candidates.`);
    } catch (error) {
      console.warn(`[Feed] ${book.filename} skipped:`, error.message);
    }
  }

  fs.writeFileSync(feedFile, JSON.stringify({
    version: 1,
    sourceSignature: signature,
    items,
  }));
  console.log(`[Feed] Generated ${items.length} passages from ${books.length} books.`);
}

main().catch((error) => {
  console.error('[Feed] Generation failed:', error);
  process.exitCode = 1;
});
