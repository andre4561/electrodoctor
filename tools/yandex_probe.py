# Проверка связи с Яндекс AI Studio и список доступных моделей. Ключ берётся из secrets/yandex.json.
import json, os, sys, urllib.request, urllib.error
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
cfg = json.load(open(os.path.join(ROOT, "secrets", "yandex.json"), encoding="utf-8-sig"))
H = {"Authorization": "Api-Key " + cfg["api_key"], "OpenAI-Project": cfg["folder_id"], "x-folder-id": cfg["folder_id"], "Content-Type": "application/json"}
def call(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, headers=H, method="POST" if body else "GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:500]
st, j = call("https://llm.api.cloud.yandex.net/v1/models")
print("models:", st)
if st == 200: print("\n".join(sorted(m.get("id", "") for m in j.get("data", []))))
else: print(j)
m = sys.argv[1] if len(sys.argv) > 1 else "yandexgpt-lite/latest"
st, j = call("https://llm.api.cloud.yandex.net/v1/chat/completions", {"model": f"gpt://{cfg['folder_id']}/{m}", "messages": [{"role": "user", "content": "Ответь одним словом: работает?"}], "max_tokens": 20})
print("chat", m, st, (j["choices"][0]["message"]["content"] if st == 200 else j))
