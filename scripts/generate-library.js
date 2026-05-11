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

const books = files
  .filter(file => supportedExtensions.some(ext => file.toLowerCase().endsWith(ext)))
  .map(file => {
    const ext = path.extname(file);
    const existing = currentBooks.find(b => b.filename === file);
    
    return {
      id: file,
      filename: file,
      type: ext.substring(1).toLowerCase(),
      title: existing?.title || file.replace(ext, ''),
      author: existing?.author,
      svg: existing?.svg
    };
  });

fs.writeFileSync(outputFile, JSON.stringify(books, null, 2));
console.log(`[Library Generator] Generated books.json with ${books.length} books.`);
