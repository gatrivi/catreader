# CatReader 🐱📖

An industry-standard, cross-device PDF/TXT reader with zero-auth cloud sync and Google Drive integration.

## 🚀 Getting Started

### 1. Adding Books (Local Library)
Simply place your PDF or TXT files inside the `/public/books/` directory. 
The app automatically scans this folder and adds them to your Library.

### 2. Running Locally
```bash
npm install
npm run dev
```

## 🌍 Deployment (Vercel, Netlify, GitHub Pages)

This app is built with Vite and React. It is designed to be deployed as a purely **static site**, making it incredibly easy to host anywhere with zero backend configuration.

1. Push your code (including the `/public/books/` folder with your PDFs) to GitHub.
2. Import the repository into Vercel or Netlify.
3. The build command is `npm run build` and the output directory is `dist`.
4. **That's it!** 

During the build process, a script (`scripts/generate-library.js`) automatically runs to index all the books in your `/public/books/` folder and generates a static `books.json` file. This means your 125MB of PDFs will be served globally via the CDN with minimal hassle.

## 🏗️ Architecture & Industry Standards

- **Frontend:** React 18, Vite, Tailwind CSS, Framer Motion.
- **PDF Rendering:** `react-pdf` (Mozilla's PDF.js under the hood).
- **Pre-buffering:** Adjacent pages are pre-rendered invisibly in the DOM to ensure smooth navigation, especially for large scanned PDFs.
- **Sync:** `kvdb.io` for zero-auth cross-device progress synchronization.
- **Static Site Generation (SSG):** The library is statically generated at build time, eliminating the need for a Node.js server in production.

## 📖 Features
- **Multi-format Support:** Reads `.pdf` and `.txt` files.
- **Google Drive Integration:** Pick files directly from Drive or upload local files to the cloud.
- **Smart Navigation:** Click the left/right edges of the screen, or use the bottom slider to jump to any page instantly.
- **Themes:** Light, Dark, and Sepia modes.
- **Auto-hide UI:** The interface gets out of your way while reading.
