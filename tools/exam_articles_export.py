# SPDX-License-Identifier: AGPL-3.0-or-later
# Выгрузка описаний осмотра из src/app/exams.ts → docs/articles/exams/*.md
# и docs/data/exam-descs.json (тело для кабинета).
#
# Работает только если в BUILTIN ещё длинные desc (со \\n). После укорочения
# каркаса (article + from/to) пользуйтесь tools/exam_recover_descs.py —
# там эталон текстов — и tools/exam_write_ts.py для пересборки exams.ts.
#
# Запуск: python tools/exam_articles_export.py
from __future__ import annotations

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAMS_TS = os.path.join(ROOT, "src", "app", "exams.ts")
ART_DIR = os.path.join(ROOT, "docs", "articles", "exams")
DESCS_JSON = os.path.join(ROOT, "docs", "data", "exam-descs.json")

SCALE_ENDS = re.compile(r"^(.+?)\s*[—–−-]\s*(.+)$")


def parse_scale_ends(desc: str) -> tuple[str, str] | None:
    first = desc.split("\n", 1)[0].strip()
    m = SCALE_ENDS.match(first)
    if not m:
        return None
    a, b = m.group(1).strip(), m.group(2).strip()
    return (a, b) if a and b else None


def desc_body(desc: str) -> str:
    if not parse_scale_ends(desc):
        return desc.strip()
    i = desc.find("\n")
    return "" if i < 0 else desc[i + 1 :].strip()


