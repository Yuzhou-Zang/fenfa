@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

set "APP_PORT=5409"
set "PY=%CD%\runtime\python\python.exe"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "PYTHONPATH=%CD%;%CD%\uploader;%CD%\myUtils;%CD%\utils"
set "PLAYWRIGHT_BROWSERS_PATH=%CD%\runtime\playwright-browsers"
set "PATH=%CD%\runtime\python\Scripts;%CD%\runtime\ffmpeg\bin;%PATH%"

echo.
echo ========================================
echo   Social Auto Upload - Portable Package
echo ========================================
echo.

if not exist "%PY%" (
  echo [ERROR] Missing runtime\python\python.exe
  echo Please extract the complete package folder before starting.
  pause
  exit /b 1
)

if not exist "videoFile" mkdir "videoFile"
if not exist "cookiesFile" mkdir "cookiesFile"
if not exist "db" mkdir "db"
if not exist "logs" mkdir "logs"
if not exist "avatars" mkdir "avatars"

echo [1/4] Checking runtime...
"%PY%" -c "import flask, flask_cors, playwright, xhs, biliup, loguru, qrcode, requests" >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Bundled Python dependencies are incomplete.
  pause
  exit /b 1
)

echo [2/4] Cleaning old local service...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%APP_PORT%') do (
  taskkill /PID %%a /F >nul 2>nul
)

echo [3/4] Scheduling browser open...
start "" /b cmd /c "timeout /t 5 /nobreak >nul && start "" http://127.0.0.1:%APP_PORT%/"

echo.
echo App URL: http://127.0.0.1:%APP_PORT%/
echo Keep this window open while using the app.
echo.
echo [4/4] Starting local service...
"%PY%" main.py
echo.
echo Local service has stopped.
pause
endlocal
