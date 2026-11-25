# SPDX-License-Identifier: AGPL-3.0-or-later
# Залить архив сайта в корень FTP (secrets/ftp.json).
# По умолчанию: tools/out/electrodoctor-site.tar.gz (если есть), иначе .zip
# Запуск: python tools/ftp_upload_zip.py [путь/к/архиву]
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from ftplib import FTP

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TGZ = ROOT / "tools" / "out" / "electrodoctor-site.tar.gz"
DEFAULT_ZIP = ROOT / "tools" / "out" / "electrodoctor-site.zip"
CFG = ROOT / "secrets" / "ftp.json"


def load_cfg():
    cfg = json.loads(CFG.read_text(encoding="utf-8"))
    raw = str(cfg.get("host") or cfg.get("server") or "").strip()
    port = int(cfg.get("port") or 21)
    m = re.match(r"^(?:ftp://)?([^:/]+)(?::(\d+))?$", raw)
    if not m:
        raise SystemExit("некорректный host в secrets/ftp.json")
    host = m.group(1)
    if m.group(2):
        port = int(m.group(2))
    return {
        "host": host,
        "port": port,
        "user": cfg["user"],
        "password": cfg["password"],
        "remote_dir": cfg.get("remote_dir") or "/",
    }


def main() -> int:
    if len(sys.argv) > 1:
        zip_path = Path(sys.argv[1])
    elif DEFAULT_TGZ.is_file():
        zip_path = DEFAULT_TGZ
    else:
        zip_path = DEFAULT_ZIP
    if not zip_path.is_file():
        raise SystemExit(f"нет архива: {zip_path}")
    cfg = load_cfg()
    remote_name = zip_path.name
    size_mb = zip_path.stat().st_size / 1024 / 1024
    print(f"FTP {cfg['host']}:{cfg['port']} user={cfg['user']}")
    print(f"Загрузка {zip_path.name} ({size_mb:.1f} МБ) → {cfg['remote_dir'].rstrip('/')}/{remote_name}")
    last_err: Exception | None = None
    for pasv in (True, False):
        mode = "passive" if pasv else "active"
        print(f"попытка ({mode})…")
        ftp = FTP()
        ftp.connect(cfg["host"], cfg["port"], timeout=600)
        ftp.login(cfg["user"], cfg["password"])
        ftp.encoding = "utf-8"
        try:
            ftp.sendcmd("OPTS UTF8 ON")
        except Exception:
            pass
        ftp.set_pasv(pasv)
        if cfg["remote_dir"] and cfg["remote_dir"] not in (".",):
            ftp.cwd(cfg["remote_dir"])
        print("pwd:", ftp.pwd())
        try:
            try:
                ftp.delete(remote_name)
            except Exception:
                pass
            with zip_path.open("rb") as f:
                ftp.storbinary(f"STOR {remote_name}", f, blocksize=64 * 1024)
            names = []
            ftp.retrlines("NLST", names.append)
            ok = any(n.replace("\\", "/").rstrip("/").endswith(remote_name) for n in names)
            size = None
            try:
                size = ftp.size(remote_name)
            except Exception:
                pass
            ftp.quit()
            if size is not None:
                print(f"размер на сервере: {size / 1024 / 1024:.1f} МБ")
            if not ok:
                print("предупреждение: имя не видно в NLST, но STOR без ошибки")
            print("Готово:", remote_name, f"({mode})")
            return 0
        except Exception as e:
            last_err = e
            print(f"не вышло ({mode}): {type(e).__name__}: {e}")
            try:
                ftp.quit()
            except Exception:
                pass
    raise SystemExit(f"загрузка не удалась: {last_err}")


if __name__ == "__main__":
    raise SystemExit(main())
