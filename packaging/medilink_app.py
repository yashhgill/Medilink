"""MediLink desktop launcher: one clinic node on this computer.

This is the program inside the downloadable builds (Windows, macOS, Linux).
It needs no Python on the clinic's computer when frozen with PyInstaller
(see packaging/medilink.spec).

On first run it creates this clinic's own data folder and its own keys, so no
two installs share a secret, then opens the first-run setup wizard in the
browser. After that it simply starts the clinic and opens the front door.

    MediLink            start the clinic
    MediLink --port N   use another port (default 8001, or the next free one)
"""
import json
import os
import platform
import secrets
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

APP = "MediLink"
# The kiosk sends this token with every request. It is compiled into the
# interface at build time (REACT_APP_KIOSK_TOKEN), so it must match the build.
BUILD_KIOSK_TOKEN = "demo-kiosk-token"


def data_dir() -> Path:
    system = platform.system()
    if system == "Windows":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
        return base / APP
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / APP
    return Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "medilink"


def bundle_dir() -> Path:
    """Where the server code and the built interface live."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)                      # PyInstaller
    return Path(__file__).resolve().parent.parent / "backend"


def install_keys(d: Path) -> dict:
    """This install's own keys, created once and kept beside its database.
    Losing keys.json makes stored identity card numbers unreadable, so it is
    part of what a clinic must back up."""
    path = d / "keys.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    from cryptography.fernet import Fernet
    keys = {"ic_encryption_key": Fernet.generate_key().decode(),
            "ic_index_key": secrets.token_urlsafe(32),
            "facility_id": "clinic-" + secrets.token_hex(3)}
    path.write_text(json.dumps(keys, indent=2), encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return keys


def free_port(start: int) -> int:
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if platform.system() != "Windows":
                # Same rule as the server itself, so a port that just closed
                # (e.g. after a restart) counts as free and the address stays put.
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                continue
    raise SystemExit(f"No free port between {start} and {start + 19}.")


def lan_address() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return ""


def open_when_ready(url: str):
    for _ in range(120):
        try:
            urllib.request.urlopen(url + "/api/health", timeout=1)
            webbrowser.open(url)
            return
        except Exception:
            time.sleep(0.5)


def main():
    port = 8001
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    port = free_port(port)

    d = data_dir()
    (d / "uploads").mkdir(parents=True, exist_ok=True)
    keys = install_keys(d)
    base = bundle_dir()

    env = {
        "DEPLOYMENT_MODE": "standalone",
        "IS_CLOUD_NODE": "false",
        "MEDILINK_DATA_DIR": str(d),
        "HARNOVA_DATA_DIR": str(d),
        "UPLOAD_DIR": str(d / "uploads"),
        "DATABASE_URL": "sqlite:///" + str(d / "medilink.db").replace("\\", "/"),
        "FRONTEND_DIST": str(base / "static"),
        "IC_ENCRYPTION_KEY": keys["ic_encryption_key"],
        "IC_INDEX_KEY": keys["ic_index_key"],
        "FACILITY_ID": keys["facility_id"],
        "KIOSK_TOKEN": BUILD_KIOSK_TOKEN,
        "MEDILINK_PORT": str(port),
    }
    for k, v in env.items():
        os.environ.setdefault(k, v)
    sys.path.insert(0, str(base))

    url = f"http://127.0.0.1:{port}"
    lan = lan_address()
    print(f"\n  {APP} is starting…\n")
    print(f"  On this computer   {url}")
    print(f"  Kiosk              {url}/kiosk")
    if lan:
        print(f"  Other devices      http://{lan}:{port}  (same Wi-Fi or network)")
    print(f"\n  Clinic data        {d}")
    print("  Back up this folder, including keys.json, to keep your records safe.")
    print("\n  Keep this window open while the clinic is working. Close it to stop.\n")

    if not os.environ.pop("MEDILINK_RESTARTED", None):     # a restart keeps the browser tab it has
        threading.Thread(target=open_when_ready, args=(url,), daemon=True).start()

    import uvicorn
    import server  # noqa: E402  (needs the environment above)
    uvicorn.run(server.app, host="0.0.0.0", port=port, log_level="warning")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except SystemExit:
        raise
    except Exception as e:                         # keep the window open to show why
        print(f"\n  {APP} could not start: {e}\n")
        if sys.stdin and sys.stdin.isatty():
            input("  Press Enter to close…")
        raise
