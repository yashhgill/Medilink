@echo off
REM ============================================================
REM  MediLink — Gateway launcher  (port 8000)
REM  Run this on the Gateway PC (or any PC that can reach
REM  both clinic servers on the network).
REM  Edit CLINIC_A_URL and CLINIC_B_URL to match your LAN IPs.
REM ============================================================

title MediLink - Gateway (Port 8000)
color 0E

REM ── CONFIGURE THESE ─────────────────────────────────────────
set CLINIC_A_URL=http://CLINIC_A_IP:8001
set CLINIC_B_URL=http://CLINIC_B_IP:8002

REM Shared secret — must match clinics
set JWT_SECRET=medilink-psm1-demo-secret-not-for-production-32ch

REM ── PATHS ───────────────────────────────────────────────────
set SCRIPT_DIR=%~dp0
set FRONTEND_DIST=%SCRIPT_DIR%static

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║            MediLink — Gateway  (Port 8000)           ║
echo  ║   Clinic A: %CLINIC_A_URL%                  ║
echo  ║   Clinic B: %CLINIC_B_URL%                  ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Gateway URL:  http://localhost:8000  (or your LAN IP)
echo  Staff login from any PC on the network via the Gateway.
echo.
echo  Press Ctrl+C to stop.
echo.

if exist "%SCRIPT_DIR%medilink-gateway\medilink-gateway.exe" (
    "%SCRIPT_DIR%medilink-gateway\medilink-gateway.exe" --host 0.0.0.0 --port 8000
) else (
    python -m uvicorn gateway:app --app-dir "%SCRIPT_DIR%..\backend" ^
        --host 0.0.0.0 --port 8000 --log-level info
)

pause
