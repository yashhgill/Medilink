// Pulih entitlement helper.
//
// One /api/health call tells us everything the UI needs to branch on:
//   deployment_mode  what this BUILD is  ("standalone" | "networked")
//   tier             what the LICENCE entitles ("core" | "connect")
//   features         the explicit feature list for that tier
//   licence          { state, notify, admin_locked, days_left, message }
//
// Important: hiding UI here is a courtesy, not a security boundary. Every
// gated feature is also enforced server-side (see require_feature in
// server.py), because a hidden button is not an access control.
import { useEffect, useState } from "react";
import api from "@/lib/api";

const EMPTY = {
  mode: null,
  tier: null,
  features: [],
  licence: null,
  syncEnabled: false,
};

let _cache = null;
const _subs = new Set();
let _inflight = null;

function _emit() {
  _subs.forEach((fn) => fn(_cache));
}

/** Fetch once and cache. Concurrent callers share the same request. */
export async function loadMode(force = false) {
  if (_cache && !force) return _cache;
  if (_inflight && !force) return _inflight;

  _inflight = (async () => {
    try {
      const r = await api.get("/health");
      const d = r.data || {};
      _cache = {
        mode: d.deployment_mode === "standalone" ? "standalone" : "networked",
        tier: d.tier === "connect" ? "connect" : "core",
        features: Array.isArray(d.features) ? d.features : [],
        licence: d.licence || null,
        syncEnabled: !!d.sync_enabled,
      };
    } catch {
      // Safe default. Showing everything and letting the server reject is far
      // better than hiding features from a paying clinic because one health
      // check blipped.
      _cache = { ...EMPTY, mode: "networked", tier: "connect", features: [] };
    }
    _inflight = null;
    _emit();
    return _cache;
  })();

  return _inflight;
}

/** Force a re-read, e.g. straight after activating a licence. */
export async function refreshMode() {
  return loadMode(true);
}

/** Imperative check, for non-React code paths. */
export function hasFeature(name) {
  if (!_cache) return true;              // unknown yet: don't hide things
  if (!_cache.features.length) return true;
  return _cache.features.includes(name);
}

/**
 * useMode() → {
 *   mode, isStandalone, isNetworked,
 *   tier, isCore, isConnect,
 *   can(feature), licence, syncEnabled, ready
 * }
 */
export function useMode() {
  const [state, setState] = useState(_cache);

  useEffect(() => {
    if (_cache) {
      setState(_cache);
    }
    const fn = (v) => setState(v);
    _subs.add(fn);
    loadMode();
    return () => _subs.delete(fn);
  }, []);

  const s = state || EMPTY;
  return {
    mode: s.mode,
    isStandalone: s.mode === "standalone",
    isNetworked: s.mode === "networked",

    tier: s.tier,
    isCore: s.tier === "core",
    isConnect: s.tier === "connect",

    // can("patient_app") etc. Unknown state returns true so the UI never
    // flashes "upgrade" at a customer who actually paid.
    can: (f) => (s.features.length ? s.features.includes(f) : true),

    licence: s.licence,
    syncEnabled: s.syncEnabled,
    ready: state !== null,
  };
}
