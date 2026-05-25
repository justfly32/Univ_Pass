@echo off
chcp 65001 >nul
title Univ_Pass 설치 및 실행
echo ============================================
echo    Univ_Pass - 대학 입시 분석 시스템
echo    설치 & 실행
echo ============================================
echo.

REM Node.js 확인
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Node.js가 설치되어 있지 않습니다.
    echo.
    echo https://nodejs.org 에서 LTS 버전을 다운로드 후 설치해주세요.
    echo 설치 후 이 파일을 다시 실행하세요.
    pause
    exit /b
)
echo [O] Node.js 설치 확인 완료
echo.

REM npm install
echo [1/3] 패키지 설치 중...
call npm install
if %errorlevel% neq 0 (
    echo [X] 패키지 설치 실패. 인터넷 연결을 확인 후 다시 시도하세요.
    pause
    exit /b
)
echo [O] 패키지 설치 완료
echo.

REM .env 파일 확인
if not exist ".env" (
    echo [2/3] .env 파일 생성 중...
    copy .env.example .env >nul
    echo [O] .env.example을 .env로 복사했습니다.
    echo     필요시 .env 파일을 열어 OPENROUTER_API_KEY를 설정하세요.
) else (
    echo [O] .env 파일 있음 (유지)
)
echo.

REM 실행
echo [3/3] 서버 시작 중...
echo.
echo ============================================
echo    브라우저가 자동으로 열립니다!
echo    종료하려면 Ctrl+C 를 누르세요.
echo ============================================
echo.
start http://localhost:3000
call npm start
pause
