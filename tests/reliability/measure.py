"""PSM 2 reliability measurements (Objective PO4, Table 3.7 of the PSM 1 report).

Drives a running clinic node through its public API exactly as the clinic
would use it, induces a clinic-to-cloud outage with netfault.py, and measures:

  E1  availability and downtime of clinical requests during an outage
  E2  recovery time against the number of writes made while offline,
      and integrity (local vs cloud) after recovery
  E3  replication latency, commit to cloud visibility, with the link up

Every number in the report comes from a JSON file this script writes.

    python measure.py e1 --label local-first  --outage down
    python measure.py e2 --volumes 10,50,100,250,500
    python measure.py e3 --n 200 --latency-ms 0
"""
import argparse, asyncio, json, os, random, sqlite3, statistics, time
from pathlib import Path

import asyncpg
import httpx

B = os.environ.get("CLINIC_URL", "http://127.0.0.1:8001")
CTRL = os.environ.get("NETFAULT_URL", "http://127.0.0.1:6600")
CLOUD_DSN = os.environ.get("CLOUD_DSN_DIRECT", "postgresql://postgres@127.0.0.1:5433/cloud")
LOCAL_DB = os.environ.get("LOCAL_DB", "data/melaka/medilink.db")
KIOSK = {"X-Kiosk-Token": os.environ.get("KIOSK_TOKEN", "demo-kiosk-token")}
OUT = Path(os.environ.get("OUT_DIR", Path(__file__).parent / "results"))
OUT.mkdir(parents=True, exist_ok=True)
SYNC_TABLES = ["users", "appointments", "medical_records"]


_RUN = random.randint(0, 10**6)


def fresh_ic(i: int) -> str:
    """A well-formed, unique Malaysian IC (YYMMDD-PB-NNNN) for synthetic patients."""
    rnd = random.Random(_RUN * 100003 + i)
    return f"{rnd.randint(60, 99):02d}{rnd.randint(1, 12):02d}{rnd.randint(1, 28):02d}-{rnd.choice([1, 4, 10, 14]):02d}-{rnd.randint(0, 9999):04d}"


class Clinic:
    def __init__(self):
        self.c = httpx.AsyncClient(base_url=B, timeout=httpx.Timeout(30.0))
        self.doc = None

    async def login(self):
        r = await self.c.post("/api/auth/login", json={"email": "dr.tan@medilink.io", "password": "Doctor@123"})
        self.doc = {"Authorization": f"Bearer {r.json()['token']}"}

    async def visit(self, i: int, log: list, tag: str = ""):
        """One patient visit: register at the kiosk, check in, doctor writes the record.
        Every step is timed and logged with its outcome."""
        ic = fresh_ic(i)
        ids = {}
        for name, fn in (
            ("register", lambda: self.c.post("/api/kiosk/register", headers=KIOSK,
                json={"name": f"Pesakit {i}", "ic_number": ic, "phone": "0120000000"})),
            ("checkin", lambda: self.c.post("/api/kiosk/checkin", headers=KIOSK,
                json={"ic_number": ic, "symptoms": "demam dan batuk"})),
            ("record", lambda: self.c.post("/api/records", headers=self.doc,
                json={"patient_id": ids.get("patient"), "appointment_id": ids.get("appt"),
                      "diagnosis": "URTI", "notes": f"measurement {tag} {i}"})),
        ):
            t0 = time.time()
            try:
                r = await fn()
                ok = r.status_code < 400
                body = r.json() if ok else {}
            except Exception as e:
                ok, body, r = False, {}, None
            t1 = time.time()
            err = None if ok else (getattr(r, "text", "") or "no response")[:160]
            if name == "register" and ok:
                ids["patient"] = body.get("id") or (body.get("patient") or {}).get("id")
            if name == "checkin" and ok:
                ids["appt"] = (body.get("appointment") or {}).get("id") or body.get("id")
            if name == "record" and ok:
                ids["record"] = body.get("id")
            log.append({"op": name, "i": i, "t0": t0, "t1": t1, "ms": (t1 - t0) * 1000,
                        "ok": ok, "status": getattr(r, "status_code", 0), "err": err})
            if not ok:
                break
        return ids

    async def read(self, log: list):
        t0 = time.time()
        try:
            r = await self.c.get("/api/queue/today", headers=self.doc)
            ok = r.status_code < 400
        except Exception:
            ok, r = False, None
        t1 = time.time()
        log.append({"op": "read_queue", "t0": t0, "t1": t1, "ms": (t1 - t0) * 1000, "ok": ok,
                    "status": getattr(r, "status_code", 0)})


async def netfault(mode: str, **q):
    async with httpx.AsyncClient() as c:
        qs = "&".join(f"{k}={v}" for k, v in q.items())
        return (await c.get(f"{CTRL}/{mode}" + (f"?{qs}" if qs else ""))).json()


