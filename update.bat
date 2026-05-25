@echo off
chcp 65001 >nul
title Univ_Pass 업데이트
echo ============================================
echo    Univ_Pass 업데이트
echo ============================================
echo.
echo GitHub에서 최신 버전을 다운로드합니다...
echo.

set TEMP_DIR=%TEMP%\univpass_update
set ZIP_FILE=%TEMP_DIR%\master.zip
set EXTRACTED=%TEMP_DIR%\extracted

if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"
mkdir "%EXTRACTED%"

echo [1/4] 다운로드 중...
powershell -Command "$wc = New-Object System.Net.WebClient; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc.DownloadFile('https://github.com/justfly32/Univ_Pass/archive/refs/heads/master.zip', '%ZIP_FILE%')"
if %errorlevel% neq 0 (
    echo [X] 다운로드 실패. 인터넷 연결을 확인하세요.
    pause
    exit /b
)
echo [O] 다운로드 완료
echo.

echo [2/4] 압축 해제 중...
powershell -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%EXTRACTED%' -Force"
echo [O] 압축 해제 완료
echo.

REM .env 백업
if exist ".env" (
    copy .env .env.backup >nul
    echo [O] .env 설정 백업 완료
)

echo [3/4] 파일 업데이트 중...
REM node_modules, .env 제외하고 새 파일로 덮어쓰기
robocopy "%EXTRACTED%\Univ_Pass-master" "%CD%" /E /XO /XD node_modules /XF .env >nul
echo [O] 파일 업데이트 완료
echo.

REM .env 복원
if exist ".env.backup" (
    copy /y .env.backup .env >nul
    del .env.backup
    echo [O] .env 설정 복원 완료
)
echo.

echo [4/4] 패키지 업데이트 중...
call npm install
if %errorlevel% neq 0 (
    echo [X] 패키지 업데이트 실패
    pause
    exit /b
)
echo [O] 패키지 업데이트 완료
echo.

REM 임시 파일 정리
rmdir /s /q "%TEMP_DIR%"

echo ============================================
echo   업데이트 완료!
echo   run.bat 실행하면 최신 버전으로 실행됩니다.
echo ============================================
echo.
pause
