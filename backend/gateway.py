"""
MediLink Patient Gateway — port 8000
=====================================
A lightweight reverse-proxy / federation layer that sits in front of the two
clinic nodes (8001, 8002).  Patients reach ONE public URL; the gateway handles:

  • Serving the React SPA for every non-/api path
  • POST /api/auth/activate  — tries BOTH clinics so a patient can activate
                               regardless of which clinic registered them
  • POST /api/auth/login     — same federation so patients can log in from
                               either clinic's DB
  • GET  /api/health         — gateway health (not a clinic health)
  • Everything else          — proxied to clinic 8001 (primary) with fallback
                               to 8002 if 8001 returns 5xx

Run:
  FRONTEND_DIST=./static python -m uvicorn gateway:app \
      --host 0.0.0.0 --port 8000 --log-level info
"""
import os, json, logging, pathlib, httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

log = logging.getLogger("medilink.gateway")

CLINIC_URLS = [
    os.environ.get("CLINIC_A_URL", "http://127.0.0.1:8001"),
    os.environ.get("CLINIC_B_URL", "http://127.0.0.1:8002"),
    # Add more clinics by setting CLINIC_C_URL, CLINIC_D_URL etc in the environment
    # or just append "http://127.0.0.1:8003" here directly
    *([os.environ["CLINIC_C_URL"]] if os.environ.get("CLINIC_C_URL") else []),
    *([os.environ["CLINIC_D_URL"]] if os.environ.get("CLINIC_D_URL") else []),
]

STATIC_DIR = pathlib.Path(
    os.environ.get("FRONTEND_DIST", pathlib.Path(__file__).parent / "static")
)

app = FastAPI(title="MediLink Gateway", docs_url=None, redoc_url=None)

# ── shared async HTTP client ───────────────────────────────────────────────────
_client: httpx.AsyncClient | None = None

@app.on_event("startup")
async def _startup():
    global _client
    _client = httpx.AsyncClient(timeout=20.0)

@app.on_event("shutdown")
async def _shutdown():
    if _client:
        await _client.aclose()


# ── helpers ────────────────────────────────────────────────────────────────────
async def _proxy(request: Request, url: str) -> Response:
    """Forward *request* verbatim to *url* and stream the response back."""
    body = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)          # don't forward the gateway's host header
    headers.pop("content-length", None)

    rp = await _client.request(
        method=request.method,
        url=url,
        headers=headers,
        content=body,
        follow_redirects=False,
    )
    return Response(
        content=rp.content,
        status_code=rp.status_code,
        headers=dict(rp.headers),
    )


async def _federate_post(path: str, request: Request) -> Response:
    """
    Try each clinic in turn.  Return the FIRST success (2xx).
    If all clinics fail, return the last error response.
    """
    body = await request.body()
    headers = {k: v for k, v in request.headers.items()
               if k.lower() not in ("host", "content-length")}

    last: Response | None = None
    for base in CLINIC_URLS:
        try:
            rp = await _client.post(
                f"{base}{path}",
                headers=headers,
                content=body,
                timeout=15.0,
            )
            if rp.status_code < 500:
                # 2xx = success, 4xx = clinic found the record and rejected it
                # (wrong code, wrong password, etc.) — return immediately
                return Response(
                    content=rp.content,
                    status_code=rp.status_code,
                    headers=dict(rp.headers),
                )
            last = Response(content=rp.content, status_code=rp.status_code,
                            headers=dict(rp.headers))
        except Exception as exc:
            log.warning("Clinic %s unreachable: %s", base, exc)
            last = JSONResponse({"detail": "Clinic unreachable"}, status_code=503)

    return last or JSONResponse({"detail": "No clinics available"}, status_code=503)


# ── gateway health ─────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    statuses = {}
    for url in CLINIC_URLS:
        try:
            r = await _client.get(f"{url}/api/health", timeout=5.0)
            statuses[url] = "ok" if r.status_code == 200 else "degraded"
        except Exception:
            statuses[url] = "down"
    overall = "ok" if all(v == "ok" for v in statuses.values()) else "degraded"
    return {"status": overall, "clinics": statuses,
            "deployment_mode": "standalone", "tier": "connect",
            "features": ["patient_app", "kiosk", "triage", "doctor_console",
                         "labs", "prescriptions", "pharmacy", "reports"]}


# ── federated auth endpoints ───────────────────────────────────────────────────
@app.post("/api/auth/activate")
async def activate(request: Request):
    return await _federate_post("/api/auth/activate", request)

@app.post("/api/auth/login")
async def login(request: Request):
    return await _federate_post("/api/auth/login", request)


# ── generic API proxy → clinic A (8001), fallback to clinic B (8002) ──────────
@app.api_route("/api/{path:path}", methods=["GET","POST","PUT","PATCH","DELETE","OPTIONS"])
async def proxy_api(path: str, request: Request):
    primary = CLINIC_URLS[0]
    try:
        resp = await _proxy(request, f"{primary}/api/{path}")
        if resp.status_code < 500:
            return resp
    except Exception as exc:
        log.warning("Primary clinic error: %s", exc)

    # fallback to clinic B
    if len(CLINIC_URLS) > 1:
        try:
            return await _proxy(request, f"{CLINIC_URLS[1]}/api/{path}")
        except Exception as exc:
            log.warning("Fallback clinic error: %s", exc)

    return JSONResponse({"detail": "All clinic nodes unavailable"}, status_code=503)


# ── serve React SPA ────────────────────────────────────────────────────────────
_index = STATIC_DIR / "index.html"

# Mount static assets (JS/CSS/images) — only if the directory exists
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR / "static")), name="static")

    # Serve root-level public assets (logo, icons, manifests, sw.js, etc.)
    # These are files that React CRA puts in /public and references as e.g. /medilink-logo.png.
    # Without explicit routes the catch-all SPA handler returns index.html for them.
    _ROOT_FILES = [
        "medilink-logo.png", "harnovacare-logo.png",
        "logo192.png", "logo512.png", "favicon-64.png",
        "favicon.ico", "manifest.json", "sw.js", "asset-manifest.json",
    ]
    for _fname in _ROOT_FILES:
        _fpath = STATIC_DIR / _fname
        if _fpath.exists():
            # Use a closure to capture the current _fpath value
            def _make_handler(p):
                async def _handler():
                    return FileResponse(str(p))
                return _handler
            app.get(f"/{_fname}", include_in_schema=False)(_make_handler(_fpath))

    # Serve icons/ directory
    _icons_dir = STATIC_DIR / "icons"
    if _icons_dir.exists():
        app.mount("/icons", StaticFiles(directory=str(_icons_dir)), name="icons")

    # Catch-all: serve index.html for any non-/api path (React Router)
    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        return FileResponse(str(_index))
