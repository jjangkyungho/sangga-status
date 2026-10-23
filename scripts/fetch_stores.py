"""3. 상권 현황 — 소상공인시장진흥공단 상가(상권)정보 수집 (분기 갱신 자료)

환경변수 DATA_GO_KR_KEY : 공공데이터포털 인증키 (상가(상권)정보 API 활용신청 필요)
출력: docs/data/stores/{시군구코드}.json — 업종·행정동별 점포 수 집계와 기준월별 이력
"""
import json
import os
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from common import DATA_DIR, http_get, load_config, now_kst, read_json, service_key, update_meta, write_json

URL = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong"
STALE_DAYS = 30


KEEP = ("indsLclsNm", "indsMclsNm", "adongNm")  # 집계에 쓰는 필드만 메모리에 남긴다
WORKERS = 8


def fetch_page(key, code, page):
    text = http_get(URL, {"serviceKey": key, "divId": "signguCd", "key": code,
                          "type": "json", "pageNo": page, "numOfRows": 1000}, timeout=120)
    try:
        d = json.loads(text)
    except json.JSONDecodeError:
        raise RuntimeError(f"상가정보 API 오류 {code} p{page}: {text[:200]}")
    head = d.get("header", {})
    if head.get("resultCode") == "03":  # 데이터 없음
        return [], 0, head.get("stdrYm")
    if head.get("resultCode") not in ("00", "0", None):
        raise RuntimeError(f"상가정보 API 오류 {code}: {head.get('resultMsg')}")
    body = d.get("body", {})
    items = [{k: i.get(k) for k in KEEP} for i in body.get("items") or []]
    return items, int(body.get("totalCount") or 0), head.get("stdrYm")


def fetch_sgg(key, code):
    """첫 페이지로 전체 건수를 알아낸 뒤 나머지 페이지는 동시에 받는다."""
    items, total, stdr = fetch_page(key, code, 1)
    pages = range(2, (total + 999) // 1000 + 1)
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for batch, _, _ in pool.map(lambda p: fetch_page(key, code, p), pages):
            items += batch
    return items, stdr


def main():
    key = service_key("DATA_GO_KR_KEY")
    if not key:
        print("DATA_GO_KR_KEY 가 없어 상권 수집을 건너뜁니다.")
        return
    cfg = load_config()
    errors = []
    budget = int(os.environ.get("STORES_MAX_CALLS") or cfg.get("stores_max_calls", 9000))
    today = now_kst().strftime("%Y-%m-%d")
    # 전국 점포는 호출량이 많아(약 2,500회) 하루 한도 안에서 오래된 지역부터 나눠 받는다
    queue = []
    for reg in cfg["regions"]:
        old = read_json(os.path.join(DATA_DIR, "stores", f"{reg['code']}.json"), {})
        if (now_kst().replace(tzinfo=None) - datetime.fromisoformat(old.get("fetched", "2000-01-01"))).days >= STALE_DAYS:
            queue.append((old.get("fetched", ""), reg, old.get("total", 5000)))
    queue.sort(key=lambda x: x[0])
    print(f"갱신 대상 {len(queue)}개 지역, 호출 한도 {budget}회")
    for _, reg, est in queue:
        need = est // 1000 + 1
        if need > budget:
            continue
        budget -= need
        path = os.path.join(DATA_DIR, "stores", f"{reg['code']}.json")
        try:
            items, stdr = fetch_sgg(key, reg["code"])
        except Exception as e:
            errors.append(str(e))
            continue
        stdr = stdr or now_kst().strftime("%Y%m")
        by_l = Counter(i.get("indsLclsNm") or "기타" for i in items)
        by_m = Counter(f"{i.get('indsLclsNm') or '기타'} > {i.get('indsMclsNm') or '기타'}" for i in items)
        by_dong = defaultdict(Counter)
        for i in items:
            by_dong[i.get("adongNm") or "미상"][i.get("indsLclsNm") or "기타"] += 1
        old = read_json(path, {})
        history = old.get("history", {})
        history[stdr] = {"total": len(items), "byL": dict(by_l)}
        write_json(path, {
            "code": reg["code"], "name": reg["name"], "stdrYm": stdr, "total": len(items), "fetched": today,
            "byL": dict(by_l.most_common()), "byM": dict(by_m.most_common(40)),
            "byDong": {k: dict(v) for k, v in sorted(by_dong.items())},
            "history": dict(sorted(history.items())),
        })
        print(f"{reg['name']}: 점포 {len(items)}개 (기준 {stdr})")
    update_meta("stores", {"errors": errors[:20]})
    if errors:
        print("오류:\n" + "\n".join(errors[:10]))
        if len(errors) == len(cfg["regions"]):
            raise SystemExit(1)


if __name__ == "__main__":
    main()
