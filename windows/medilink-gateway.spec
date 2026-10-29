# MediLink Gateway PyInstaller spec
# Build: pyinstaller windows/medilink-gateway.spec
# Output: dist/medilink-gateway/medilink-gateway.exe

import sys
import os
from pathlib import Path

ROOT = Path(SPEC).parent.parent
BACKEND = str(ROOT / "backend")
STATIC = str(ROOT / "backend" / "static")

block_cipher = None

a = Analysis(
    [str(ROOT / "backend" / "gateway.py")],
    pathex=[BACKEND],
    binaries=[],
    datas=[
        (STATIC, "static"),
    ],
    hiddenimports=[
        "fastapi", "starlette", "starlette.middleware.cors",
        "starlette.staticfiles", "starlette.responses",
        "pydantic", "pydantic_core",
        "uvicorn", "uvicorn.logging", "uvicorn.loops",
        "uvicorn.loops.auto", "uvicorn.protocols",
        "uvicorn.protocols.http", "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan", "uvicorn.lifespan.on",
        "httpx", "requests",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "pandas"],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="medilink-gateway",
    debug=False,
    strip=False,
    upx=True,
    console=True,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="medilink-gateway",
)
