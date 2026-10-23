@echo off
rem GitHub Actions 에서 공공 API 호출이 막힐 때 쓰는 대안: 이 PC 에서 수집 후 Supabase 에 올린다.
rem 사용 전 keys.bat 파일을 만들어 두세요 (README 참고). keys.bat 은 .gitignore 로 업로드되지 않습니다.
chcp 65001 > nul
cd /d "%~dp0"
if exist keys.bat call keys.bat
python scripts\supabase_sync.py pull
python scripts\fetch_trade.py
python scripts\fetch_rone.py
python scripts\fetch_stores.py
python scripts\supabase_sync.py push
