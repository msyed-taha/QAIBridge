"""
Reading an uploaded file as lines of text, for the Problem Solver and the AI Advisor.

One line per item, record or city: CSV/TSV rows become "a, b, c", a JSON list gives
one line per element (an object as "key: value · key: value"), and PDF, Word and
plain-text files give their non-empty lines. Files are limited to 5 MB.
"""
from __future__ import annotations

import csv
import io
import json
from typing import Any, Iterable, List, Tuple

from fastapi import HTTPException, UploadFile

MAX_FILE_BYTES = 5 * 1024 * 1024
TEXT_FORMATS = {"txt", "md", "log", "xml", "yaml", "yml", "tex"}
FORMATS = {"pdf", "docx", "csv", "tsv", "json"} | TEXT_FORMATS


def json_lines(obj: Any) -> List[str]:
    """One line per element: a list of values or records, or the key: value pairs of an object."""
    def flat(v: Any) -> str:
        if isinstance(v, dict):
            return " · ".join(f"{k}: {flat(x)}" for k, x in v.items())
        if isinstance(v, list):
            return ", ".join(flat(x) for x in v)
        return str(v)
    if isinstance(obj, list):
        return [flat(v) for v in obj]
    if isinstance(obj, dict):
        return [f"{k}: {flat(v)}" for k, v in obj.items()]
    return [str(obj)]


def _is_number(cell: str) -> bool:
    try:
        float(cell.replace(",", ""))
        return True
    except ValueError:
        return False


def _rows(rows: Iterable[List[str]]) -> List[str]:
    """
    One line per row. When the first row is a header (no numbers in it, and numbers below it), every value
    is labelled with its column, "name: Ali · age: 34", so a query such as "age > 30" can find it.
    """
    table = [[c.strip() for c in row] for row in rows if any(c.strip() for c in row)]
    if len(table) >= 2 and len(table[0]) >= 2:
        head, body = table[0], table[1:]
        header = (all(h and not _is_number(h) for h in head)
                  and any(_is_number(c) for row in body for c in row))
        if header:
            return [" · ".join(f"{h}: {c}" for h, c in zip(head, row) if c) for row in body]
    return [", ".join(row) for row in table]


async def read_lines(file: UploadFile, formats: Iterable[str] = FORMATS) -> Tuple[str, List[str]]:
    """The file's extension and its non-empty lines. Raises a 4xx HTTPException the page can show."""
    formats = set(formats)
    name = (file.filename or "").lower()
    ext = name.rsplit(".", 1)[-1] if "." in name else ""
    if ext not in formats:
        raise HTTPException(400, f"QAIbridge can't read '.{ext}' files. Use one of: {', '.join(sorted(formats))}.")
    content = await file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(413, "This file is larger than 5 MB.")

    try:
        if ext == "pdf":
            from pypdf import PdfReader
            text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(content)).pages)
        elif ext == "docx":
            from docx import Document
            text = "\n".join(p.text for p in Document(io.BytesIO(content)).paragraphs)
        elif ext in ("csv", "tsv"):
            reader = csv.reader(io.StringIO(content.decode("utf-8", errors="replace")),
                                delimiter="," if ext == "csv" else "\t")
            text = "\n".join(_rows(reader))
        elif ext == "json":
            text = "\n".join(json_lines(json.loads(content.decode("utf-8", errors="replace"))))
        else:
            text = content.decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(400, f"QAIbridge couldn't read this .{ext} file. Check that it isn't damaged.")

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        raise HTTPException(400, "No readable text was found in this file. A scanned PDF has none, for example.")
    return ext, lines
