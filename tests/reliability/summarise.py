"""Turn raw experiment results into the figures and numbers used in the report.

    python summarise.py RESULTS_DIR FIGURES_DIR

Writes RESULTS_DIR/summary.json and the PNG charts for Chapter 6.
"""
import json, sys, statistics
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

R = Path(sys.argv[1]); F = Path(sys.argv[2]); F.mkdir(parents=True, exist_ok=True)
INK, MUTE, LOCAL, CLOUD, RED, GRID = "#16324a", "#6b7d8c", "#0E6B58", "#8a5a9e", "#c0392b", "#e3e8ec"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "axes.edgecolor": INK,
                     "axes.labelcolor": INK, "xtick.color": INK, "ytick.color": INK,
                     "axes.spines.top": False, "axes.spines.right": False})
load = lambda n: json.loads((R / n).read_text())
S = {}

# ── E1 ───────────────────────────────────────────────────────────────────────
def downtime_windows(label, mode):
    """Downtime as the number of 1-second windows in which a clinical request was
    failing (its interval overlaps the window) and no request completed successfully.
    Summing failed requests' durations instead counts overlapping failures twice
    and a 0.7 s refusal as 0.7 s of downtime even when every other second failed."""
    raw = load(f"e1-{label}-{mode}-raw.json")
    t0 = min(r["t0"] for r in raw)
    bad, good = set(), set()
    for r in raw:
        s = r["t0"] - t0; e = s + r["ms"] / 1000
        if r["ok"]:
            good.add(int(e))
        else:
            bad.update(range(int(s), int(e) + 1))
    return len(bad - good)

def e1(label, mode):
    d = load(f"e1-{label}-{mode}.json")
    d["downtime_s"] = downtime_windows(label, mode)
    return {"during_avail": d["phases"]["during"]["availability_pct"],
            "before_avail": d["phases"]["before"]["availability_pct"],
            "after_avail": d["phases"]["after"]["availability_pct"],
            "during_req": d["phases"]["during"]["requests"],
            "during_ok": d["phases"]["during"]["succeeded"],
            "p50_before": d["phases"]["before"]["p50_ms"], "p95_before": d["phases"]["before"]["p95_ms"],
            "p50_during": d["phases"]["during"]["p50_ms"], "p95_during": d["phases"]["during"]["p95_ms"],
            "downtime": d["downtime_s"], "outage_s": d["outage_s"], "by_op": d["by_op_during"]}
S["e1"] = {"lf_down": e1("local-first", "down"), "lf_bh": e1("local-first", "blackhole"),
           "co_down": e1("cloud-only", "down"), "co_bh": e1("cloud-only", "blackhole")}

fig, axes = plt.subplots(2, 1, figsize=(7.2, 4.6), sharex=True)
for ax, (label, colour, title) in zip(axes, [("local-first", LOCAL, "Local-first (Pulih)"),
                                              ("cloud-only", CLOUD, "Same software, cloud-only")]):
    d = load(f"e1-{label}-down.json"); raw = load(f"e1-{label}-down-raw.json")
    t0 = d["t_start"]; td, tu = d["events"][0]["t"] - t0, d["events"][1]["t"] - t0
    ax.axvspan(td, tu, color="#f7dcdc", lw=0, zorder=0)
    ok = [(r["t0"] - t0, r["ms"]) for r in raw if r["ok"]]
    bad = [(r["t0"] - t0, min(r["ms"], 30000)) for r in raw if not r["ok"]]
    ax.scatter([x for x, _ in ok], [y for _, y in ok], s=7, color=colour, label="succeeded", zorder=3)
    ax.scatter([x for x, _ in bad], [y for _, y in bad], s=12, marker="x", color=RED, label="failed", zorder=3)
    ax.set_yscale("log"); ax.set_ylabel("response time (ms)")
    ax.set_title(f"{title}: {d['phases']['during']['availability_pct']}% of requests served during the outage",
                 fontsize=9, loc="left", color=INK)
    ax.grid(axis="y", color=GRID, lw=0.6); ax.text(td + 1, ax.get_ylim()[1] * 0.6, "cloud link down", color=RED, fontsize=8)
axes[0].legend(loc="upper right", frameon=False, fontsize=8)
axes[1].set_xlabel("seconds since start of run")
fig.tight_layout(); fig.savefig(F / "fig-6-1-e1-availability.png", dpi=200); plt.close(fig)

