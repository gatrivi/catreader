import fs from 'fs';
import path from 'path';

const booksDir = path.join(process.cwd(), 'public', 'books');
const outputFile = path.join(process.cwd(), 'public', 'books.json');

// Create the directory if it doesn't exist
if (!fs.existsSync(booksDir)) {
  fs.mkdirSync(booksDir, { recursive: true });
}

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

function readerAssetPath(filename) {
  return `/reader/${paperSafeId(filename)}.json`;
}

const books = files
  .filter(file => supportedExtensions.some(ext => file.toLowerCase().endsWith(ext)))
  .map(file => {
    const ext = path.extname(file);
    const existing = currentBooks.find(b => b.filename === file);
    const paper = paperManifestPath(file);
    const reader = ext.toLowerCase() === '.pdf' ? readerAssetPath(file) : undefined;
    
    return {
      id: file,
      filename: file,
      type: ext.substring(1).toLowerCase(),
      title: existing?.title || file.replace(ext, ''),
      author: existing?.author,
      svg: existing?.svg,
      ...(existing?.audio ? { audio: existing.audio } : {}),
      ...(existing?.cattsBookId ? { cattsBookId: existing.cattsBookId } : {}),
      ...(existing?.coverSource ? { coverSource: existing.coverSource } : {}),
      ...(paper ? { paper } : {}),
      ...(reader ? { reader } : {})
    };
  });

fs.writeFileSync(outputFile, JSON.stringify(books, null, 2));
console.log(`[Library Generator] Generated books.json with ${books.length} books.`);
