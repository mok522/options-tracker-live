# App-Level Login — Single Password Gate

_Design spec · 2026-06-29_

## Context
The app is deployed in production at `https://options-tracker-lake-one.vercel.app`
with no authentication of its own — anyone with the URL can view the owner's
synced trade data and trigger Schwab syncs. This adds an app-level login so the
site is private. It is a single-user personal tracker (one Turso DB, one Schwab
account, tokens in the `settings` table), so the goal is to gate *the app* behind
a sign-in, not to build multi-user accounts.

## Approach
A **single password gate**: one shared secret the owner types to unlock the app.
Chosen over an OAuth provider (Auth.js) or stored username+password because it is
proportionate for one user, adds no dependencies, and introduces no new provider.

Mechanism: a `/login` page posts the password to a Node-runtime route, which
verifies it against an env secret and sets a signed, httpOnly session cookie.
Next.js **middleware** verifies that cookie on every request and redirects to
`/login` when it is missing, invalid, or expired. The session is **stateless** —
the cookie carries a signed expiry; there is no session table and no DB read in
the request hot path.

## Components

| File | Responsibility |
|------|----------------|
| `middleware.ts` (root) | Gate all routes except the public allowlist; verify the session cookie's HMAC + expiry. Redirect unauthenticated browser requests to `/login`; return 401 for unauthenticated API requests. |
| `app/login/page.tsx` | Minimal login screen using existing `theme.css` tokens — Logo, one password input, submit, inline error state. No new UI deps. |
| `app/api/app-auth/login/route.ts` | Node runtime. Timing-safe compare of submitted password against `APP_PASSWORD`; on success set the `ott_session` cookie and redirect to `/`. On failure return to `/login` with an error. |
| `app/api/app-auth/logout/route.ts` | Clear the `ott_session` cookie, redirect to `/login`. |
| `lib/appAuth.ts` | `signSession(expiryMs)` / `verifySession(value)` helpers using HMAC-SHA256 over the expiry with `AUTH_SECRET`, via Web Crypto (`crypto.subtle`) so the same code runs in both the route handler and edge middleware. Also `isAuthDisabled()` and a constant-time string compare. |
| `components/layout/Topbar.tsx` | Add a small **Log out** control near the connection dot / avatar that hits `/api/app-auth/logout`. |

The `app-auth` namespace deliberately separates these endpoints from the existing
Schwab OAuth routes under `/api/auth/*`.

## Session cookie
- Name: `ott_session`
- Flags: `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`
- Value: `base64url(expiryTs)` + `.` + `base64url(HMAC_SHA256(expiryTs, AUTH_SECRET))`
- Lifetime: **30 days** (cookie `Max-Age` and the signed `expiryTs` agree)
- Verification: middleware splits the value, recomputes the HMAC over the expiry,
  rejects on signature mismatch or `expiryTs < now`. A tampered or expired cookie
  fails closed.

## Middleware gating
- Matcher excludes Next internals and static assets (`/_next/*`, favicon, etc.).
- Public allowlist (no session required): `/login`, `/api/app-auth/login`.
- Everything else requires a valid `ott_session`:
  - Browser/navigation requests → 302 redirect to `/login`.
  - `/api/*` requests → `401` JSON (so a stale tab fails cleanly rather than
    redirecting an API call to an HTML page).
- The Schwab routes (`/api/auth/schwab`, `/api/auth/callback`) remain **protected** —
  the owner must be logged in before connecting Schwab. The callback is hit by the
  owner's already-authenticated browser, so the cookie is present and it succeeds.

## Environment variables
Two new secrets, added to Vercel (Production) and `.env.local` by the owner — the
assistant does not enter secret values:
- `APP_PASSWORD` — the password typed at `/login`.
- `AUTH_SECRET` — random signing key (e.g. `openssl rand -base64 32`).

Optional, local-dev only:
- `DISABLE_APP_AUTH=true` — bypasses the gate for local development.

## Fail-safe behavior
- In production, if `APP_PASSWORD` or `AUTH_SECRET` is unset, the gate **fails
  closed** (denies access) rather than allowing everyone in.
- `DISABLE_APP_AUTH=true` is the only way to bypass the gate, intended for local
  dev. It is never set in the Vercel production environment.

## Out of scope (YAGNI)
- Rate limiting / lockout after repeated failures (single user; can add later).
- Multi-user accounts, roles, password reset flows, "remember this device".
- Encrypting the Schwab tokens at rest (tracked separately).

## Verification
1. **Unit (deterministic):** `signSession`/`verifySession` round-trips; a tampered
   signature and an expired `expiryTs` both fail; constant-time compare matches.
2. **Static:** `tsc --noEmit` + `eslint` on new/changed files clean.
3. **Local end-to-end:** with `APP_PASSWORD`/`AUTH_SECRET` set, hitting `/` redirects
   to `/login`; correct password sets the cookie and lands on the dashboard; wrong
   password shows the error; `/api/*` without the cookie returns 401; logout clears
   the cookie and re-gates. Confirm `DISABLE_APP_AUTH=true` bypasses locally.
4. **Production:** after the owner adds the two secrets and a `vercel --prod` deploy,
   the live URL prompts for the password and the existing Schwab connect/sync flow
   still works once logged in.
