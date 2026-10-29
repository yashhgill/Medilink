@echo off
REM ============================================================
REM  Pulih — Clinic A launcher  (Klinik Melaka, port 8001)
REM  Run this on the Clinic A PC.  Edit the env vars below
REM  to match your clinic's settings before first launch.
REM ============================================================

title Pulih - Clinic A (Klinik Melaka)
color 0B

REM ── CONFIGURE THESE ─────────────────────────────────────────
set FACILITY_ID=melaka
set CLINIC_NAME=Klinik Melaka
set MEDILINK_PORT=8001
set GATEWAY_URL=http://GATEWAY_IP:8000

REM Shared secrets — MUST match across all clinics and gateway
set JWT_SECRET=medilink-psm1-demo-secret-not-for-production-32ch
set IC_ENCRYPTION_KEY=Ux3n2rW8kQ5vZ1pL7yT4bN6mJ9cH0sD2fG8aK4eR1oI=
set IC_INDEX_KEY=medilink-psm1-demo-blind-index-key
set KIOSK_TOKEN=demo-kiosk-token

REM Cloud DB — leave blank for standalone (local SQLite only)
set CLOUD_DATABASE_URL=

REM Groq AI — optional, for AI triage
set GROQ_API_KEY=

REM ── PATHS (usually no need to change) ───────────────────────
set SCRIPT_DIR=%~dp0
set DATA_DIR=%USERPROFILE%\medilink-data\%FACILITY_ID%
set UPLOAD_DIR=%DATA_DIR%\uploads
set FRONTEND_DIST=%SCRIPT_DIR%static

REM ── CREATE DATA DIRS ─────────────────────────────────────────
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%UPLOAD_DIR%" mkdir "%UPLOAD_DIR%"
if not exist "%DATA_DIR%\branding" mkdir "%DATA_DIR%\branding"

REM ── SET REMAINING ENV ───────────────────────────────────────
set DATABASE_URL=sqlite:///%DATA_DIR%\medilink.db
set MEDILINK_DATA_DIR=%DATA_DIR%
set DEPLOYMENT_MODE=networked
set ALLOW_SEED=false
set IS_CLOUD_NODE=false

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║           Pulih — Clinic A  (Port %MEDILINK_PORT%)          ║
echo  ║   Facility: %FACILITY_ID%                                ║
echo  ║   Data:     %DATA_DIR%   ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Open your browser to:  http://localhost:%MEDILINK_PORT%
echo  (or use the Gateway at: %GATEWAY_URL%)
echo.
echo  Press Ctrl+C to stop the server.
echo.

REM ── START SERVER ────────────────────────────────────────────
REM Try bundled exe first, fall back to Python
if exist "%SCRIPT_DIR%medilink-clinic\medilink-clinic.exe" (
    "%SCRIPT_DIR%medilink-clinic\medilink-clinic.exe" --host 0.0.0.0 --port %MEDILINK_PORT%
) else (
    python -m uvicorn server:app --app-dir "%SCRIPT_DIR%..\backend" ^
        --host 0.0.0.0 --port %MEDILINK_PORT% --log-level info
)

pause
