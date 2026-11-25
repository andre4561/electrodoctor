# SPDX-License-Identifier: AGPL-3.0-or-later
# Статическая сборка docs/ → tools/out/site/ (как preview.py, без Jekyll).
# Архивы (файлы в корне — распаковать в корень сайта):
#   tools/out/electrodoctor-site.tar.gz  — предпочтительно на Linux-хостинге (UTF-8 имена)
#   tools/out/electrodoctor-site.zip
# Исходные .md на сайт не копируются — только готовый HTML.
#
# Запуск: python tools/build_site.py
from __future__ import annotations

import html
import os
import re
import shutil
import tarfile
import zipfile
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = ROOT / "tools" / "out" / "site"
ZIP = ROOT / "tools" / "out" / "electrodoctor-site.zip"
TGZ = ROOT / "tools" / "out" / "electrodoctor-site.tar.gz"

SKIP_DIRS = {"_layouts", "_includes", ".git"}
SKIP_FILES = {"_config.yml"}
SKIP_SUFFIXES = {".zip"}  # не тащить архивы внутрь выкладки
FM = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n", re.S)


def front_matter(text: str):
    m = FM.match(text)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        mm = re.match(r"^([^\s:][^:]*):\s*(.*)$", line)
        if mm:
            meta[mm.group(1).strip()] = mm.group(2).strip().strip('"')
    return meta, text[m.end():]


def render_md(path: Path) -> bytes:
    meta, body = front_matter(path.read_text(encoding="utf-8"))
    content = markdown.markdown(body, extensions=["tables", "fenced_code", "sane_lists"])
    title = meta.get("title") or meta.get("Title") or path.stem
    page = f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<link rel="stylesheet" href="/assets/articles.css" id="ed-articles-css-link">
<script src="/assets/articles-config.js"></script>
<script src="/assets/articles-style.js" defer></script>
<script src="/assets/site-inject.js" defer></script>
<script src="/assets/totop.js" defer></script>
<script src="/assets/sitenav.js" defer></script>
</head>
<body>
<main class="pv-wrap">
{content}
</main>
</body>
</html>
"""
    return page.encode("utf-8")


def should_skip(rel: Path) -> bool:
    parts = set(rel.parts)
    if parts & SKIP_DIRS:
        return True
    if rel.name in SKIP_FILES:
        return True
    return False


def build() -> tuple[int, int]:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    copied = rendered = 0
    for dirpath, dirnames, filenames in os.walk(DOCS):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        src_dir = Path(dirpath)
        rel_dir = src_dir.relative_to(DOCS)
        if should_skip(rel_dir) and rel_dir != Path("."):
            continue
        dst_dir = OUT / rel_dir
        dst_dir.mkdir(parents=True, exist_ok=True)
        for name in filenames:
            src = src_dir / name
            rel = src.relative_to(DOCS)
            if should_skip(rel):
                continue
            if src.suffix.lower() in SKIP_SUFFIXES:
                continue
            if src.suffix.lower() == ".md":
                if name.lower() == "index.md":
                    dst = dst_dir / "index.html"
                else:
                    dst = dst_dir / (src.stem + ".html")
                dst.write_bytes(render_md(src))
                rendered += 1
            else:
                shutil.copy2(src, dst_dir / name)
                copied += 1
    return rendered, copied


def make_zip() -> int:
    if ZIP.exists():
        ZIP.unlink()
    n = 0
    with zipfile.ZipFile(ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in OUT.rglob("*"):
            if not path.is_file():
                continue
            arc = path.relative_to(OUT).as_posix()
            # writestr + флаг UTF-8 — имена с кириллицей
            info = zipfile.ZipInfo(filename=arc)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.flag_bits |= 0x800
            zf.writestr(info, path.read_bytes())
            n += 1
    return n


def make_tgz() -> int:
    if TGZ.exists():
        TGZ.unlink()
    n = 0
    # PAX хранит имена в UTF-8 — на Linux-хостинге обычно без кракозябр
    with tarfile.open(TGZ, "w:gz", format=tarfile.PAX_FORMAT) as tf:
        for path in OUT.rglob("*"):
            if path.is_file():
                tf.add(path, arcname=path.relative_to(OUT).as_posix())
                n += 1
    return n


def main() -> int:
    print("Сборка", DOCS, "→", OUT)
    rendered, copied = build()
    print(f"HTML из Markdown: {rendered}, скопировано файлов: {copied} (исходные .md не копируются)")
    files = make_zip()
    print(f"ZIP: {ZIP} ({files} файлов, {ZIP.stat().st_size / 1024 / 1024:.1f} МБ)")
    files_t = make_tgz()
    print(f"TAR.GZ: {TGZ} ({files_t} файлов, {TGZ.stat().st_size / 1024 / 1024:.1f} МБ) — лучше для кириллицы")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
