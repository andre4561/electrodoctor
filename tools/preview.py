# SPDX-License-Identifier: AGPL-3.0-or-later
# Локальный просмотр сайта Электродоктора (папка docs/) так, как его показывает GitHub Pages.
#
# GitHub собирает страницы из Markdown сборщиком Jekyll. Этот сервер делает то же на лету:
# адрес …/статья.html открывает статья.md, адрес папки — её index.md; HTML, JS и CSS
# отдаются как есть. Нужен Python 3 и пакет markdown (pip install markdown).
#
# Запуск:  python tools/preview.py            → http://localhost:8000/
#          python tools/preview.py 8080       → на другом порту
#
# Посредник для провайдеров ИИ, которые не принимают запросы прямо из браузера (YandexGPT):
#   /proxy/<хост>/<путь> → https://<хост>/<путь>. Пересылаются только хосты из PROXY_HOSTS,
#   сервер слушает только этот компьютер (127.0.0.1), ничего не записывает и не хранит.
import html, os, re, sys, urllib.error, urllib.parse, urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import markdown

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "docs"))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

PROXY_HOSTS = {"ai.api.cloud.yandex.net", "llm.api.cloud.yandex.net", "gigachat.devices.sberbank.ru"}
PASS_HEADERS = {"authorization", "content-type", "openai-project", "x-folder-id", "x-data-logging-enabled", "accept"}

CSS = """
:root { color-scheme: light dark; }
body { margin: 0; font: 16px/1.6 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #24292e; background: #fff; }
.pv-top { border-bottom: 1px solid #e1e4e8; padding: 14px 16px; }
.pv-top a { font-weight: 600; color: #24292e; text-decoration: none; }
.pv-wrap { max-width: 1012px; margin: 0 auto; padding: 24px 16px 48px; }
a { color: #0366d6; }
h1, h2 { border-bottom: 1px solid #eaecef; padding-bottom: .3em; }
table { border-collapse: collapse; display: block; overflow-x: auto; margin: 16px 0; }
th, td { border: 1px solid #dfe2e5; padding: 6px 13px; }
tr:nth-child(2n) { background: #f6f8fa; }
code { background: rgba(27,31,35,.05); padding: .2em .4em; border-radius: 3px; font-size: 85%; }
pre { background: #f6f8fa; padding: 16px; overflow: auto; border-radius: 6px; }
pre code { background: none; padding: 0; }
blockquote { margin: 0; padding: 0 1em; color: #6a737d; border-left: .25em solid #dfe2e5; }
img { max-width: 100%; }
.pv-note { font-size: 12px; color: #6a737d; border-top: 1px solid #e1e4e8; margin-top: 40px; padding-top: 12px; }
@media (prefers-color-scheme: dark) {
  body { background: #0d1117; color: #c9d1d9; }
  .pv-top a { color: #c9d1d9; }
  .pv-top, h1, h2, .pv-note { border-color: #30363d; }
  a { color: #58a6ff; }
  th, td { border-color: #30363d; }
  tr:nth-child(2n), pre { background: #161b22; }
}
"""

def front_matter(text):
    m = re.match(r"﻿?---\r?\n(.*?)\r?\n---\r?\n", text, re.S)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        mm = re.match(r"^([^\s:][^:]*):\s*(.*)$", line)
        if mm:
            meta[mm.group(1).strip()] = mm.group(2).strip().strip('"')
    return meta, text[m.end():]

def render(path):
    meta, body = front_matter(open(path, encoding="utf-8").read())
    # как в Jekyll: ссылки на .md-статьи работают и как .html
    content = markdown.markdown(body, extensions=["tables", "fenced_code", "sane_lists"])
    title = meta.get("title") or meta.get("Title") or os.path.splitext(os.path.basename(path))[0]
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{html.escape(title)}</title>
<style>{CSS}</style></head><body>
<main class="pv-wrap">{content}
<p class="pv-note">Локальный просмотр (tools/preview.py). На GitHub Pages оформление чуть другое.</p></main>
<script src="/assets/totop.js" defer></script>
<script src="/assets/sitenav.js" defer></script>
</body></html>""".encode("utf-8")

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # правки видны сразу после F5
        super().end_headers()

    def md_for(self):
        rel = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path).lstrip("/")
        full = os.path.normpath(os.path.join(ROOT, rel))
        if not full.startswith(ROOT):
            return None
        if os.path.isdir(full):
            if os.path.exists(os.path.join(full, "index.html")):
                return None
            cand = os.path.join(full, "index.md")
        elif full.endswith(".html") and not os.path.exists(full):
            cand = full[:-5] + ".md"
        elif full.endswith(".md"):
            cand = full
        else:
            return None
        return cand if os.path.isfile(cand) else None

    # ---------- посредник ----------
    def proxy(self, method):
        rest = self.path[len("/proxy/"):]
        host, _, tail = rest.partition("/")
        if host == "ping":
            return self.reply(200, b'{"ok": true}', "application/json")
        if host not in PROXY_HOSTS:
            return self.reply(403, ('{"error": {"message": "посредник пересылает только на: ' + ", ".join(sorted(PROXY_HOSTS)) + '"}}').encode("utf-8"), "application/json")
        body = None
        if method == "POST":
            body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        headers = {k: v for k, v in self.headers.items() if k.lower() in PASS_HEADERS}
        req = urllib.request.Request("https://" + host + "/" + tail, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return self.reply(r.status, r.read(), r.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:
            return self.reply(e.code, e.read(), e.headers.get("Content-Type", "application/json"))
        except Exception as e:
            msg = str(e).replace('"', "'")
            return self.reply(502, ('{"error": {"message": "посредник не достучался до ' + host + ": " + msg + '"}}').encode("utf-8"), "application/json")

    def reply(self, code, data, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path.startswith("/proxy/"):
            return self.proxy("POST")
        self.send_error(405)

    def do_GET(self):
        if self.path.startswith("/proxy/"):
            return self.proxy("GET")
        md = self.md_for()
        if md is None:
            return super().do_GET()
        if os.path.isdir(os.path.normpath(os.path.join(ROOT, urllib.parse.unquote(urllib.parse.urlsplit(self.path).path).lstrip("/")))) and not self.path.split("?")[0].endswith("/"):
            self.send_response(301); self.send_header("Location", self.path + "/"); self.end_headers(); return
        data = render(md)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass

if __name__ == "__main__":
    print(f"Просмотр сайта: http://localhost:{PORT}/   (папка {ROOT}; остановить — Ctrl+C)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
