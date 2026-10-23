"""2. 상가 임대 통계 — 한국부동산원 R-ONE 상업용부동산 임대동향조사 수집

상가 임대차는 신고 의무가 없어 '신고 자료'가 존재하지 않는다.
국가 공식 상가 임대 통계는 한국부동산원 임대동향조사(분기, 표본조사)가 유일하다.

R-ONE 은 같은 지표를 기간별 통계표로 쪼개 둔다
(예: '임대동향 지역별 임대료(2022년~)_중대형 상가', '…(2024년3분기~)_중대형 상가').
여기서는 지표×상가유형별로 그 표들을 하나의 시계열로 합친다.

환경변수 RONE_KEY : R-ONE 인증키 (reb.or.kr/r-one → Open API → 인증키 발급)
출력: docs/data/rone/catalog.json, docs/data/rone/{지표}_{유형}.json
"""
import json
import os
import re
from datetime import datetime

from common import DATA_DIR, http_get, load_config, now_kst, read_json, service_key, update_meta, write_json

BASE = "https://www.reb.or.kr/r-one/openapi/"
PAGE = 1000
STALE_DAYS = 7
NAME_RE = re.compile(r"^임대동향 지역별 (임대료|공실률|임대가격지수|전환율)\((.+?)\)_(.+)$")
METRICS = {"임대료": "rent", "공실률": "vacancy", "임대가격지수": "index", "전환율": "conv"}
TYPES = {"중대형 상가": "large", "소규모 상가": "small", "집합 상가": "unit", "일반 상가": "general",
         "일반 상가(1층)": "general1f", "통합 상가": "all", "오피스": "office"}
TYPE_ORDER = list(TYPES)


def call(endpoint, key, **params):
    text = http_get(BASE + endpoint, {"KEY": key, "Type": "json", **params})
    d = json.loads(text)
    name = endpoint.replace(".do", "")
    if name not in d:
        raise RuntimeError(f"R-ONE 오류: {text[:200]}")
    head, body = d[name][0]["head"], (d[name][1]["row"] if len(d[name]) > 1 else [])
    total = next((h["list_total_count"] for h in head if "list_total_count" in h), 0)
    return total, body


def fetch_all(endpoint, key, **params):
    rows, page = [], 1
    while True:
        total, body = call(endpoint, key, pIndex=page, pSize=PAGE, **params)
        rows += body
        if page * PAGE >= total or not body:
            return rows
        page += 1


def main():
    key = service_key("RONE_KEY")
    if not key:
        print("RONE_KEY 가 없어 임대 통계 수집을 건너뜁니다.")
        return
    cfg = load_config()
    start = str(cfg["rone_start_year"])

    groups = {}
    for t in fetch_all("SttsApiTbl.do", key):
        m = NAME_RE.match(t["STATBL_NM"].strip())
        if m and m.group(1) in METRICS and m.group(3) in TYPES and "QY" in (t.get("DTACYCLE_CD") or ""):
            groups.setdefault((m.group(1), m.group(3)), []).append(t)
    print(f"지표×유형 {len(groups)}개")

    catalog = []
    for (metric, typ), tables in sorted(groups.items(), key=lambda x: (list(METRICS).index(x[0][0]), TYPE_ORDER.index(x[0][1]))):
        gid = f"{METRICS[metric]}_{TYPES[typ]}"
        path = os.path.join(DATA_DIR, "rone", f"{gid}.json")
        old = read_json(path)
        fresh = old and (now_kst().replace(tzinfo=None) - datetime.fromisoformat(old["fetched"])).days < STALE_DAYS
        if not fresh:
            # 데이터 끝 연도가 늦은 표가 같은 시점에서 우선하도록 오래된 표부터 덮어쓴다
            tables.sort(key=lambda t: (t.get("DATA_END_YY") or "9999", t.get("DATA_START_YY") or "9999"))
            merged, unit, desc = {}, "", {}
            for t in tables:
                if (t.get("DATA_END_YY") or "9999") < start:
                    continue
                for r in fetch_all("SttsApiTblData.do", key, STATBL_ID=t["STATBL_ID"], DTACYCLE_CD="QY"):
                    when = str(r.get("WRTTIME_IDTFR_ID") or "")
                    if r.get("DTA_VAL") is None or when[:4] < start:
                        continue
                    cls = (r.get("CLS_FULLNM") or r.get("CLS_NM") or "").strip()
                    if not cls:
                        continue
                    itm = r.get("ITM_FULLNM") or r.get("ITM_NM") or metric
                    merged.setdefault(cls, {}).setdefault(itm, {})[when] = r["DTA_VAL"]
                    unit = r.get("UI_NM") or unit
                    desc[when] = r.get("WRTTIME_DESC") or when
            series = {c: {i: sorted(v.items()) for i, v in items.items()} for c, items in merged.items()}
            old = {"id": gid, "metric": metric, "type": typ, "name": f"{typ} {metric}", "unit": unit,
                   "times": dict(sorted(desc.items())),
                   "fetched": now_kst().replace(tzinfo=None).isoformat(timespec="seconds"),
                   "series": series}
            write_json(path, old)
            print(f"  {typ} {metric}: 통계표 {len(tables)}개 → 지역·상권 {len(series)}개, 시점 {len(desc)}개")
        if old["series"]:
            catalog.append({"id": gid, "metric": metric, "type": typ, "name": old["name"], "unit": old["unit"],
                            "regions": len(old["series"]), "last": list(old["times"].values())[-1] if old["times"] else ""})

    write_json(os.path.join(DATA_DIR, "rone", "catalog.json"), catalog)
    update_meta("rone", {"tables": len(catalog)})


if __name__ == "__main__":
    main()
