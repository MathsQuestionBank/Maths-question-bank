"""V6.2-based mark-scheme row detector (owner-side/offline extraction).

Usage: python tools/v62_recover.py --pdf <mark-scheme.pdf> --year 2020 --paper 2H --ids Q03 Q05 --output recovery.zip

Requires: pip install pymupdf pillow
Generates a review ZIP, never writes to Supabase and never marks an image approved.
Adapted from V6.2 import_server.py; supports rotated 2021 PDF pages.
"""
import argparse
import io
import json
import re
import zipfile

import fitz
from PIL import Image


def text_lines(page):
    out = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(x["text"] for x in line["spans"]).strip()
            if not text:
                continue
            rect = fitz.Rect(line["bbox"])
            if page.rotation:
                rect = rect * page.rotation_matrix
            out.append((text, rect))
    return sorted(out, key=lambda item: (item[1].y0, item[1].x0))


def mark_scheme_rows(document):
    anchors = []
    for pno, page in enumerate(document):
        lines = text_lines(page)
        for index, (text, rect) in enumerate(lines):
            if not re.match(r"^\s*Paper\s*:\s*1MA1\s*/\s*[123][HF]\b", text, re.I):
                continue
            headings = {}
            for label, header in lines[index + 1:]:
                if header.y0 > rect.y0 + 55:
                    break
                if label.strip().lower() in ("question", "answer", "mark", "mark scheme", "additional guidance"):
                    headings[label.strip().lower()] = header
            if "question" in headings and "answer" in headings and "mark scheme" in headings and len(headings) >= 4:
                anchors.append((pno, headings))
    rows = {}
    for pno, headings in anchors:
        header_y = min(rect.y0 for rect in headings.values())
        question_x = headings["question"].x0
        answer_x = headings["answer"].x0
        for label, rect in text_lines(document[pno]):
            if rect.y0 <= header_y + 5 or not (question_x - 12 <= rect.x0 < answer_x - 5):
                continue
            match = re.fullmatch(r"\s*(\d{1,2})\s*(?:\([a-z]\))?\s*", label)
            if match and 1 <= int(match[1]) <= 35:
                rows.setdefault(int(match[1]), []).append((pno, rect.y0))
    return rows


def render_row(document, start, end):
    images = []
    for pno in range(start[0], end[0] + 1):
        page = document[pno]
        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        image = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        scale = image.height / page.rect.height
        y0 = max(0, int((start[1] - 7 if pno == start[0] else 65) * scale))
        y1 = min(image.height, int((end[1] - 5 if pno == end[0] else page.rect.height - 12) * scale))
        if y1 > y0 + 15:
            images.append(image.crop((0, y0, image.width, y1)))
    if not images:
        raise ValueError("No usable image segments")
    width = max(image.width for image in images)
    height = sum(image.height for image in images) + 12 * (len(images) - 1)
    combined = Image.new("RGB", (width, height), "white")
    y = 0
    for image in images:
        combined.paste(image, (0, y))
        y += image.height + 12
    out = io.BytesIO()
    combined.save(out, "PNG")
    return out.getvalue()


def recover(pdf, year, paper, question_numbers, output):
    document = fitz.open(pdf)
    rows = mark_scheme_rows(document)
    all_rows = sorted(((number, pno, y) for number, starts in rows.items() for pno, y in starts), key=lambda x: (x[1], x[2]))
    manifest = []
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for number in question_numbers:
            starts = rows.get(number)
            if not starts:
                print(f"Q{number:02d}: marking row missing; skipped")
                continue
            start = starts[0]
            next_row = next(((pno, y) for n, pno, y in all_rows if (pno, y) > start and n != number), (len(document) - 1, document[-1].rect.height - 20))
            path = f"recovery/{year}/{paper}/Q{number:02d}/mark.png"
            archive.writestr(path, render_row(document, start, next_row))
            manifest.append({"id": f"{year}_{paper}_Q{number:02d}", "path": path, "review_required": True, "pages": next_row[0] - start[0] + 1})
        archive.writestr("manifest.json", json.dumps({"recovered": manifest, "source": "V6.2 mark-scheme detector adapted for rotated PDFs", "review_required": True}, indent=2))
    print(f"Wrote {len(manifest)} candidate mark scheme crops to {output}. Verify each one before approval.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--year", required=True, choices=["2020", "2021", "2022"])
    parser.add_argument("--paper", required=True, choices=["1H", "2H", "3H"])
    parser.add_argument("--ids", nargs="+", required=True, help="Question IDs e.g. Q03 Q07")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    recover(args.pdf, args.year, args.paper, [int(re.fullmatch(r"Q(\d{1,2})", item).group(1)) for item in args.ids], args.output)
