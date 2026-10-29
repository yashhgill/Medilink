"""Issue a trial clinic its Pulih cloud key.

    CLOUD_ADMIN_URL='postgresql://postgres.<ref>:<owner password>@<pooler host>:5432/postgres' \\
        python tools/provision_clinic.py clinic-3f2a1b "Klinik Sejahtera"

The clinic reads its Clinic ID from Clinic settings → Cloud and sends it to you.
This creates (or re-keys) that clinic's own database login on the cloud node,
which can only ever see its own clinic's rows, and prints a key starting with
mlk1. Send the key to the clinic privately; they paste it into the same screen.

    python tools/provision_clinic.py --suspend clinic-3f2a1b    # end a trial

Needs migrations 002, 003 and 004 applied, and the owner connection.
"""
import base64
import json
import os
import secrets
import sys
from urllib.parse import urlparse, urlunparse, quote

import psycopg2


def clinic_url(admin_url: str, role: str, password: str) -> str:
    u = urlparse(admin_url)
    user = u.username or ""
    # Supabase's pooler names users "<role>.<project ref>"; a direct host does not.
    ref = user.split(".", 1)[1] if "." in user else None
    login = f"{role}.{ref}" if ref else role
    netloc = f"{quote(login)}:{quote(password, safe='')}@{u.hostname}" + (f":{u.port}" if u.port else "")
    return urlunparse((u.scheme, netloc, u.path or "/postgres", "", "", ""))


def main():
    admin = os.environ.get("CLOUD_ADMIN_URL")
    if not admin:
        sys.exit("Set CLOUD_ADMIN_URL to the project owner's connection string.")
    args = sys.argv[1:]
    con = psycopg2.connect(admin, connect_timeout=10)
    con.autocommit = True
    cur = con.cursor()
    if args[:1] == ["--suspend"]:
        cur.execute("SELECT medilink.suspend_clinic(%s)", (args[1],))
        print(f"Clinic {args[1]} suspended: its login no longer works; its records stay on the cloud.")
        return
    if len(args) != 2:
        sys.exit(__doc__)
    facility, name = args
    password = secrets.token_urlsafe(32)
    cur.execute("SELECT medilink.provision_clinic(%s, %s, %s)", (facility, name, password))
    role = cur.fetchone()[0]
    url = clinic_url(admin, role, password)
    payload = json.dumps({"u": url, "f": facility, "s": "medilink"}, separators=(",", ":")).encode()
    key = "mlk1." + base64.urlsafe_b64encode(payload).decode().rstrip("=")
    print(f"\nCloud key for {name} ({facility}), login {role}:\n\n{key}\n")
    print("Send it privately. Issuing a new key for the same clinic replaces this one.")


if __name__ == "__main__":
    main()
