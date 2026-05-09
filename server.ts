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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    
    // Ensure books.json exists in dist if it's in public but not dist
    const publicBooksJson = path.join(process.cwd(), 'public', 'books.json');
    const distBooksJson = path.join(distPath, 'books.json');
    if (fs.existsSync(publicBooksJson) && !fs.existsSync(distBooksJson)) {
      try {
        if (!fs.existsSync(distPath)) fs.mkdirSync(distPath, { recursive: true });
        fs.copyFileSync(publicBooksJson, distBooksJson);
      } catch (e) {
        console.error('Failed to copy books.json to dist:', e);
      }
    }

    app.use(express.static(distPath));
    
    // Explicit 404 for static assets to avoid returning index.html (SPA fallback)
    app.get(/\.(json|pdf|txt|png|jpg|jpeg|svg|css|js)$/, (req, res) => {
      res.status(404).send('Not found');
    });

    // SPA fallback - exclude /api routes just in case the platform uses them
    app.get(/^(?!\/api).*$/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