def local_queue():
    con = sqlite3.connect(LOCAL_DB)
    try:
        rows = con.execute("select synced, attempts >= 5, count(*) from sync_queue group by 1, 2").fetchall()
    finally:
        con.close()
    pending = sum(n for s, stuck, n in rows if not s and not stuck)
    stranded = sum(n for s, stuck, n in rows if not s and stuck)
    return pending, stranded


def local_ids(table: str) -> set:
    con = sqlite3.connect(LOCAL_DB)
    try:
        return {r[0] for r in con.execute(f"select id from {table}")}
    finally:
        con.close()


async def cloud_ids(table: str) -> set:
    con = await asyncpg.connect(CLOUD_DSN)
    try:
        return {r[0] for r in await con.fetch(f"select id from {table}")}
    finally:
        await con.close()


async def integrity(created: dict) -> dict:
    """For every row the run created, is it on the cloud? Checks ids, not counts."""
    out = {}
    for t, ids in created.items():
        ids = {x for x in ids if x}
        cl = await cloud_ids(t)
        missing = ids - cl
        out[t] = {"created": len(ids), "in_cloud": len(ids) - len(missing), "missing": len(missing)}
    return out


def pct(xs, p):
    if not xs:
        return None
    xs = sorted(xs)
    k = (len(xs) - 1) * p / 100
    f = int(k); c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)


def summarise(rows):
    ms = [r["ms"] for r in rows if r["ok"]]
    return {"requests": len(rows), "succeeded": sum(r["ok"] for r in rows),
            "availability_pct": round(100 * sum(r["ok"] for r in rows) / len(rows), 2) if rows else None,
            "p50_ms": round(pct(ms, 50), 1) if ms else None, "p95_ms": round(pct(ms, 95), 1) if ms else None,
            "max_ms": round(max(ms), 1) if ms else None}


# ── E1: availability and downtime through an outage ─────────────────────────
async def e1(label: str, mode: str, before: float, outage: float, after: float, rate: float):
    cl = Clinic(); await cl.login()
    await netfault("up")
    log, events = [], []
    t_start = time.time()
    stop = t_start + before + outage + after
    i = 0

    async def driver():
        nonlocal i
        while time.time() < stop:
            i += 1
            asyncio.create_task(cl.visit(i, log, label))
            asyncio.create_task(cl.read(log))
            await asyncio.sleep(1 / rate)

    async def chaos():
        await asyncio.sleep(before)
        events.append({"t": time.time(), "event": f"link {mode}"}); await netfault(mode)
        await asyncio.sleep(outage)
        events.append({"t": time.time(), "event": "link up"}); await netfault("up")

    await asyncio.gather(driver(), chaos())
    await asyncio.sleep(35)   # let in-flight requests finish (some hang until timeout)
    t_down, t_up = events[0]["t"], events[1]["t"]
    phase = lambda r: "before" if r["t0"] < t_down else ("during" if r["t0"] < t_up else "after")
    phases = {p: summarise([r for r in log if phase(r) == p]) for p in ("before", "during", "after")}
    # Downtime: total time within the window in which no request started then was answered successfully
    fails = sorted((r["t0"], r["t1"]) for r in log if not r["ok"])
    downtime = 0.0
    if fails:
        cur_s, cur_e = fails[0]
        for s, e in fails[1:]:
            if s <= cur_e:
                cur_e = max(cur_e, e)
            else:
                downtime += cur_e - cur_s; cur_s, cur_e = s, e
        downtime += cur_e - cur_s
    res = {"experiment": "E1", "label": label, "outage_mode": mode, "outage_s": outage,
           "rate_visits_per_s": rate, "phases": phases, "downtime_s": round(downtime, 2),
           "by_op_during": {op: summarise([r for r in log if phase(r) == "during" and r["op"] == op])
                            for op in sorted({r["op"] for r in log})},
           "events": events, "t_start": t_start}
    (OUT / f"e1-{label}-{mode}.json").write_text(json.dumps(res, indent=2))
    (OUT / f"e1-{label}-{mode}-raw.json").write_text(json.dumps(log))
    print(json.dumps({k: res[k] for k in ("label", "outage_mode", "downtime_s", "phases")}, indent=2))


