@echo off
chcp 65001 >nul
title Univ_Pass 실행
echo ============================================
echo    Univ_Pass - 대학 입시 분석 시스템
echo    실행
echo ============================================
echo.
echo http://localhost:3000 으로 접속하세요
echo 종료하려면 Ctrl+C 를 누르세요
echo ============================================
echo.
call npm start
pause
