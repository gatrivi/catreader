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
    3. Create a high-end, professional, and artistic book cover in SVG format (400x600).
       - DO NOT just use a solid background and plain text.
       - Use sophisticated SVG features: <linearGradient>, <radialGradient>, <path> for abstract shapes, symbols, or artistic motifs.
       - The design MUST reflect the book's specific themes (e.g., if it's about spirituality, use ethereal light and organic paths; if it's a technical manual, use structured geometric patterns).
       - Use a professional color palette.
       - Typography: Elegant font styling, proper weighting, and strategic positioning.
       - The Title should be prominent and artistic. The Author should be clear but secondary.
       - The final result should look like a premium physical book cover.
    
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
      model: "gemini-flash-latest",
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

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`- Processing: ${file}`);
    const filePath = path.join(booksDir, file);
    const ext = path.extname(file).toLowerCase();
    
    // Force re-enrichment for the first 5 to show style change (0 to 4)
    const existing = currentBooks.find(b => b.filename === file);
    if (existing && existing.author && existing.svg && i >= 5) {
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
    await new Promise(r => setTimeout(r, 2000));
  }

  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\nSuccess! Updated ${outputFile}`);
}

main().catch(console.error);
