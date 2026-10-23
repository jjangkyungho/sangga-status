# 상가 현황 사이트

공공데이터로 **전국 256개 시군구**의 상가 **매매·임대·상권** 현황을 보는 사이트입니다. 전국 지도에서 시도 → 시군구를 눌러 고르거나, 시도·시군구 드롭다운과 지역 검색으로 이동할 수 있습니다. 서버비와 도메인 비용 없이 GitHub만으로 운영합니다.

| 구성 | 사용하는 것 | 비용 |
|---|---|---|
| 사이트 호스팅 | GitHub Pages (`https://아이디.github.io/저장소이름/`) | 무료 (공개 저장소) |
| 매일 자동 수집 | GitHub Actions (매일 06:00 KST) | 무료 (공개 저장소) |
| 데이터 | 공공데이터포털, 한국부동산원 R-ONE | 무료 (인증키 필요) |

## 탭 구성과 데이터 출처

| 탭 | 내용 | 출처 | 갱신 |
|---|---|---|---|
| ① 매매 현황 | 상업업무용 매매 실거래 (건수, 총액, 3.3㎡당 가격, 거래 목록, 자치구 비교, CSV) | 국토교통부 상업업무용 부동산 매매 실거래가 API | 매일 (최근 3개월 재수집) |
| ② 임대 통계 | 상가 유형(중대형·소규모·집합·일반·오피스)별 임대료·공실률·임대가격지수·전환율, 선택 지역 시도의 상권 비교 | 한국부동산원 상업용부동산 임대동향조사 (R-ONE Open API) | 매일 확인, 분기 단위 자료 |
| ③ 임대 매물·상권 | 민간 매물 플랫폼 바로가기, 업종별·행정동별 점포 수 | 소상공인시장진흥공단 상가(상권)정보 API | 지역별 30일 주기 |

> **상가 임대차 신고 자료는 없습니다.** 주택은 전월세 신고제가 있지만 상가 임대차는 신고 의무가 없어서 국가가 개별 계약 자료를 갖고 있지 않습니다. 공식 상가 임대 통계로는 한국부동산원 임대동향조사(표본조사)가 유일해서 ② 탭은 이 자료를 씁니다.
>
> **민간 매물 사이트는 바로가기 링크로만 연결합니다.** 네이버부동산 같은 사이트는 약관상 자동 수집이 금지돼 있고, 무단 수집은 데이터베이스권 침해로 소송이 된 사례가 있습니다.

---

## 처음 설치하기 (약 30분)

### 1단계. 인증키 발급 (무료)

