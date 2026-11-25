# SPDX-License-Identifier: AGPL-3.0-or-later
# Собрать docs/data/exam-descs.json из docs/articles/exams/*.md (по YAML exam/sign).
# Запуск: python tools/exam_descs_from_md.py
from __future__ import annotations

import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "docs", "articles", "exams")
OUT = os.path.join(ROOT, "docs", "data", "exam-descs.json")

FM = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?(.*)\Z", re.S)


def parse_fm(fm: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in fm.splitlines():
        if ":" not in line or line.strip().startswith("-"):
            continue
        k, v = line.split(":", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def body_text(raw: str) -> str:
    t = raw.strip()
    t = re.sub(r"^#[^\n]*\n+", "", t)
    return t.strip()


def main() -> None:
    items: dict[str, dict] = {}
    for name in sorted(os.listdir(ART)):
        if not name.endswith(".md") or name == "index.md":
            continue
        text = open(os.path.join(ART, name), encoding="utf-8").read()
        m = FM.match(text)
        if not m:
            raise SystemExit(f"нет YAML: {name}")
        meta, body = parse_fm(m.group(1)), body_text(m.group(2))
        exam, sign = meta.get("exam", ""), meta.get("sign", "")
        if not exam or not sign:
            raise SystemExit(f"нет exam/sign: {name}")
        key = f"{exam}__{sign}"
        article = name[:-3]
        entry: dict = {
            "article": article,
            "body": body,
            "reply": meta.get("reply", "scale"),
            "label": meta.get("Title") or meta.get("title") or article,
        }
        if meta.get("from") and meta.get("to"):
            entry["from"] = meta["from"]
            entry["to"] = meta["to"]
        items[key] = entry

    payload = {
        "format": "electrodoctor-exam-descs",
        "about": "Тела описаний признаков осмотра из docs/articles/exams/. Ключ — examId__signId. Сборка: tools/exam_descs_from_md.py.",
        "items": items,
    }
    open(OUT, "w", encoding="utf-8", newline="\n").write(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    )
    print(f"{len(items)} → {OUT}")


if __name__ == "__main__":
    main()
