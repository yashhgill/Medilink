@echo off
REM ============================================================
REM  Pulih Windows Build Script
REM  Run this ONCE on your build machine (Windows + Python 3.11+)
REM  to produce the distributable package.
REM
REM  Requirements:
REM    pip install pyinstaller
REM    pip install -r ..\backend\requirements.txt
REM    (frontend must already be built: backend\static\ must exist)
REM
REM  Output: dist\Pulih-Windows\
REM          Copy this folder to each PC — no Python needed.
REM ============================================================

setlocal
set SCRIPT_DIR=%~dp0
set ROOT=%SCRIPT_DIR%..
set DIST=%SCRIPT_DIR%dist
set OUT=%DIST%\Pulih-Windows

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║         Pulih Windows Build                       ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

REM ── Check Python ────────────────────────────────────────────
python --version >nul 2>&1 || (
    echo  ERROR: Python not found. Install Python 3.11+ and add to PATH.
    pause & exit /b 1
)

REM ── Check frontend build exists ──────────────────────────────
if not exist "%ROOT%\backend\static\index.html" (
    echo  ERROR: frontend not built. Run from repo root:
    echo    cd frontend ^&^& npm install ^&^& npm run build
    echo    xcopy /E /I build ..\backend\static
    pause & exit /b 1
)

REM ── Install PyInstaller if missing ───────────────────────────
pip show pyinstaller >nul 2>&1 || pip install pyinstaller

REM ── Build clinic server exe ──────────────────────────────────
echo  [1/2] Building clinic server...
pyinstaller "%SCRIPT_DIR%medilink-clinic.spec" ^
    --distpath "%DIST%" --workpath "%SCRIPT_DIR%build" --noconfirm
if errorlevel 1 ( echo  FAILED: clinic server build & pause & exit /b 1 )

REM ── Build gateway exe ────────────────────────────────────────
echo  [2/2] Building gateway...
pyinstaller "%SCRIPT_DIR%medilink-gateway.spec" ^
    --distpath "%DIST%" --workpath "%SCRIPT_DIR%build" --noconfirm
if errorlevel 1 ( echo  FAILED: gateway build & pause & exit /b 1 )

REM ── Assemble output folder ───────────────────────────────────
echo  Assembling distributable...
if exist "%OUT%" rmdir /S /Q "%OUT%"
mkdir "%OUT%"

REM Copy executables
xcopy /E /I /Q "%DIST%\medilink-clinic"  "%OUT%\medilink-clinic\"
xcopy /E /I /Q "%DIST%\medilink-gateway" "%OUT%\medilink-gateway\"

REM Copy launchers
copy "%SCRIPT_DIR%run-clinic-A.bat"  "%OUT%\run-clinic-A.bat"
copy "%SCRIPT_DIR%run-clinic-B.bat"  "%OUT%\run-clinic-B.bat"
copy "%SCRIPT_DIR%run-gateway.bat"   "%OUT%\run-gateway.bat"
copy "%SCRIPT_DIR%INSTALL.txt"       "%OUT%\INSTALL.txt" 2>nul

REM Copy static frontend (already embedded in exe but keep for reference)
xcopy /E /I /Q "%ROOT%\backend\static" "%OUT%\static\"

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║  Build complete!                                     ║
echo  ║  Distributable: %OUT%
echo  ║                                                      ║
echo  ║  To install on each PC:                              ║
echo  ║    1. Copy Pulih-Windows\ folder to the PC        ║
echo  ║    2. Edit run-clinic-A.bat / run-clinic-B.bat:      ║
echo  ║       - Set GATEWAY_URL to the Gateway PC's IP       ║
echo  ║       - Add CLOUD_DATABASE_URL and GROQ_API_KEY      ║
echo  ║    3. Edit run-gateway.bat:                          ║
echo  ║       - Set CLINIC_A_URL and CLINIC_B_URL            ║
echo  ║    4. Double-click the correct .bat to start         ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
pause
