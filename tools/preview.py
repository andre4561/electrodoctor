# SPDX-License-Identifier: AGPL-3.0-or-later
# Локальный просмотр сайта Электродоктора (папка docs/).
#
# GitHub собирает страницы из Markdown сборщиком Jekyll. Этот сервер делает то же на лету:
# адрес …/статья.html открывает статья.md, адрес папки — её index.md; HTML, JS и CSS
# отдаются как есть. Нужен Python 3 и пакет markdown (pip install markdown).
#
# Запуск:  python tools/preview.py            → http://localhost:8000/
#          python tools/preview.py 8080       → на другом порту
#
# Посредник для провайдеров ИИ (YandexGPT и др.):
#   /proxy/<хост>/<путь> → https://<хост>/<путь>. Только хосты из PROXY_HOSTS, только 127.0.0.1.
import html, os, re, sys, urllib.error, urllib.parse, urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import markdown

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "docs"))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

PROXY_HOSTS = {"ai.api.cloud.yandex.net", "llm.api.cloud.yandex.net", "gigachat.devices.sberbank.ru"}
PASS_HEADERS = {"authorization", "content-type", "openai-project", "x-folder-id", "x-data-logging-enabled", "accept"}

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
    content = markdown.markdown(body, extensions=["tables", "fenced_code", "sane_lists"])
    title = meta.get("title") or meta.get("Title") or os.path.splitext(os.path.basename(path))[0]
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{html.escape(title)}</title>
<script src="/assets/theme.js"></script>
<link rel="stylesheet" href="/assets/articles.css" id="ed-articles-css-link">
<script src="/assets/articles-config.js"></script>
<script src="/assets/articles-style.js" defer></script>
<script src="/assets/site-inject.js" defer></script>
</head><body>
<main class="pv-wrap">{content}</main>
<script src="/assets/totop.js" defer></script>
<script src="/assets/sitenav.js" defer></script>
</body></html>""".encode("utf-8")

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
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
