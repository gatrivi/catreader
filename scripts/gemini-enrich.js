import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!API_KEY || API_KEY === 'your_api_key_here' || API_KEY === 'MY_GEMINI_API_KEY') {
  console.error('Error: Gemini API Key not found in .env. Please set VITE_GEMINI_API_KEY.');
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey: API_KEY });

const booksDir = path.join(process.cwd(), 'public', 'books');
const outputFile = path.join(process.cwd(), 'public', 'books.json');

async function extractTextFromPdf(filePath, maxPages = 5) {
  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    const pagesToScan = Math.min(pdf.numPages, maxPages);
    for (let i = 1; i <= pagesToScan; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }
    
    return fullText.substring(0, 10000); // Send up to 10k chars from first 5 pages
  } catch (err) {
    console.warn(`[PDF Error] Could not extract text from ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

async function getMetadataAndCover(filename, sampleText) {
  const prompt = `
    Analyze the following text from the first few pages of a book file named "${filename}".
    1. Identify the actual Book Title and Author Name.
    2. If you see introductory pages (e.g., Google Books "digitized by Google" notices, library stamps, or legal info), IGNORE THEM and find the real title and author further in the text.
    3. Create a beautiful, minimalist book cover in SVG format.
       - Use a color palette that matches the book's theme.
       - Include the title and author in the SVG.
       - Vertical 2:3 ratio.
    
    Return ONLY a JSON object:
    {
      "title": "Clean Title",
      "author": "Author Name",
      "svg": "<svg ...>...</svg>"
    }

    Text snippet:
    ${sampleText || 'No text available, use filename only.'}
  `;

  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanJson = responseText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.error(`[Gemini Error] ${filename}: ${err.message}`);
    return null;
  }
}

async function main() {
  if (!fs.existsSync(booksDir)) {
    console.error(`Books directory not found: ${booksDir}`);
    return;
  }

  const supportedExtensions = ['.pdf', '.txt', '.epub'];
  const files = fs.readdirSync(booksDir).filter(file => 
    supportedExtensions.some(ext => file.toLowerCase().endsWith(ext))
  );

  console.log(`Processing ${files.length} books...`);

  const currentBooks = fs.existsSync(outputFile) 
    ? JSON.parse(fs.readFileSync(outputFile, 'utf8'))
    : [];

  const results = [];

  for (const file of files) {
    console.log(`- Processing: ${file}`);
    const filePath = path.join(booksDir, file);
    const ext = path.extname(file).toLowerCase();
    
    // Check if we already have detailed metadata (optional: skip if exists)
    const existing = currentBooks.find(b => b.filename === file);
    if (existing && existing.author && existing.svg) {
        console.log(`  Skipping (already enriched)`);
        results.push(existing);
        continue;
    }

    let text = '';
    if (ext === '.pdf') {
      text = await extractTextFromPdf(filePath);
    } else if (ext === '.txt') {
      text = fs.readFileSync(filePath, 'utf8').substring(0, 5000);
    } else {
      text = `Filename: ${file}`;
    }

    const metadata = await getMetadataAndCover(file, text);

    if (metadata) {
      console.log(`  Found: "${metadata.title}" by ${metadata.author}`);
      results.push({
        id: file,
        filename: file,
        type: ext.substring(1),
        title: metadata.title,
        author: metadata.author,
        svg: metadata.svg
      });
    } else {
      results.push({
        id: file,
        filename: file,
        type: ext.substring(1),
        title: file.replace(ext, ''),
        author: 'Unknown'
      });
    }
    
    // Wait a bit to avoid rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\nSuccess! Updated ${outputFile}`);
}

main().catch(console.error);
