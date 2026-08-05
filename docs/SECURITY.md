# MediLink — Security Design

Patient data is the highest-sensitivity data a small system can hold. MediLink's
controls are layered so that no single mistake exposes it.

## Authentication & authorization

| Control | Implementation |
|---|---|
| Passwords | bcrypt (per-password salt) |
| Sessions | JWT HS256; staff tokens expire in 12 h, patient tokens 7 d |
| Roles | patient / doctor / pharmacist / receptionist / admin — enforced by `role_required` dependency on every sensitive route |
| Brute force | 5 failed logins per email+IP per 15 min → HTTP 429; failures audit-logged |
| Kiosk devices | Every `/kiosk/*` call requires `X-Kiosk-Token` (shared device secret) — blocks IC enumeration and forged check-ins from the open network |

## Public/clinic boundary

Internet traffic (identified by Cloudflare `CF-Ray`) is restricted to the patient
experience only. Staff sign-in, registration and all kiosk APIs return 403 from
the internet, with blocked attempts audit-logged. Enforcement is server-side;
UI hiding is cosmetic on top.

## Payment integrity

- Payment confirmation is idempotent and state-checked (only `pending`/`initiated`
  can transition to `succeeded`; repeats return `already_confirmed`).
- Kiosk confirmations require the device token; app confirmations require the
  paying patient's own session.

## Data protection

- TLS everywhere: self-signed on LAN, Cloudflare-issued on the public edge.
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).
- CORS: explicit origins + private-LAN regex — never wildcard-with-credentials.
- Secrets live in untracked `.env` files; the repository contains no credentials.
- Supabase Data API disabled on the mirror project — the cloud DB is reachable
  only over the Postgres protocol with its own credential.
- File attachments (X-rays, documents) are stored on the clinic server, streamed
  only through an authenticated, role-checked endpoint; every download is
  audit-logged (PDPA access-trail).

## Audit trail

`audit_logs` records login success/failure, blocked public staff attempts,
record reads, attachment uploads/downloads, and payment confirmations — with
actor, role, resource and IP.

## AI safety

All AI calls pass through a single gateway that appends non-negotiable rules:
no diagnoses, no medication changes, defer to the clinician, escalate when
uncertain. The triage parser validates output and fails safe to Green.

## Known limitations (honest register)

- Local Postgres is not encrypted at rest (mitigation: FileVault full-disk
  encryption on the host; roadmap: pgcrypto for IC numbers).
- JWTs are not revocable before expiry (mitigation: short staff TTL).
- The dev-mode web server should be replaced by a production build behind
  nginx for a real deployment.
