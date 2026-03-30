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

const books = files
  .filter(file => supportedExtensions.some(ext => file.toLowerCase().endsWith(ext)))
  .map(file => {
    const ext = path.extname(file);
    return {
      id: file,
      title: file.replace(ext, ''),
      filename: file,
      type: ext.substring(1).toLowerCase()
    };
  });

fs.writeFileSync(outputFile, JSON.stringify(books, null, 2));
console.log(`[Library Generator] Generated books.json with ${books.length} books.`);