def unescape_ts_string(s: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == "\\" and i + 1 < len(s):
            n = s[i + 1]
            if n == "n":
                out.append("\n")
            elif n == "r":
                out.append("\r")
            elif n == "t":
                out.append("\t")
            elif n in "\\\"'":
                out.append(n)
            else:
                out.append(n)
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


def extract_string(src: str, start: int) -> tuple[str, int] | None:
    """Строка в кавычках начиная с src[start]; start указывает на кавычку."""
    if start >= len(src) or src[start] not in "\"'":
        return None
    q = src[start]
    i = start + 1
    buf: list[str] = []
    while i < len(src):
        c = src[i]
        if c == "\\" and i + 1 < len(src):
            buf.append(src[i : i + 2])
            i += 2
            continue
        if c == q:
            return unescape_ts_string("".join(buf)), i + 1
        buf.append(c)
        i += 1
    return None


def skip_ws(src: str, i: int) -> int:
    while i < len(src) and src[i] in " \t\r\n":
        i += 1
    return i


def parse_builtin(src: str) -> list[dict]:
    """Список признаков: exam, examName, sign, label, reply, desc."""
    m = re.search(r"export const BUILTIN: ExamItem\[\] = \[", src)
    if not m:
        raise SystemExit("BUILTIN не найден в exams.ts")
    block = src[m.end() :]
    # до закрытия массива на уровне файла — ищем `];` после последнего E(
    end = block.rfind("\n];")
    if end < 0:
        raise SystemExit("конец BUILTIN не найден")
    block = block[:end]

    items: list[dict] = []
    # E("id", "group", "name", [
    for em in re.finditer(
        r'E\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"((?:\\.|[^"\\])*)"\s*,\s*\[',
        block,
    ):
        exam_id, group, exam_name = em.group(1), em.group(2), unescape_ts_string(em.group(3))
        # вырезать тело entries до парной ]
        start = em.end()
        depth = 1
        j = start
        while j < len(block) and depth:
            if block[j] in "\"'":
                got = extract_string(block, j)
                if not got:
                    break
                j = got[1]
                continue
            if block[j] == "[":
                depth += 1
            elif block[j] == "]":
                depth -= 1
            j += 1
        body = block[start : j - 1]
        parse_entries(body, exam_id, group, exam_name, items)
    return items


def parse_entries(body: str, exam_id: str, group: str, exam_name: str, items: list[dict]) -> None:
    i = 0
    while i < len(body):
        i = skip_ws(body, i)
        if i >= len(body):
            break
        if body.startswith("L(", i):
            i = parse_L(body, i + 2, exam_id, group, exam_name, items)
            continue
        if body.startswith("G(", i):
            i = parse_G(body, i + 2, exam_id, group, exam_name, items)
            continue
        # запятая или мусор
        i += 1


def parse_L(body: str, i: int, exam_id: str, group: str, exam_name: str, items: list[dict]) -> int:
    i = skip_ws(body, i)
    sid = extract_string(body, i)
    if not sid:
        raise SystemExit(f"L: нет id около {body[i:i+40]!r}")
    sign_id, i = sid
    i = skip_ws(body, i)
    if body[i] != ",":
        raise SystemExit("L: ожидалась запятая после id")
    i = skip_ws(body, i + 1)
    lab = extract_string(body, i)
    if not lab:
        raise SystemExit("L: нет label")
    label, i = lab
    i = skip_ws(body, i)
    if body[i] != ",":
        raise SystemExit("L: ожидалась запятая после label")
    i = skip_ws(body, i + 1)
    # reply: 1 или "scale"|"number"|"text"
    if body[i] == "1":
        reply = "scale"
        i += 1
    else:
        rp = extract_string(body, i)
        if not rp:
            raise SystemExit(f"L: нет reply около {body[i:i+20]!r}")
        reply, i = rp
        if reply not in ("scale", "number", "text"):
            reply = "scale"
    i = skip_ws(body, i)
    if body[i] != ",":
        raise SystemExit("L: ожидалась запятая после reply")
    i = skip_ws(body, i + 1)
    ds = extract_string(body, i)
    if not ds:
        raise SystemExit("L: нет desc")
    desc, i = ds
    i = skip_ws(body, i)
    if i < len(body) and body[i] == ")":
        i += 1
    items.append(
        {
            "exam": exam_id,
            "group": group,
            "examName": exam_name,
            "sign": sign_id,
            "label": label,
            "reply": reply,
            "desc": desc,
        }
    )
    return i


def parse_G(body: str, i: int, exam_id: str, group: str, exam_name: str, items: list[dict]) -> int:
    i = skip_ws(body, i)
    gid = extract_string(body, i)
    if not gid:
        raise SystemExit("G: нет id")
    _nest_id, i = gid
    i = skip_ws(body, i)
    if body[i] != ",":
        raise SystemExit("G: запятая")
    i = skip_ws(body, i + 1)
    nm = extract_string(body, i)
    if not nm:
        raise SystemExit("G: нет name")
    _nest_name, i = nm
    i = skip_ws(body, i)
    if body[i] != ",":
        raise SystemExit("G: запятая после name")
    i = skip_ws(body, i + 1)
    if body[i] != "[":
        raise SystemExit("G: ожидался [")
    i += 1
    depth = 1
    start = i
    while i < len(body) and depth:
        if body[i] in "\"'":
            got = extract_string(body, i)
            if not got:
                break
            i = got[1]
            continue
        if body[i] == "[":
            depth += 1
        elif body[i] == "]":
            depth -= 1
        i += 1
    inner = body[start : i - 1]
    parse_entries(inner, exam_id, group, exam_name, items)
    i = skip_ws(body, i)
    if i < len(body) and body[i] == ")":
        i += 1
    return i


def yaml_escape(s: str) -> str:
    if re.search(r'[:#{}[\],&*?|>!%@`]|^\s|\s$', s) or "\n" in s or s in ("true", "false", "null"):
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return s


def safe_filename(name: str) -> str:
    """Имя файла без слэшей и прочих запрещённых в путях символов."""
    name = name.replace("/", " — ").replace("\\", " — ").replace(":", " — ")
    name = re.sub(r'[<>"|?*]', "", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    name = re.sub(r"( — )+", " — ", name)
    return name or "без названия"


def unique_titles(items: list[dict]) -> None:
    seen: dict[str, int] = {}
    for it in items:
        base = safe_filename(it["label"])
        n = seen.get(base, 0)
        seen[base] = n + 1
        if n == 0:
            it["article"] = base
        else:
            it["article"] = safe_filename(f"{base} ({it['exam']})")


def write_article(it: dict) -> str:
    ends = parse_scale_ends(it["desc"]) if it["reply"] == "scale" else None
    body = desc_body(it["desc"]) if it["reply"] == "scale" else it["desc"].strip()
    title = it["label"]
    lines = ["---", f"Title: {title}", "Рубрики: осмотр", f"exam: {it['exam']}", f"sign: {it['sign']}", f"reply: {it['reply']}"]
    if ends:
        lines.append(f"from: {yaml_escape(ends[0])}")
        lines.append(f"to: {yaml_escape(ends[1])}")
    lines.append("---")
    lines.append("")
    lines.append(f"# {title}")
    lines.append("")
    if body:
        # абзацы: строки через \n в исходнике — отдельные абзацы
        for para in body.split("\n"):
            para = para.strip()
            if para:
                lines.append(para)
                lines.append("")
    while lines and lines[-1] == "":
        lines.pop()
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    src = open(EXAMS_TS, encoding="utf-8").read()
    items = parse_builtin(src)
    if not items:
        raise SystemExit("не разобрано ни одного признака")
    unique_titles(items)
    os.makedirs(ART_DIR, exist_ok=True)
    # убрать старые .md кроме index
    for f in os.listdir(ART_DIR):
        if f.endswith(".md") and f != "index.md":
            os.remove(os.path.join(ART_DIR, f))

    descs: dict[str, dict] = {}
    for it in items:
        path = os.path.join(ART_DIR, it["article"] + ".md")
        open(path, "w", encoding="utf-8", newline="\n").write(write_article(it))
        key = f"{it['exam']}__{it['sign']}"
        ends = parse_scale_ends(it["desc"]) if it["reply"] == "scale" else None
        body = desc_body(it["desc"]) if it["reply"] == "scale" else it["desc"].strip()
        entry: dict = {"article": it["article"], "body": body, "reply": it["reply"], "label": it["label"]}
        if ends:
            entry["from"] = ends[0]
            entry["to"] = ends[1]
        descs[key] = entry

    payload = {
        "format": "electrodoctor-exam-descs",
        "about": "Тела описаний признаков осмотра (из docs/articles/exams/). Ключ — examId__signId. Собирает tools/exam_articles_export.py.",
        "items": descs,
    }
    os.makedirs(os.path.dirname(DESCS_JSON), exist_ok=True)
    open(DESCS_JSON, "w", encoding="utf-8", newline="\n").write(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    )

    # подсказка для ручного/авто slim: article + from/to
    slim_path = os.path.join(ROOT, "tools", "out", "exam_slim_hints.json")
    os.makedirs(os.path.dirname(slim_path), exist_ok=True)
    hints = []
    for it in items:
        h = {"exam": it["exam"], "sign": it["sign"], "label": it["label"], "reply": it["reply"], "article": it["article"]}
        ends = parse_scale_ends(it["desc"]) if it["reply"] == "scale" else None
        if ends:
            h["from"] = ends[0]
            h["to"] = ends[1]
        hints.append(h)
    open(slim_path, "w", encoding="utf-8", newline="\n").write(json.dumps(hints, ensure_ascii=False, indent=2) + "\n")

    print(f"статей: {len(items)} → {ART_DIR}")
    print(f"описания: {DESCS_JSON}")
    print(f"подсказки slim: {slim_path}")


if __name__ == "__main__":
    main()
