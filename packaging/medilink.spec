# MediLink desktop build, one spec for Windows, macOS and Linux.
#   pyinstaller packaging/medilink.spec      (run from the repo root)
# Needs the built interface in backend/static (frontend/build copied there).
# Output: dist/MediLink/  (MediLink.exe on Windows, MediLink elsewhere)
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

ROOT = Path(SPEC).resolve().parent.parent
BACKEND = ROOT / "backend"

hidden = (
    collect_submodules("uvicorn")
    + collect_submodules("databases")
    + collect_submodules("websockets")
    + collect_submodules("passlib.handlers")
    + [
        "server", "triage_offline", "ai_offline", "demo_seed",
        "aiosqlite", "sqlalchemy.dialects.sqlite", "sqlalchemy.dialects.postgresql",
        "bcrypt", "jwt", "cryptography", "dotenv", "pydantic", "pydantic_core",
        "email_validator", "multipart", "httpx", "qrcode", "PIL", "fpdf", "groq",
        "tzdata", "zoneinfo",
        "asyncpg", "asyncpg.pgproto.pgproto", "psycopg2",   # cloud backup
    ]
)

a = Analysis(
    [str(ROOT / "packaging" / "medilink_app.py")],
    pathex=[str(BACKEND)],
    binaries=[],
    datas=[
        (str(BACKEND / "static"), "static"),
        (str(BACKEND / "migrations"), "migrations"),
    ] + collect_data_files("tzdata") + collect_data_files("fpdf"),
    hiddenimports=hidden,
    excludes=["tkinter", "matplotlib", "numpy", "pandas", "boto3", "botocore", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="MediLink",
    console=True,            # the window shows the clinic's address and must stay open
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="MediLink", upx=False)
