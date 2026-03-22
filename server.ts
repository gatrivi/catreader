import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API to list books in /public/books/
  app.get("/api/books", (req, res) => {
    const booksDir = path.join(process.cwd(), "public", "books");
    
    // Ensure directory exists
    if (!fs.existsSync(booksDir)) {
      fs.mkdirSync(booksDir, { recursive: true });
    }

    try {
      const files = fs.readdirSync(booksDir);
      const pdfs = files
        .filter(file => file.toLowerCase().endsWith(".pdf"))
        .map(file => ({
          id: file,
          title: file.replace(".pdf", ""),
          filename: file
        }));
      res.json(pdfs);
    } catch (err) {
      console.error("Error reading books directory:", err);
      res.status(500).json({ error: "Failed to list books" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
