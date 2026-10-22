# MediLink Windows PyInstaller spec
# Build: pyinstaller windows/medilink-clinic.spec
# Output: dist/medilink-clinic/medilink-clinic.exe

import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files

ROOT = Path(SPEC).parent.parent          # repo root
BACKEND = str(ROOT / "backend")
STATIC = str(ROOT / "backend" / "static")

block_cipher = None

a = Analysis(
    [str(ROOT / "backend" / "server.py")],
    pathex=[BACKEND],
    binaries=[],
    datas=[
        (STATIC,              "static"),               # pre-built React frontend
        (str(ROOT / "backend" / "migrations"), "migrations"),
    ] + collect_data_files("tzdata"),          # zoneinfo has no system tz database on Windows
    hiddenimports=[
        # fastapi / starlette
        "fastapi", "starlette", "starlette.middleware.cors",
        "starlette.staticfiles", "starlette.responses",
        # databases drivers
        "databases", "databases.backends.aiosqlite",
        "databases.backends.asyncpg",
        "aiosqlite", "asyncpg",
        # sqlalchemy
        "sqlalchemy", "sqlalchemy.dialects.sqlite",
        "sqlalchemy.dialects.postgresql",
        # auth / crypto
        "passlib", "passlib.handlers.bcrypt",
        "bcrypt", "jose", "jose.jwt", "cryptography",
        # misc
        "dotenv", "pydantic", "pydantic_core",
        "groq", "qrcode", "PIL", "fpdf",
        "uvicorn", "uvicorn.logging", "uvicorn.loops",
        "uvicorn.loops.auto", "uvicorn.protocols",
        "uvicorn.protocols.http", "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan", "uvicorn.lifespan.on",
        "email_validator",
        "multipart",
        "boto3", "botocore",
        "tzdata", "zoneinfo",
        # live queue updates: uvicorn needs a websocket implementation bundled
        "websockets", "websockets.legacy", "websockets.legacy.server",
        "uvicorn.protocols.websockets.websockets_impl",
        "uvicorn.protocols.websockets.wsproto_impl",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "pandas"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="medilink-clinic",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,          # keep console so admins can see errors
    icon=None,             # add .ico here if you have one
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="medilink-clinic",
)
