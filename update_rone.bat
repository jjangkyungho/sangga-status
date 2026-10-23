@echo off
rem 한국부동산원 R-ONE 임대 통계(분기 자료)는 해외(GitHub 서버) 접속이 막혀 있어 이 PC에서 받는다.
rem 분기마다 한 번(1·4·7·10월 말쯤) 실행하면 비공개 저장소 seed 브랜치로 올라가고,
rem GitHub Actions(seed.yml)가 Supabase 로 옮긴다. keys.bat 에 RONE_KEY 가 있어야 한다.
chcp 65001 > nul
cd /d "%~dp0"
if exist keys.bat call keys.bat
python scripts\fetch_rone.py || goto :eof
set WT=%TEMP%\sangga-seed
if not exist "%WT%\.git" (
  git worktree prune
  git fetch collector seed
  git worktree add "%WT%" seed || goto :eof
)
pushd "%WT%"
git pull -q collector seed
rem seed.yml 은 브랜치의 파일을 모두 올리므로, 매일 클라우드가 갱신하는 매매 자료는 seed 에서 뺀다
if exist docs\data\trade git rm -r -q docs/data/trade
xcopy /e /i /y "%~dp0docs\data\rone" "docs\data\rone" > nul
git add -f docs/data/rone
git commit -q -m "R-ONE 임대 통계 갱신 (PC)" && git push -q collector seed
popd
echo 완료: GitHub Actions 가 Supabase 로 올립니다.