# ── E2 ───────────────────────────────────────────────────────────────────────
fin = load("e2-final.json")["runs"]; bef = load("e2-before-fix.json")["runs"]
vols = sorted({r["visits_offline"] for r in fin})
agg = []
for v in vols:
    rs = [r for r in fin if r["visits_offline"] == v]
    rec = [r["recovery_s"] for r in rs if r["recovery_s"] is not None]
    agg.append({"visits": v, "rows": statistics.mean(r["queue_at_reconnect"] for r in rs),
                "runs": len(rs), "recovery_mean": round(statistics.mean(rec), 2) if rec else None,
                "recovery_min": min(rec) if rec else None, "recovery_max": max(rec) if rec else None,
                "missing": sum(r["missing_total"] for r in rs),
                "writes_ok": sum(r["writes_ok"] for r in rs), "writes_total": sum(r["writes_total"] for r in rs),
                "offline_p95": round(statistics.mean(r["offline_write_p95_ms"] for r in rs), 1)})
S["e2"] = {"final": agg, "before": [{"visits": r["visits_offline"], "rows": r["queue_at_reconnect"],
            "stranded": r["stranded_after"], "missing": r["missing_total"], "recovery": r["recovery_s"],
            "writes_ok": r["writes_ok"], "writes_total": r["writes_total"]} for r in bef],
           "max_visits": max(vols), "max_recovery": max(a["recovery_max"] for a in agg),
           "total_missing": sum(a["missing"] for a in agg),
           "total_writes": sum(a["writes_total"] for a in agg), "total_ok": sum(a["writes_ok"] for a in agg)}

fig, (a1, a2) = plt.subplots(1, 2, figsize=(7.2, 3.0))
bx = [b["visits"] for b in S["e2"]["before"]]
a1.plot(bx, [b["recovery"] for b in S["e2"]["before"]], "o-", color=RED, label="original engine")
a1.errorbar([a["visits"] for a in agg], [a["recovery_mean"] for a in agg],
            yerr=[[a["recovery_mean"] - a["recovery_min"] for a in agg], [a["recovery_max"] - a["recovery_mean"] for a in agg]],
            fmt="o-", color=LOCAL, capsize=3, label="revised engine (mean, range of 3)")
a1.set_xlabel("visits made while offline"); a1.set_ylabel("recovery time (s)")
a1.set_title("Time to an empty queue after reconnection", fontsize=9, loc="left")
a1.legend(frameon=False, fontsize=7.5); a1.grid(axis="y", color=GRID, lw=0.6)
a2.bar([str(b["visits"]) for b in S["e2"]["before"]], [b["missing"] for b in S["e2"]["before"]], color=RED, width=0.5,
       label="original engine")
a2.set_title("Records missing from the cloud after recovery", fontsize=9, loc="left")
a2.set_xlabel("visits made while offline"); a2.set_ylabel("records missing")
for i, b in enumerate(S["e2"]["before"]):
    a2.text(i, b["missing"] + 0.4, str(b["missing"]), ha="center", fontsize=8, color=INK)
a2.text(0.98, 0.92, f"revised engine: 0 missing in all {len(fin)} runs", transform=a2.transAxes, ha="right",
        fontsize=8, color=LOCAL)
a2.grid(axis="y", color=GRID, lw=0.6)
fig.tight_layout(); fig.savefig(F / "fig-6-2-e2-recovery.png", dpi=200); plt.close(fig)

# ── E3 ───────────────────────────────────────────────────────────────────────
S["e3"] = {}
fig, ax = plt.subplots(figsize=(7.2, 2.8))
for lat, colour in ((0, LOCAL), (40, "#2e86a8")):
    p = R / f"e3-local-first-lat{lat}.json"
    if not p.exists():
        continue
    d = json.loads(p.read_text())
    S["e3"][f"lat{lat}"] = {k: d[k] for k in ("n", "replicated", "p50_ms", "p90_ms", "p95_ms", "p99_ms", "mean_ms", "max_ms")}
    S["e3"][f"lat{lat}"]["p50"] = d["p50_ms"]
    vals = sorted(x["ms"] for x in d["samples"] if x["ms"] is not None)
    ax.plot(vals, [i / len(vals) for i in range(1, len(vals) + 1)], color=colour, lw=1.6,
            label=f"{lat} ms added per hop: median {d['p50_ms']} ms, p95 {d['p95_ms']} ms")
ax.set_xlabel("commit to cloud visibility (ms)"); ax.set_ylabel("share of records")
ax.set_title("Replication latency with the link up (200 records each)", fontsize=9, loc="left")
ax.legend(frameon=False, fontsize=8, loc="lower right"); ax.grid(color=GRID, lw=0.6)
fig.tight_layout(); fig.savefig(F / "fig-6-3-e3-latency.png", dpi=200); plt.close(fig)

# ── Tenant isolation (tests/isolation) ──────────────────────────────────────
iso = R.resolve().parent.parent / "isolation" / "results" / "isolation.json"
if iso.exists():
    S["rls"] = json.loads(iso.read_text())

(R / "summary.json").write_text(json.dumps(S, indent=2))
print(json.dumps({k: v for k, v in S.items() if k != "e2"}, indent=1)[:3000])
print(json.dumps(S["e2"]["final"], indent=1))
