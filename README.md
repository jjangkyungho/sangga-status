# 상가 현황 사이트

공공데이터로 **전국 256개 시군구**의 상가 **매매·임대·상권** 현황을 보는 사이트입니다. 전국 지도에서 시도 → 시군구를 눌러 고르거나, 시도·시군구 드롭다운과 지역 검색으로 이동할 수 있습니다. 서버비와 도메인 비용 없이 GitHub만으로 운영합니다.

- 사이트: https://jjangkyungho.github.io/sangga-status/ (로그인 필요)
- 저장소: https://github.com/jjangkyungho/sangga-status

| 구성 | 사용하는 것 | 비용 |
|---|---|---|
| 사이트 화면 | GitHub Pages (`docs/` 폴더) | 무료 (공개 저장소 — 코드만 공개) |
| 로그인 · 데이터 보관 | Supabase `sangga-status` 프로젝트 (서울 리전): Auth + 비공개 Storage 버킷 `data` | 무료 (저장 1GB) |
| 매일 자동 수집 | GitHub Actions (매일 06:00 KST): Supabase에서 받기 → 수집 → 바뀐 파일만 올리기 | 무료 |
| 원천 데이터 | 공공데이터포털, 한국부동산원 R-ONE | 무료 |

수집 데이터는 GitHub에 올리지 않습니다. 로그인한 사용자만 Supabase에서 받을 수 있습니다 (Storage 정책 `authenticated read data`).

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

## 사용자 계정 관리 (아이디·비밀번호 부여)

회원가입은 막혀 있고, 관리자가 계정을 만들어 줍니다.

1. https://supabase.com/dashboard → `sangga-status` 프로젝트 → **Authentication → Users → Add user → Create new user**
2. **Email**에 `아이디@sangga.local` (예: `kim@sangga.local`), **Password**에 비밀번호 입력, **Auto Confirm User** 체크 → Create
3. 사용자는 사이트 로그인 화면에 **아이디(`kim`)**와 비밀번호만 넣으면 됩니다. 실제 이메일 주소로 만들어도 되고, 그 경우 이메일 전체를 아이디로 입력합니다.
- 비밀번호 변경·계정 삭제도 같은 Users 화면에서 합니다.

## 저장소 Secrets (등록 완료)

| Name | 용도 |
|---|---|
| `DATA_GO_KR_KEY` | 공공데이터포털 인증키 (실거래가·상가정보, 하루 10,000회씩) |
| `RONE_KEY` | 한국부동산원 R-ONE 인증키 |
| `SUPABASE_URL` | Supabase 프로젝트 주소 |
| `SUPABASE_SERVICE_KEY` | Supabase 서버용 비밀 키 (데이터 업로드용 — 사이트 코드에 넣으면 안 됨) |

사이트 코드(`docs/config.json`)에는 공개용 키(publishable)만 들어 있습니다. 이 키로는 로그인 없이 데이터를 받을 수 없습니다.

## 수동 실행

저장소 **Actions → 데이터 자동 수집 → Run workflow**. 그날 매매 API 한도를 이미 썼다면 `매매 실거래가 수집 건너뛰기`를 체크합니다.

---

## 설정 바꾸기 — `docs/config.json`

- **지역**: `regions`(전국 256개 시군구)와 `sidos`는 `docs/geo/`의 행정경계(행정안전부 행정동 경계, ver20261001)에서 만든 것입니다. 행정구역이 바뀌면 경계 파일과 함께 다시 만들어야 합니다. `sidos[].short`는 R-ONE 임대 통계의 시도 이름(예: 전남광주통합특별시 → 광주·전남)과 연결하는 값입니다.
- **수집 기간**: `trade_months` (기본 24개월), `rone_start_year` (기본 2019년)
- **매물 링크**: `listing_links`의 주소에 `{lat}`, `{lng}`, `{name}`을 넣으면 선택한 구의 좌표와 이름으로 바뀝니다. 플랫폼 주소 체계가 바뀌면 여기만 고치면 됩니다.

공공데이터포털 개발계정 한도는 API별 하루 10,000회입니다. 매매는 첫 수집 약 6,100회(256개 × 24개월), 이후 매일 약 770회. 점포는 전국 약 2,600회이며 `stores_max_calls`(기본 9,000) 안에서 30일 지난 지역부터 받습니다.

## 문제가 생기면

- **Actions 실행 기록에 오류가 있을 때**: 실행 기록 → 각 단계 로그를 확인합니다. `SERVICE_KEY_IS_NOT_REGISTERED`는 키 승인 대기 중이라는 뜻이니 1~2시간 뒤 다시 실행하세요.
- **GitHub 서버에서 공공 API 접속이 막힐 때** (해외 IP 차단): 이 PC에서 수집해서 올리는 방식으로 바꿉니다.
  1. 이 폴더의 `keys.bat`(업로드되지 않음)에 키를 적습니다. Supabase 서버용 비밀 키는 대시보드 → Project Settings → API Keys 에서 복사해 직접 넣으세요.
     ```
     set DATA_GO_KR_KEY=공공데이터포털키
     set RONE_KEY=R-ONE키
     set SUPABASE_URL=https://zhtgfmdoxvwmkoqqwlgj.supabase.co
     set SUPABASE_SERVICE_KEY=서버용비밀키
     ```
  2. `run_local.bat` 실행. Windows 작업 스케줄러에 매일 실행으로 등록하면 자동화됩니다.
- **R-ONE 통계표**: '임대동향 지역별 {지표}({기간})_{유형}' 이름의 분기 통계표를 찾아 지표×유형별로 기간을 이어 붙입니다. 표 이름 체계가 바뀌면 `scripts/fetch_rone.py`의 `NAME_RE`, `METRICS`, `TYPES`를 고치세요.
- **Supabase 무료 프로젝트 일시정지**: 7일간 활동이 없으면 일시정지될 수 있습니다. 매일 자동 수집이 접속하므로 보통은 유지되며, 정지되면 대시보드에서 Restore 하면 됩니다.

## 폴더 구조

```
docs/                사이트 (GitHub Pages가 이 폴더를 공개)
  index.html, app.js, style.css
  config.json        지역·링크·Supabase 공개 설정
  geo/               전국 시도·시군구 경계 (지도)
  data/              수집 데이터 작업 폴더 (GitHub 업로드 안 함 → Supabase)
scripts/             수집 스크립트 (Python 표준 라이브러리만 사용)
  fetch_trade.py     ① 매매 실거래가
  fetch_rone.py      ② 임대 통계
  fetch_stores.py    ③ 상권 점포 현황
  supabase_sync.py   Supabase 버킷과 데이터 주고받기
.github/workflows/update-data.yml   자동 수집 일정
run_local.bat        PC에서 수집할 때 쓰는 대안
```
