"""수집 스크립트 공통 함수 (표준 라이브러리만 사용)"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "docs", "data")
KST = timezone(timedelta(hours=9))

sys.stdout.reconfigure(encoding="utf-8")


def now_kst():
    return datetime.now(KST)


def load_config():
    with open(os.path.join(ROOT, "docs", "config.json"), encoding="utf-8") as f:
        return json.load(f)


def read_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def service_key(env_name):
    """공공데이터포털 키는 Encoding/Decoding 어느 쪽을 넣어도 동작하도록 디코딩해 둔다."""
    key = os.environ.get(env_name, "").strip()
    return urllib.parse.unquote(key) if key else ""


def http_get(url, params, retries=3, timeout=60):
    full = url + "?" + urllib.parse.urlencode(params)
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": "Mozilla/5.0 (sangga-status bot)"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"요청 실패: {url} ({last})")


def update_meta(section, info):
    path = os.path.join(DATA_DIR, "meta.json")
    meta = read_json(path, {})
    meta[section] = {**info, "updated": now_kst().strftime("%Y-%m-%d %H:%M")}
    write_json(path, meta)