# ── E2: recovery time against write volume ──────────────────────────────────
async def e2(volumes, label: str, repeats: int):
    cl = Clinic(); await cl.login()
    results = []
    for n in volumes:
        for rep in range(repeats):
            await netfault("up")
            # start from a drained queue
            for _ in range(240):
                if local_queue()[0] == 0:
                    break
                await asyncio.sleep(0.5)
            await netfault("down")
            log, created = [], {t: set() for t in SYNC_TABLES}
            t_w0 = time.time()
            sem = asyncio.Semaphore(8)

            async def one(k):
                async with sem:
                    ids = await cl.visit(k, log, f"{label}-n{n}")
                    created["users"].add(ids.get("patient")); created["appointments"].add(ids.get("appt"))
                    created["medical_records"].add(ids.get("record"))
            await asyncio.gather(*(one(k) for k in range(n)))
            t_w1 = time.time()
            ok_writes = sum(r["ok"] for r in log); all_writes = len(log)
            pend0, strand0 = local_queue()
            await asyncio.sleep(2)
            t_up = time.time(); await netfault("up")
            curve, drained_at = [], None
            deadline = t_up + 300
            while time.time() < deadline:
                p, s = local_queue()
                curve.append({"t": round(time.time() - t_up, 2), "pending": p, "stranded": s})
                if p == 0:
                    drained_at = time.time() - t_up
                    break
                await asyncio.sleep(0.25)
            await asyncio.sleep(1)
            integ = await integrity(created)
            p_end, s_end = local_queue()
            row = {"label": label, "visits_offline": n, "repeat": rep, "writes_ok": ok_writes, "writes_total": all_writes,
                   "offline_write_p95_ms": round(pct([r["ms"] for r in log if r["ok"]], 95) or 0, 1),
                   "queue_at_reconnect": pend0 + strand0, "stranded_at_reconnect": strand0,
                   "recovery_s": round(drained_at, 2) if drained_at is not None else None,
                   "stranded_after": s_end, "integrity": integ,
                   "write_failures": [{"op": r["op"], "status": r["status"], "err": r["err"]} for r in log if not r["ok"]],
                   "missing_total": sum(v["missing"] for v in integ.values()),
                   "curve": curve}
            results.append(row)
            print(json.dumps({k: v for k, v in row.items() if k != "curve"}))
    (OUT / f"e2-{label}.json").write_text(json.dumps({"experiment": "E2", "label": label, "runs": results}, indent=2))


# ── E3: replication latency, link up ────────────────────────────────────────
async def e3(n: int, latency_ms: int, label: str):
    cl = Clinic(); await cl.login()
    await netfault("up"); await netfault("latency", ms=latency_ms)
    con = await asyncpg.connect(CLOUD_DSN)
    lat = []
    try:
        for k in range(n):
            log = []
            ids = await cl.visit(k, log, f"e3-{label}")
            rec = ids.get("record")
            commit = next((r["t1"] for r in log if r["op"] == "record" and r["ok"]), None)
            if not rec or commit is None:
                continue
            seen = None
            while time.time() - commit < 60:
                if await con.fetchval("select 1 from medical_records where id=$1", rec):
                    seen = time.time(); break
                await asyncio.sleep(0.01)
            lat.append({"record": rec, "ms": round((seen - commit) * 1000, 1) if seen else None})
            await asyncio.sleep(0.1)
    finally:
        await con.close()
        await netfault("latency", ms=0)
    vals = [x["ms"] for x in lat if x["ms"] is not None]
    res = {"experiment": "E3", "label": label, "injected_latency_ms": latency_ms, "n": len(lat),
           "replicated": len(vals), "p50_ms": round(pct(vals, 50), 1), "p90_ms": round(pct(vals, 90), 1),
           "p95_ms": round(pct(vals, 95), 1), "p99_ms": round(pct(vals, 99), 1),
           "mean_ms": round(statistics.mean(vals), 1), "max_ms": max(vals), "samples": lat}
    (OUT / f"e3-{label}-lat{latency_ms}.json").write_text(json.dumps(res, indent=2))
    print(json.dumps({k: v for k, v in res.items() if k != "samples"}, indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("exp", choices=["e1", "e2", "e3"])
    ap.add_argument("--label", default="local-first")
    ap.add_argument("--outage", default="down", choices=["down", "blackhole"])
    ap.add_argument("--before", type=float, default=30); ap.add_argument("--outage-s", type=float, default=60)
    ap.add_argument("--after", type=float, default=30); ap.add_argument("--rate", type=float, default=1.0)
    ap.add_argument("--volumes", default="10,50,100,250"); ap.add_argument("--repeats", type=int, default=1)
    ap.add_argument("--n", type=int, default=200); ap.add_argument("--latency-ms", type=int, default=0)
    a = ap.parse_args()
    if a.exp == "e1":
        asyncio.run(e1(a.label, a.outage, a.before, a.outage_s, a.after, a.rate))
    elif a.exp == "e2":
        asyncio.run(e2([int(x) for x in a.volumes.split(",")], a.label, a.repeats))
    else:
        asyncio.run(e3(a.n, a.latency_ms, a.label))