**① 공공데이터포털** (https://www.data.go.kr) 회원가입 후 아래 2개를 각각 "활용신청"합니다. 보통 바로 승인되지만, 키가 실제로 작동하기까지 1~2시간 걸릴 수 있습니다.
- `국토교통부_상업업무용 부동산 매매 실거래가 자료`
- `소상공인시장진흥공단_상가(상권)정보`

마이페이지 → 개발계정에서 **일반 인증키(Decoding)**를 복사합니다. 두 API에 같은 키를 씁니다.

**② 한국부동산원 R-ONE** (https://www.reb.or.kr/r-one) → Open API → 인증키 신청 후 키를 복사합니다.

### 2단계. GitHub 저장소 만들기

1. https://github.com 가입 → 오른쪽 위 `+` → **New repository**
2. 이름 예시: `sangga-status` / **Public** 선택 (Private이면 Pages가 유료입니다)
3. 생성된 저장소에서 **uploading an existing file** 클릭 → 이 폴더의 파일과 폴더(`docs`, `scripts`, `.github`, `README.md`, `.gitignore`)를 끌어다 놓고 Commit
   - `.github` 폴더는 탐색기에서 숨김 폴더처럼 안 보일 수 있습니다. 안 보이면 Git으로 올리는 방법(아래 참고)을 쓰세요.

Git으로 올리는 경우 (이 폴더에서 실행):
```
git init
git add .
git commit -m "상가 현황 사이트"
git branch -M main
git remote add origin https://github.com/아이디/sangga-status.git
git push -u origin main
```

### 3단계. 인증키 등록

저장소 → **Settings → Secrets and variables → Actions → New repository secret**

| Name | Secret |
|---|---|
| `DATA_GO_KR_KEY` | 공공데이터포털 인증키 |
| `RONE_KEY` | R-ONE 인증키 |

키는 GitHub 서버 안에서만 쓰이고 사이트에는 노출되지 않습니다.

### 4단계. 사이트 켜기

1. **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main`, 폴더 `/docs` → Save
2. **Actions** 탭 → (처음이면 "I understand… enable" 클릭) → `데이터 자동 수집` → **Run workflow**
3. 전국 첫 수집은 1~2시간 걸립니다 (이미 수집된 데이터를 올렸다면 다음 날부터 최근 3개월만 갱신). 끝나면 `https://아이디.github.io/sangga-status/` 에서 확인합니다.

이후에는 매일 06시에 자동으로 갱신됩니다.

---

## 설정 바꾸기 — `docs/config.json`

- **지역**: `regions`(전국 256개 시군구)와 `sidos`는 `docs/geo/`의 행정경계(행정안전부 행정동 경계, ver20261001)에서 만든 것입니다. 행정구역이 바뀌면 경계 파일과 함께 다시 만들어야 합니다. `sidos[].short`는 R-ONE 임대 통계의 시도 이름(예: 전남광주통합특별시 → 광주·전남)과 연결하는 값입니다.
- **수집 기간**: `trade_months` (기본 24개월), `rone_start_year` (기본 2019년)
- **매물 링크**: `listing_links`의 주소에 `{lat}`, `{lng}`, `{name}`을 넣으면 선택한 구의 좌표와 이름으로 바뀝니다. 플랫폼 주소 체계가 바뀌면 여기만 고치면 됩니다.

공공데이터포털 개발계정 한도는 API별 하루 10,000회입니다. 매매는 첫 수집 약 6,100회(256개 × 24개월), 이후 매일 약 770회. 점포는 전국 약 2,600회이며 `stores_max_calls`(기본 9,000) 안에서 30일 지난 지역부터 받습니다.

## 문제가 생기면

- **Actions 실행 기록에 오류가 있을 때**: 실행 기록 → 각 단계 로그를 확인합니다. `SERVICE_KEY_IS_NOT_REGISTERED`는 키 승인 대기 중이라는 뜻이니 1~2시간 뒤 다시 실행하세요.
- **GitHub 서버에서 공공 API 접속이 막힐 때** (해외 IP 차단): 이 PC에서 수집해서 올리는 방식으로 바꿉니다.
  1. 이 폴더에 `keys.bat` 파일을 만들고 아래처럼 키를 적습니다 (이 파일은 업로드되지 않습니다).
     ```
     set DATA_GO_KR_KEY=공공데이터포털키
     set RONE_KEY=R-ONE키
     ```
  2. `run_local.bat` 실행. Windows 작업 스케줄러에 매일 실행으로 등록하면 자동화됩니다.
- **R-ONE 통계표**: 스크립트가 통계표 이름에 '상가/오피스'와 '임대료/공실률/임대가격지수/전환율'이 들어간 분기 통계를 자동으로 찾습니다. 원하는 표가 빠지면 `scripts/fetch_rone.py`의 `SUBJECT`, `MEASURE`를 고치세요.

## 폴더 구조

```
docs/                사이트 (GitHub Pages가 이 폴더를 공개)
  index.html, app.js, style.css
  config.json        지역·링크 설정
  data/              수집된 데이터 (Actions가 자동 커밋)
scripts/             수집 스크립트 (Python 표준 라이브러리만 사용)
  fetch_trade.py     ① 매매 실거래가
  fetch_rone.py      ② 임대 통계
  fetch_stores.py    ③ 상권 점포 현황
.github/workflows/update-data.yml   자동 수집 일정
run_local.bat        PC에서 수집할 때 쓰는 대안
```
