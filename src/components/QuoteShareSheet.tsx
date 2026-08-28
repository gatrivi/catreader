import React, { useMemo, useRef, useState } from 'react';
import { Check, Copy, ImagePlus, Share2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export type QuoteCardStyle = 'paper' | 'editorial' | 'night' | 'photo';

interface QuoteShareSheetProps {
  text: string;
  bookTitle: string;
  locationLabel: string;
  url: string;
  onClose: () => void;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const IMAGE_QUOTE_LIMIT = 1200;

function cleanBookName(filename: string) {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferCurrentBookTitle() {
  const historyFilename = typeof window !== 'undefined' && typeof window.history.state?.filename === 'string'
    ? window.history.state.filename
    : '';
  if (historyFilename) return cleanBookName(historyFilename);

  if (typeof window === 'undefined') return 'CatReader';
  const parts = window.location.pathname.split('/').filter(Boolean);
  const last = parts.at(-1) || 'CatReader';
  try {
    return cleanBookName(decodeURIComponent(last));
  } catch {
    return cleanBookName(last);
  }
}

export function buildQuoteShareText(text: string, bookTitle: string, locationLabel: string, url: string) {
  return `“${text.trim()}”\n\n— ${bookTitle}${locationLabel ? ` · ${locationLabel}` : ''}\n${url}`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawPaperSoul(ctx: CanvasRenderingContext2D, seed: number, dark = false) {
  const random = seededRandom(seed);
  ctx.fillStyle = dark ? '#181714' : '#eadfc6';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const vignette = ctx.createRadialGradient(
    CARD_WIDTH * 0.48,
    CARD_HEIGHT * 0.42,
    120,
    CARD_WIDTH * 0.5,
    CARD_HEIGHT * 0.5,
    CARD_HEIGHT * 0.8,
  );
  vignette.addColorStop(0, dark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.2)');
  vignette.addColorStop(1, dark ? 'rgba(0,0,0,0.28)' : 'rgba(86,55,26,0.14)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  for (let i = 0; i < 1800; i += 1) {
    const x = random() * CARD_WIDTH;
    const y = random() * CARD_HEIGHT;
    const alpha = 0.018 + random() * 0.055;
    const size = 0.5 + random() * 1.7;
    ctx.fillStyle = dark
      ? `rgba(232,218,183,${alpha})`
      : `rgba(91,62,34,${alpha})`;
    ctx.fillRect(x, y, size, size);
  }

  for (let i = 0; i < 7; i += 1) {
    const x = random() * CARD_WIDTH;
    const y = random() * CARD_HEIGHT;
    const radius = 35 + random() * 150;
    const stain = ctx.createRadialGradient(x, y, 0, x, y, radius);
    stain.addColorStop(0, dark ? 'rgba(118,86,45,0.05)' : 'rgba(111,76,37,0.055)');
    stain.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

async function loadImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load selected image'));
    image.src = src;
  });
}

function drawCoverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement) {
  const scale = Math.max(CARD_WIDTH / image.naturalWidth, CARD_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x = (CARD_WIDTH - width) / 2;
  const y = (CARD_HEIGHT - height) / 2;
  ctx.drawImage(image, x, y, width, height);
  const shade = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  shade.addColorStop(0, 'rgba(10,10,10,0.34)');
  shade.addColorStop(0.45, 'rgba(10,10,10,0.5)');
  shade.addColorStop(1, 'rgba(10,10,10,0.76)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  const paragraphs = text.replace(/\s+/g, ' ').trim().split(/\n+/);
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.split(' ').filter(Boolean);
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    if (paragraphIndex < paragraphs.length - 1) lines.push('');
  });
  return lines;
}

function fontSizeForQuote(length: number) {
  if (length < 180) return 70;
  if (length < 340) return 58;
  if (length < 600) return 48;
  if (length < 900) return 40;
  return 32;
}

async function renderQuoteCard(
  text: string,
  bookTitle: string,
  locationLabel: string,
  style: QuoteCardStyle,
  photoUrl: string | null,
) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const seed = hashString(`${bookTitle}:${text}`);
  const usePhoto = style === 'photo' && photoUrl;

  if (usePhoto) {
    const image = await loadImage(photoUrl);
    drawCoverImage(ctx, image);
  } else if (style === 'night') {
    drawPaperSoul(ctx, seed, true);
  } else if (style === 'editorial') {
    ctx.fillStyle = '#f5f1e8';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    ctx.fillStyle = '#c1863f';
    ctx.fillRect(96, 100, 10, CARD_HEIGHT - 200);
    const random = seededRandom(seed);
    for (let i = 0; i < 900; i += 1) {
      const alpha = 0.01 + random() * 0.025;
      ctx.fillStyle = `rgba(40,36,30,${alpha})`;
      ctx.fillRect(random() * CARD_WIDTH, random() * CARD_HEIGHT, 1.2, 1.2);
    }
  } else {
    drawPaperSoul(ctx, seed, false);
  }

  const dark = style === 'night' || Boolean(usePhoto);
  const textColor = dark ? '#f4ead5' : '#352d26';
  const mutedColor = dark ? 'rgba(244,234,213,0.72)' : 'rgba(53,45,38,0.68)';

  ctx.fillStyle = textColor;
  ctx.font = `italic 128px Georgia, 'Times New Roman', serif`;
  ctx.fillText('“', 104, 235);

  const imageText = text.trim().length > IMAGE_QUOTE_LIMIT
    ? `${text.trim().slice(0, IMAGE_QUOTE_LIMIT - 1).trimEnd()}…`
    : text.trim();
  const fontSize = fontSizeForQuote(imageText.length);
  ctx.font = `${fontSize}px Georgia, 'Times New Roman', serif`;
  ctx.textBaseline = 'top';
  const lines = wrapText(ctx, imageText, 830);
  const lineHeight = Math.round(fontSize * 1.42);
  const availableHeight = 850;
  const maxLines = Math.max(4, Math.floor(availableHeight / lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines && visibleLines.length > 0) {
    visibleLines[visibleLines.length - 1] = `${visibleLines[visibleLines.length - 1].replace(/[.…]+$/, '')}…`;
  }

  let y = 245;
  visibleLines.forEach((line) => {
    ctx.fillStyle = textColor;
    ctx.fillText(line, 132, y);
    y += lineHeight;
  });

  ctx.fillStyle = dark ? 'rgba(244,234,213,0.18)' : 'rgba(53,45,38,0.16)';
  roundedRect(ctx, 104, 1100, 872, 2, 1);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.font = '600 36px Georgia, serif';
  ctx.fillText(bookTitle, 104, 1148);

  ctx.fillStyle = mutedColor;
  ctx.font = '24px system-ui, -apple-system, sans-serif';
  ctx.fillText(locationLabel, 104, 1205);

  ctx.textAlign = 'right';
  ctx.font = '700 22px system-ui, -apple-system, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('CATREADER', 976, 1261);
  ctx.textAlign = 'left';

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not render share image')), 'image/png');
  });
}

function saveBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const styleLabels: Array<{ value: QuoteCardStyle; label: string }> = [
  { value: 'paper', label: 'Papel' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'night', label: 'Noche' },
];

export function QuoteShareSheet({ text, bookTitle, locationLabel, url, onClose }: QuoteShareSheetProps) {
  const [style, setStyle] = useState<QuoteCardStyle>('paper');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const shareText = useMemo(
    () => buildQuoteShareText(text, bookTitle, locationLabel, url),
    [text, bookTitle, locationLabel, url],
  );

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const makeBlob = () => renderQuoteCard(text, bookTitle, locationLabel, style, photoUrl);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await copyText();
      const blob = await makeBlob();
      const filename = `catreader-${bookTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'quote'}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: bookTitle, text: shareText, files: [file] });
        return;
      }

      if (navigator.share) {
        await navigator.share({ title: bookTitle, text: shareText, url });
        return;
      }

      saveBlob(blob, filename);
    } catch (error: any) {
      if (error?.name !== 'AbortError') console.error('[QuoteShare] Share failed:', error);
    } finally {
      setBusy(false);
    }
  };

  const saveImage = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await makeBlob();
      saveBlob(blob, 'catreader-quote.png');
      await copyText();
    } catch (error) {
      console.error('[QuoteShare] Image save failed:', error);
    } finally {
      setBusy(false);
    }
  };

  const choosePhoto = (file?: File) => {
    if (!file) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    const next = URL.createObjectURL(file);
    setPhotoUrl(next);
    setStyle('photo');
  };

  const previewBackground = style === 'night'
    ? 'linear-gradient(145deg, #25231f, #11100e)'
    : style === 'editorial'
      ? 'linear-gradient(145deg, #fbf8f0, #ece4d5)'
      : 'radial-gradient(circle at 42% 30%, #f7ecd4 0, #eadfc6 62%, #d8c5a2 100%)';

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[240] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ y: 32, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.98 }}
          className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-stone-950 text-stone-100 shadow-2xl sm:rounded-3xl"
        >
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-400">Paper Soul Share</div>
              <div className="mt-0.5 text-xs text-stone-400">Texto copiado · elegí la imagen</div>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-stone-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>

          <div className="px-4 py-2">
            <div
              className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
              style={{ background: previewBackground }}
            >
              {style === 'photo' && photoUrl && (
                <img src={photoUrl} alt="Fondo elegido" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {style === 'photo' && <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/50 to-black/80" />}
              {style === 'paper' && (
                <div
                  className="absolute inset-0 opacity-25 mix-blend-multiply"
                  style={{ backgroundImage: 'radial-gradient(rgba(75,52,31,.2) .7px, transparent .8px)', backgroundSize: '7px 7px' }}
                />
              )}
              {style === 'editorial' && <div className="absolute bottom-8 left-6 top-8 w-1 rounded-full bg-amber-700/70" />}

              <div className={`relative z-10 flex h-full flex-col p-7 ${style === 'photo' || style === 'night' ? 'text-[#f4ead5]' : 'text-[#352d26]'}`}>
                <div className="font-serif text-6xl italic leading-none opacity-80">“</div>
                <div className="mt-1 line-clamp-[11] flex-1 font-serif text-[clamp(1.05rem,4vw,1.45rem)] leading-relaxed">
                  {text}
                </div>
                <div className={`mt-5 border-t pt-4 ${style === 'photo' || style === 'night' ? 'border-white/20' : 'border-stone-700/20'}`}>
                  <div className="truncate font-serif text-sm font-semibold">{bookTitle}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.16em] opacity-65">{locationLabel}</div>
                  <div className="mt-3 text-right text-[9px] font-bold tracking-[0.25em] opacity-55">CATREADER</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 px-4 py-3">
            {styleLabels.map((option) => (
              <button
                key={option.value}
                onClick={() => setStyle(option.value)}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${style === option.value ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-white/10 text-stone-400 hover:bg-white/5 hover:text-white'}`}
              >
                {option.label}
              </button>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${style === 'photo' ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-white/10 text-stone-400 hover:bg-white/5 hover:text-white'}`}
            >
              <ImagePlus size={12} /> Foto
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => choosePhoto(event.target.files?.[0])}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-white/10 p-4">
            <button
              onClick={share}
              disabled={busy}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-stone-950 shadow-lg shadow-amber-950/20 transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              <Share2 size={17} /> {busy ? 'Preparando…' : 'Compartir'}
            </button>
            <button
              onClick={copyText}
              className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-white/10 text-stone-300 hover:bg-white/5 hover:text-white"
              title="Copiar texto"
              aria-label="Copiar texto"
            >
              {copied ? <Check size={17} className="text-emerald-400" /> : <Copy size={17} />}
            </button>
            <button
              onClick={saveImage}
              disabled={busy}
              className="col-span-2 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 hover:text-stone-300 disabled:opacity-40"
            >
              Guardar PNG + copiar texto
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
