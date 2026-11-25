# SPDX-License-Identifier: AGPL-3.0-or-later
# Удалить на FTP старый мусор сайта перед новой выкладкой.
# Удаляет: articles/, assets/css/, analytics*, _includes/, корневые .md
# Запуск: python tools/ftp_clean_site.py
from __future__ import annotations

import json
import re
import time
from ftplib import FTP, error_perm
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
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


class FtpSession:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.ftp: FTP | None = None
        self.connect()

    def connect(self) -> None:
        if self.ftp:
            try:
                self.ftp.quit()
            except Exception:
                try:
                    self.ftp.close()
                except Exception:
                    pass
        ftp = FTP()
        ftp.connect(self.cfg["host"], self.cfg["port"], timeout=120)
        ftp.login(self.cfg["user"], self.cfg["password"])
        ftp.encoding = "utf-8"
        try:
            ftp.sendcmd("OPTS UTF8 ON")
        except Exception:
            pass
        ftp.set_pasv(True)
        rd = self.cfg["remote_dir"]
        if rd and rd not in (".",):
            ftp.cwd(rd)
        self.ftp = ftp
        print("переподключение, pwd:", ftp.pwd())

    def with_retry(self, fn, *args, tries: int = 5):
        last: Exception | None = None
        for i in range(tries):
            try:
                assert self.ftp is not None
                return fn(self.ftp, *args)
            except (EOFError, OSError, TimeoutError, ConnectionError) as e:
                last = e
                print(f"  обрыв ({type(e).__name__}), повтор {i + 1}/{tries}…")
                time.sleep(1 + i)
                self.connect()
            except error_perm as e:
                # 550 и т.п. — не сетевой сбой
                raise e
        raise last  # type: ignore[misc]


def nlst(ftp: FTP, path: str) -> list[str]:
    names: list[str] = []
    try:
        ftp.retrlines(f"NLST {path}", names.append)
    except error_perm:
        return []
    out = []
    for n in names:
        n = n.replace("\\", "/").rstrip("/")
        base = n.split("/")[-1]
        if base in (".", "..", ""):
            continue
        out.append(n if "/" in path.rstrip("/") else f"{path.rstrip('/')}/{base}" if path not in (".", "/") else base)
        # если NLST вернул только basename
        if "/" not in n and path not in (".", "/"):
            out[-1] = f"{path.rstrip('/')}/{base}"
        elif "/" not in n:
            out[-1] = base
    # нормализуем
    fixed = []
    for n in out:
        if n.startswith("./"):
            n = n[2:]
        fixed.append(n)
    return fixed


def is_dir(ftp: FTP, name: str) -> bool:
    cur = ftp.pwd()
    try:
        ftp.cwd(name)
        ftp.cwd(cur)
        return True
    except error_perm:
        return False
    except Exception:
        try:
            ftp.cwd(cur)
        except Exception:
            pass
        raise


def rm_tree(sess: FtpSession, path: str, stats: dict) -> None:
    def list_children(ftp: FTP) -> list[str]:
        names: list[str] = []
        try:
            ftp.cwd(path)
        except error_perm:
            return []
        try:
            ftp.retrlines("NLST", names.append)
        except error_perm:
            names = []
        # вернуться в корень remote_dir
        rd = sess.cfg["remote_dir"]
        if rd and rd not in (".",):
            ftp.cwd(rd)
        else:
            ftp.cwd("/")
        children = []
        for n in names:
            base = n.replace("\\", "/").rstrip("/").split("/")[-1]
            if base in (".", "..", ""):
                continue
            children.append(f"{path.rstrip('/')}/{base}")
        return children

    children = sess.with_retry(lambda ftp: list_children(ftp))
    for child in children:
        def check(ftp: FTP, p: str = child) -> bool:
            return is_dir(ftp, p)

        try:
            directory = sess.with_retry(check)
        except error_perm:
            directory = False
        if directory:
            rm_tree(sess, child, stats)
        else:
            def delete_file(ftp: FTP, p: str = child) -> None:
                ftp.delete(p)
                stats["files"] += 1
                if stats["files"] % 100 == 0:
                    print(f"  удалено файлов: {stats['files']}…")

            try:
                sess.with_retry(delete_file)
            except error_perm as e:
                print(f"  пропуск файла {child}: {e}")

    def rmdir(ftp: FTP) -> None:
        ftp.rmd(path)
        stats["dirs"] += 1

    try:
        sess.with_retry(rmdir)
        print(f"  каталог удалён: {path}")
    except error_perm as e:
        print(f"  не удалось rmd {path}: {e}")


def main() -> int:
    cfg = load_cfg()
    sess = FtpSession(cfg)
    stats = {"files": 0, "dirs": 0}

    print("удаляю articles/ …")
    try:
        if sess.with_retry(lambda ftp: is_dir(ftp, "articles")):
            rm_tree(sess, "articles", stats)
        else:
            print("  articles/ нет")
    except error_perm:
        print("  articles/ нет")

    print("удаляю assets/css/ …")
    try:
        if sess.with_retry(lambda ftp: is_dir(ftp, "assets/css")):
            rm_tree(sess, "assets/css", stats)
        else:
            print("  assets/css/ нет")
    except error_perm:
        print("  assets/css/ нет")

    print("удаляю _includes/ …")
    try:
        if sess.with_retry(lambda ftp: is_dir(ftp, "_includes")):
            rm_tree(sess, "_includes", stats)
        else:
            print("  _includes/ нет")
    except error_perm:
        print("  _includes/ нет")

    # analytics* и корневые .md
    print("удаляю analytics* и корневые .md …")

    def list_root(ftp: FTP) -> list[str]:
        names: list[str] = []
        ftp.retrlines("NLST", names.append)
        return [n.replace("\\", "/").rstrip("/").split("/")[-1] for n in names]

    root_names = sess.with_retry(list_root)
    for name in root_names:
        if name in (".", "..", ""):
            continue
        low = name.lower()
        drop = low.startswith("analytics") or (low.endswith(".md") and "/" not in name)
        if not drop:
            continue

        def remove_one(ftp: FTP, n: str = name) -> None:
            if is_dir(ftp, n):
                # на всякий случай дерево
                raise error_perm("dir")
            ftp.delete(n)
            stats["files"] += 1
            print(f"  удалён: {n}")

        try:
            sess.with_retry(remove_one)
        except error_perm:
            try:
                rm_tree(sess, name, stats)
            except Exception as e:
                print(f"  пропуск {name}: {e}")

    # старые архивы выкладки — оставить место под новый
    for arch in ("electrodoctor-site.zip", "electrodoctor-site.tar.gz", "docs.zip"):
        def del_arch(ftp: FTP, n: str = arch) -> None:
            ftp.delete(n)
            print(f"  удалён архив: {n}")

        try:
            sess.with_retry(del_arch)
            stats["files"] += 1
        except error_perm:
            pass

    try:
        assert sess.ftp is not None
        sess.ftp.quit()
    except Exception:
        pass
    print(f"Готово. Файлов: {stats['files']}, каталогов: {stats['dirs']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
