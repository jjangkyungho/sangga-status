"""1. 상가 매매 현황 — 국토교통부 상업업무용 부동산 매매 실거래가 수집

환경변수 DATA_GO_KR_KEY : 공공데이터포털 인증키
출력: docs/data/trade/{시군구코드}.json, docs/data/trade/summary.json
"""
import os
import statistics
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

from common import DATA_DIR, http_get, load_config, now_kst, read_json, service_key, update_meta, write_json

URL = "https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade"
# 사이트에서 쓰는 열 순서 (app.js 의 TRADE_COLS 와 같아야 함)
COLS = ["date", "umd", "jibun", "type", "use", "landUse", "floor", "amount",
        "bldAr", "landAr", "buildYear", "gbn", "canceled", "share"]
PYEONG = 3.3058
WORKERS = 6  # 동시 요청 수 (전국 256개 시군구)


def months_back(n):
    d = now_kst()
    y, m = d.year, d.month
    out = []
    for _ in range(n):
        out.append(f"{y}{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out


def num(s, cast=float):
    s = (s or "").replace(",", "").strip()
    try:
        return cast(float(s)) if s else None
    except ValueError:
        return None


def fetch_month(key, lawd, ym):
    rows, page = [], 1
    while True:
        text = http_get(URL, {"serviceKey": key, "LAWD_CD": lawd, "DEAL_YMD": ym,
                              "pageNo": page, "numOfRows": 1000})
        root = ET.fromstring(text)
        code = (root.findtext(".//resultCode") or "").strip()
        if code not in ("000", "00"):
            msg = root.findtext(".//resultMsg") or root.findtext(".//returnAuthMsg") or text[:200]
            raise RuntimeError(f"API 오류 {lawd} {ym}: {code} {msg}")
        items = root.findall(".//item")
        for it in items:
            g = lambda k: (it.findtext(k) or "").strip()
            rows.append([
                f"{g('dealYear')}-{int(g('dealMonth') or 0):02d}-{int(g('dealDay') or 0):02d}",
                g("umdNm"), g("jibun"), g("buildingType"), g("buildingUse"), g("landUse"),
                num(g("floor"), int), num(g("dealAmount"), int),
                num(g("buildingAr")), num(g("plottageAr")), num(g("buildYear"), int),
                g("dealingGbn"), 1 if g("cdealType") else 0, g("shareDealingType"),
            ])
        total = int(root.findtext(".//totalCount") or 0)
        if page * 1000 >= total or not items:
            return rows
        page += 1


def summarize(months):
    out = {}
    for ym, rows in months.items():
        valid = [r for r in rows if not r[12] and r[7]]
        ppy = [r[7] / (r[8] / PYEONG) for r in valid if r[8] and r[8] > 0]
        out[ym] = {
            "n": len(valid),
            "sum": sum(r[7] for r in valid),
            "ppy": round(statistics.median(ppy)) if ppy else None,
        }
    return out


def main():
    key = service_key("DATA_GO_KR_KEY")
    if not key:
        print("DATA_GO_KR_KEY 가 없어 매매 수집을 건너뜁니다.")
        return
    cfg = load_config()
    all_months = months_back(cfg["trade_months"])
    refresh = set(all_months[: cfg["trade_refresh_months"]])
    summary, errors = {}, []

    def one_region(reg):
        path = os.path.join(DATA_DIR, "trade", f"{reg['code']}.json")
        old = read_json(path, {}).get("months", {})
        months, errs = {}, []
        for ym in all_months:
            if ym in old and ym not in refresh:
                months[ym] = old[ym]
                continue
            try:
                months[ym] = fetch_month(key, reg["code"], ym)
            except Exception as e:  # 한 달 실패해도 나머지는 계속
                errs.append(str(e))
                if ym in old:
                    months[ym] = old[ym]
        write_json(path, {"code": reg["code"], "name": reg["name"], "cols": COLS, "months": months})
        return reg, months, errs

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for reg, months, errs in pool.map(one_region, cfg["regions"]):
            errors += errs
            summary[reg["code"]] = {"name": reg["name"], "months": summarize(months)}
            print(f"{reg['name']}: {sum(len(v) for v in months.values())}건" + (f" (오류 {len(errs)})" if errs else ""))

    write_json(os.path.join(DATA_DIR, "trade", "summary.json"), summary)
    update_meta("trade", {"errors": errors[:20], "months": len(all_months)})
    if errors:
        print(f"오류 {len(errors)}건:\n" + "\n".join(errors[:10]))
        if len(errors) == len(all_months) * len(cfg["regions"]):
            raise SystemExit(1)


if __name__ == "__main__":
    main()
