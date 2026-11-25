# SPDX-License-Identifier: AGPL-3.0-or-later
# Вставить H1 в начало тела статьи: Title/title из front matter, иначе имя файла.
# Пропуск: index.md, уже есть # в первой непустой строке тела.
# Запуск: python tools/articles_add_h1.py [--dry-run]
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "docs" / "articles"
SKIP_NAMES = {"index.md", "lab-tests-todo.md"}
FM = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n(.*)\Z", re.S)
H1 = re.compile(r"^#\s+\S")


def meta_title(fm: str) -> str:
    for line in fm.splitlines():
        m = re.match(r"^(Title|title)\s*:\s*(.*)$", line)
        if not m:
            continue
        v = m.group(2).strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        return v.strip()
    return ""


def first_content_line(body: str) -> str:
    for ln in body.splitlines():
        if ln.strip():
            return ln
    return ""


def process(path: Path, dry: bool) -> str:
    raw = path.read_text(encoding="utf-8")
    m = FM.match(raw)
    if not m:
        return "no-fm"
    fm, body = m.group(1), m.group(2)
    if H1.match(first_content_line(body)):
        return "has-h1"
    title = meta_title(fm) or path.stem
    if not title:
        return "empty"
    # одна пустая строка после ---, затем # title, затем пустая, затем тело как было
    body_stripped = body.lstrip("\r\n")
    new_body = f"# {title}\n\n{body_stripped}"
    if not dry:
        text = f"---\n{fm}\n---\n\n{new_body}"
        # open()+os — надёжнее на Windows с нестандартными символами в имени
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    return "ok"


def main() -> int:
    dry = "--dry-run" in sys.argv
    counts: dict[str, int] = {}
    errors: list[str] = []
    for path in sorted(ROOT.rglob("*.md")):
        if path.name.lower() in SKIP_NAMES:
            continue
        if path.name == "nolist-gap.md":
            continue
        try:
            st = process(path, dry)
        except OSError as e:
            st = "error"
            errors.append(f"{path.relative_to(ROOT)}: {e}")
        counts[st] = counts.get(st, 0) + 1
    tag = "dry-run" if dry else "done"
    print(f"{tag}: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    for e in errors[:20]:
        print("ERR", e)
    if len(errors) > 20:
        print(f"... и ещё {len(errors) - 20}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
