#!/usr/bin/env python3
"""Import public-domain Catholic civility / social-conduct texts into CatReader."""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BOOKS_DIR = ROOT / "public" / "books"
BOOKS_JSON = ROOT / "public" / "books.json"

SOURCES = {
    "lasalle": "https://archive.org/download/1825lesrglesde00lasa/1825lesrglesde00lasa_djvu.txt",
    "sales": "https://archive.org/download/introductiontodefran/introductiontodefran_djvu.txt",
    "teresa": "https://archive.org/download/wayofperfection00tereuoft/wayofperfection00tereuoft_djvu.txt",
    "therese": "https://www.gutenberg.org/ebooks/63294.txt.utf-8",
}

BOOKS = [
    {
        "id": "Rules_of_Christian_Decorum_and_Civility-La_Salle-1825_FR.txt",
        "filename": "Rules_of_Christian_Decorum_and_Civility-La_Salle-1825_FR.txt",
        "type": "txt",
        "title": "Les règles de la bienséance et de la civilité chrétienne",
        "author": "St. John Baptist de La Salle",
    },
    {
        "id": "Introduction_to_the_Devout_Life-Francis_de_Sales-1900.txt",
        "filename": "Introduction_to_the_Devout_Life-Francis_de_Sales-1900.txt",
        "type": "txt",
        "title": "Introduction to the Devout Life",
        "author": "St. Francis de Sales",
    },
    {
        "id": "Way_of_Perfection-Teresa_of_Avila-1919.txt",
        "filename": "Way_of_Perfection-Teresa_of_Avila-1919.txt",
        "type": "txt",
        "title": "The Way of Perfection",
        "author": "St. Teresa of Ávila",
    },
    {
        "id": "Thoughts_of_St_Therese_of_Lisieux-1915.txt",
        "filename": "Thoughts_of_St_Therese_of_Lisieux-1915.txt",
        "type": "txt",
        "title": "Thoughts of Saint Thérèse of the Child Jesus",
        "author": "St. Thérèse of Lisieux",
    },
]


def fetch(url: str) -> str:
    req = Request(url, headers={"User-Agent": "CatReader/2 public-domain book importer"})
    with urlopen(req, timeout=120) as response:
        return response.read().decode("utf-8", errors="replace")


def clean(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x0c", "\n\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return re.sub(r"\n{4,}", "\n\n\n", text).strip()


def trim_between(text: str, starts: tuple[str, ...], ends: tuple[str, ...] = ()) -> str:
    low = text.lower()
    start_hits = [low.find(s.lower()) for s in starts]
    start_hits = [i for i in start_hits if i >= 0]
    if start_hits:
        text = text[min(start_hits):]
        low = text.lower()
    end_hits = [low.find(e.lower()) for e in ends]
    end_hits = [i for i in end_hits if i > 2000]
    if end_hits:
        text = text[:min(end_hits)]
    return text


def write_book(index: int, text: str, note: str, required: tuple[str, ...]) -> None:
    text = clean(text)
    check = text.lower()
    if len(text) < 12000 or not all(term.lower() in check for term in required):
        raise RuntimeError(f"Validation failed for {BOOKS[index]['filename']} ({len(text)} chars)")
    out = BOOKS_DIR / BOOKS[index]["filename"]
    out.write_text(f"{note}\n\n{text}\n", encoding="utf-8")
    print(f"[import] {out.name}: {out.stat().st_size:,} bytes")


def main() -> None:
    BOOKS_DIR.mkdir(parents=True, exist_ok=True)

    lasalle = trim_between(
        fetch(SOURCES["lasalle"]),
        ("règles de la bienséance", "regles de la bienseance"),
        ("élémens de la grammaire", "elements de la grammaire"),
    )
    write_book(
        0, lasalle,
        "Public-domain French edition, Caen: A. Lecrêne, 1825. Source scan/OCR: Internet Archive / University of Toronto.",
        ("civilité", "conversation"),
    )

    sales = trim_between(
        fetch(SOURCES["sales"]),
        ("introduction to a devout life", "introduction to the devout life"),
    )
    write_book(
        1, sales,
        "Public-domain English edition of St. Francis de Sales, F. Pustet & Co., 1900. Source OCR: Internet Archive.",
        ("conversation", "devout"),
    )

    teresa = trim_between(
        fetch(SOURCES["teresa"]),
        ("the way of perfection", "way of perfection"),
    )
    write_book(
        2, teresa,
        "Public-domain English edition, London: Thomas Baker, 1919. Source OCR: Internet Archive / University of Toronto.",
        ("perfection", "charity"),
    )

    therese = trim_between(
        fetch(SOURCES["therese"]),
        ("thoughts of saint thérèse", "thoughts of saint therese"),
    )
    write_book(
        3, therese,
        "Project Gutenberg eBook #63294; 1915 English translation by an Irish Carmelite; public domain in the USA.",
        ("love of our neighbour", "charity"),
    )

    current = json.loads(BOOKS_JSON.read_text(encoding="utf-8"))
    by_filename = {book["filename"]: book for book in current}
    for book in BOOKS:
        by_filename[book["filename"]] = {**by_filename.get(book["filename"], {}), **book}
    BOOKS_JSON.write_text(
        json.dumps(list(by_filename.values()), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[import] metadata prepared for {len(BOOKS)} civility books")


if __name__ == "__main__":
    main()
