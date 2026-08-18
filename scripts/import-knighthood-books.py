#!/usr/bin/env python3
"""Import public-domain Catholic knighthood texts into CatReader."""

from __future__ import annotations

import html
import json
import re
import shutil
import subprocess
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BOOKS_DIR = ROOT / "public" / "books"
BOOKS_JSON = ROOT / "public" / "books.json"

SOURCES = {
    "bernard": "https://fr.wikisource.org/w/api.php?action=parse&page=De_Laude_novae_militiae&prop=text&format=json&formatversion=2",
    "llull": "https://archive.org/download/cu31924026512156/cu31924026512156.pdf",
    "louis": "https://archive.org/download/me00dievalcivilizamunrrich/me00dievalcivilizamunrrich.pdf",
    "ignatius": "https://www.gutenberg.org/ebooks/70790.txt.utf-8",
}

BOOKS = [
    {
        "id": "In_Praise_of_the_New_Knighthood-St_Bernard-1866_FR.txt",
        "filename": "In_Praise_of_the_New_Knighthood-St_Bernard-1866_FR.txt",
        "type": "txt",
        "title": "Éloge de la nouvelle chevalerie (In Praise of the New Knighthood)",
        "author": "St. Bernard of Clairvaux",
    },
    {
        "id": "Book_of_the_Order_of_Chivalry-Ramon_Llull-1847.txt",
        "filename": "Book_of_the_Order_of_Chivalry-Ramon_Llull-1847.txt",
        "type": "txt",
        "title": "The Book of the Order of Chivalry",
        "author": "Bl. Ramon Llull",
    },
    {
        "id": "Advice_to_His_Son-St_Louis_IX-1910.txt",
        "filename": "Advice_to_His_Son-St_Louis_IX-1910.txt",
        "type": "txt",
        "title": "Advice to His Son",
        "author": "St. Louis IX of France",
    },
    {
        "id": "Spiritual_Exercises-St_Ignatius_Loyola-1916.txt",
        "filename": "Spiritual_Exercises-St_Ignatius_Loyola-1916.txt",
        "type": "txt",
        "title": "The Spiritual Exercises of St. Ignatius",
        "author": "St. Ignatius Loyola / Charles Coppens, S.J.",
    },
]


class ArticleText(HTMLParser):
    BLOCKS = {"p", "div", "section", "h1", "h2", "h3", "h4", "li", "br", "blockquote"}
    SKIP = {"script", "style", "sup", "table"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in self.SKIP:
            self.skip_depth += 1
        elif not self.skip_depth and tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP and self.skip_depth:
            self.skip_depth -= 1
        elif not self.skip_depth and tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)

    def text(self) -> str:
        raw = html.unescape("".join(self.parts)).replace("\xa0", " ")
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r" *\n *", "\n", raw)
        return re.sub(r"\n{3,}", "\n\n", raw).strip()


def fetch(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "CatReader/2 book-import (public-domain texts)"})
    with urlopen(req, timeout=120) as response:
        return response.read()


def pdftotext(pdf: Path, target: Path) -> str:
    if not shutil.which("pdftotext"):
        raise RuntimeError("pdftotext is required (install poppler-utils)")
    subprocess.run(["pdftotext", "-layout", str(pdf), str(target)], check=True)
    return target.read_text(encoding="utf-8", errors="replace")


def write_book(filename: str, text: str, source_note: str) -> None:
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    out = BOOKS_DIR / filename
    out.write_text(f"{source_note}\n\n{text}\n", encoding="utf-8")
    if out.stat().st_size < 2500:
        raise RuntimeError(f"Suspiciously short import: {filename} ({out.stat().st_size} bytes)")
    print(f"[import] {filename}: {out.stat().st_size:,} bytes")


def import_bernard() -> None:
    payload = json.loads(fetch(SOURCES["bernard"]).decode("utf-8"))
    parser = ArticleText()
    parser.feed(payload["parse"]["text"])
    text = parser.text()
    starts = [text.find(marker) for marker in ("LIVRE DE SAINT BERNARD", "PROLOGUE", "A Hugues")]
    starts = [i for i in starts if i >= 0]
    if starts:
        text = text[min(starts):]
    write_book(
        BOOKS[0]["filename"], text,
        "Public-domain French translation by Abbé Charpentier, Librairie Louis Vivès, 1866. Source: French Wikisource.",
    )


def import_llull(tmp: Path) -> None:
    pdf, txt = tmp / "llull.pdf", tmp / "llull.txt"
    pdf.write_bytes(fetch(SOURCES["llull"]))
    text = pdftotext(pdf, txt)
    candidates = [text.lower().find(x) for x in ("the buke", "order of knighthood", "gilbert hay")]
    candidates = [i for i in candidates if i >= 0]
    if candidates:
        text = text[min(candidates):]
    write_book(
        BOOKS[1]["filename"], text,
        "Public-domain 1847 English/Scots edition, translated from French and associated with Sir Gilbert Hay. Source scan: Cornell University Library / Internet Archive.",
    )


def normalize_page(page: str) -> str:
    return re.sub(r"\s+", " ", page).lower()


def import_louis(tmp: Path) -> None:
    pdf, txt = tmp / "medieval-civilization-1910.pdf", tmp / "medieval-civilization-1910.txt"
    pdf.write_bytes(fetch(SOURCES["louis"]))
    pages = pdftotext(pdf, txt).split("\f")

    # Ignore front matter / table of contents. The actual selection is printed pp. 366-375.
    start = None
    for i, page in enumerate(pages):
        if i < 250:
            continue
        n = normalize_page(page)
        if (
            ("advice" in n and "louis" in n and "son" in n)
            or "dear first-born son" in n
            or "dear first born son" in n
        ):
            start = i
            break
    if start is None:
        for i, page in enumerate(pages):
            if i < 250:
                continue
            n = normalize_page(page)
            if "philip" in n and "dear son" in n and "father" in n:
                start = i
                break
    if start is None:
        raise RuntimeError("Could not locate St. Louis' Advice to His Son in the 1910 scan")

    print(f"[import] St. Louis starts at scan page {start + 1}")
    excerpt = "\n\n".join(p.strip() for p in pages[start : start + 10] if p.strip())
    check = normalize_page(excerpt)
    if "dear son" not in check or len(excerpt) < 5000:
        raise RuntimeError(f"St. Louis extraction failed validation at scan page {start + 1}")
    write_book(
        BOOKS[2]["filename"], excerpt,
        "Public-domain English text from Dana C. Munro & George C. Sellery (eds.), Medieval Civilization, 1910, pp. 366-375. Source scan: Internet Archive / California Digital Library.",
    )


def import_ignatius() -> None:
    text = fetch(SOURCES["ignatius"]).decode("utf-8", errors="replace")
    write_book(
        BOOKS[3]["filename"], text,
        "Project Gutenberg eBook #70790. 1916 English edition adapted by Rev. Charles Coppens, S.J.; public domain in the USA.",
    )


def update_metadata() -> None:
    current = json.loads(BOOKS_JSON.read_text(encoding="utf-8"))
    by_filename = {book["filename"]: book for book in current}
    for book in BOOKS:
        by_filename[book["filename"]] = {**by_filename.get(book["filename"], {}), **book}
    BOOKS_JSON.write_text(json.dumps(list(by_filename.values()), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[import] books.json metadata prepared for {len(BOOKS)} books")


def main() -> None:
    BOOKS_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="catreader-knights-") as td:
        tmp = Path(td)
        import_bernard()
        import_llull(tmp)
        import_louis(tmp)
        import_ignatius()
    update_metadata()


if __name__ == "__main__":
    main()
