"""수집 데이터를 Supabase Storage(비공개 버킷 data)와 주고받는다.

  python scripts/supabase_sync.py pull   # 버킷 → docs/data (이전 수집분을 이어서 쓰기 위해)
  python scripts/supabase_sync.py push   # docs/data → 버킷 (pull 이후 바뀐 파일만)

환경변수 SUPABASE_URL, SUPABASE_SERVICE_KEY (서버용 비밀 키 — GitHub Secrets 에만 둔다)
"""
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from common import DATA_DIR, ROOT

BUCKET = "data"
HASHES = os.path.join(ROOT, ".sync_hashes.json")


def env():
    url, key = os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_KEY 가 없습니다.")
    return url, key


def request(method, url, key, body=None, ctype="application/json", extra=None):
    headers = {"apikey": key, "Content-Type": ctype, **(extra or {})}
    if key.startswith("eyJ"):  # 예전 JWT 형식 키는 Authorization 헤더도 필요
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code < 500 or i == 2:
                raise RuntimeError(f"{method} {url} → {e.code} {e.read()[:200]!r}")
        except urllib.error.URLError:
            if i == 2:
                raise


def list_all(url, key, prefix=""):
    """버킷 안 파일 경로를 재귀로 모은다."""
    out, offset = [], 0
    while True:
        body = json.dumps({"prefix": prefix, "limit": 1000, "offset": offset}).encode()
        rows = json.loads(request("POST", f"{url}/storage/v1/object/list/{BUCKET}", key, body))
        for r in rows:
            path = f"{prefix}{r['name']}"
            if r.get("id") is None:  # 폴더
                out += list_all(url, key, path + "/")
            else:
                out.append(path)
        if len(rows) < 1000:
            return out
        offset += 1000


def md5(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def local_files():
    for base, _, files in os.walk(DATA_DIR):
        for name in files:
            if name.endswith(".json"):
                full = os.path.join(base, name)
                yield os.path.relpath(full, DATA_DIR).replace(os.sep, "/"), full


def pull():
    url, key = env()
    paths = list_all(url, key)

    def get(p):
        data = request("GET", f"{url}/storage/v1/object/{BUCKET}/{p}", key)
        full = os.path.join(DATA_DIR, p)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(data)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(get, paths))
    with open(HASHES, "w", encoding="utf-8") as f:
        json.dump({p: md5(full) for p, full in local_files()}, f)
    print(f"내려받음 {len(paths)}개")


def push():
    url, key = env()
    try:
        with open(HASHES, encoding="utf-8") as f:
            before = json.load(f)
    except FileNotFoundError:
        before = {}
    changed = [(p, full) for p, full in local_files() if before.get(p) != md5(full)]

    def put(item):
        p, full = item
        with open(full, "rb") as f:
            request("POST", f"{url}/storage/v1/object/{BUCKET}/{p}", key, f.read(),
                    extra={"x-upsert": "true", "cache-control": "no-cache"})

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(put, changed))
    with open(HASHES, "w", encoding="utf-8") as f:
        json.dump({p: md5(full) for p, full in local_files()}, f)
    print(f"올림 {len(changed)}개")


if __name__ == "__main__":
    {"pull": pull, "push": push}[sys.argv[1] if len(sys.argv) > 1 else ""]()
