# App-Level Password Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the whole app behind a single shared password, enforced by a signed httpOnly session cookie verified in Next.js middleware.

**Architecture:** A `/login` page POSTs the password to a Node route that timing-safe-compares it against `APP_PASSWORD` and sets a stateless `ott_session` cookie (HMAC of an expiry timestamp, signed with `AUTH_SECRET`). Root `middleware.ts` verifies that cookie on every request, redirecting browsers to `/login` and returning 401 to API calls. No session store, no new dependencies, fail-closed in production.

**Tech Stack:** Next.js 16 (App Router, middleware, route handlers), Web Crypto (`crypto.subtle`, runs in both edge middleware and Node routes), TypeScript. Tests run via `npx tsx` assertion scripts (no test framework is installed; do not add one).

Spec: `docs/superpowers/specs/2026-06-29-app-password-gate-design.md`

---

### Task 1: Session helpers (`lib/appAuth.ts`)

**Files:**
- Create: `lib/appAuth.ts`
- Test: `/private/tmp/claude-501/-Users-michaelokeefe-Code-options-tracker-live/a3da3503-c168-4b72-b1fd-441008ca3517/scratchpad/verify-appauth.mts` (throwaway, not committed)

- [ ] **Step 1: Write the failing test**

Create the scratchpad test file:

```ts
import { signSession, verifySession, constantTimeEqual } from '@/lib/appAuth';

const SECRET = 'test-secret-abc';
let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

(async () => {
  const future = Date.now() + 60_000;
  const token = await signSession(future, SECRET);

  check('valid token verifies', await verifySession(token, SECRET) === true);
  check('wrong secret fails', await verifySession(token, 'other-secret') === false);
  check('tampered signature fails', await verifySession(token.slice(0, -2) + 'xx', SECRET) === false);
  check('garbage value fails', await verifySession('not-a-token', SECRET) === false);
  check('undefined value fails', await verifySession(undefined, SECRET) === false);

  const expired = await signSession(Date.now() - 1000, SECRET);
  check('expired token fails', await verifySession(expired, SECRET) === false);

  check('constantTimeEqual match', constantTimeEqual('abcdef', 'abcdef') === true);
  check('constantTimeEqual mismatch', constantTimeEqual('abcdef', 'abcdeg') === false);
  check('constantTimeEqual length mismatch', constantTimeEqual('abc', 'abcd') === false);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx <scratchpad>/verify-appauth.mts`
Expected: FAIL — cannot resolve `@/lib/appAuth` (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/appAuth.ts
// Stateless app-login session helpers. Web Crypto only, so the same code runs in
// edge middleware and Node route handlers. No session store — the cookie carries
// a signed expiry.

const COOKIE_NAME = 'ott_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str: string): Uint8Array {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(message: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

// Length-checked constant-time string compare (avoids early-exit timing leak).
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// "<base64url(expiryMs)>.<base64url(HMAC(expiryMs))>"
export async function signSession(expiryMs: number, secret: string): Promise<string> {
  const payload = String(expiryMs);
  const sig = b64url(await hmac(payload, secret));
  return `${b64url(new TextEncoder().encode(payload))}.${sig}`;
}

export async function verifySession(value: string | undefined, secret: string): Promise<boolean> {
  if (!value || !secret) return false;
  const [payloadB64, sig] = value.split('.');
  if (!payloadB64 || !sig) return false;
  let payload: string;
  try {
    payload = new TextDecoder().decode(b64urlToBytes(payloadB64));
  } catch {
    return false;
  }
  const expected = b64url(await hmac(payload, secret));
  if (!constantTimeEqual(sig, expected)) return false;
  const expiry = Number(payload);
  return Number.isFinite(expiry) && expiry > Date.now();
}

export function isAuthDisabled(): boolean {
  return process.env.DISABLE_APP_AUTH === 'true';
}

export const APP_AUTH = { COOKIE_NAME, SESSION_TTL_MS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx <scratchpad>/verify-appauth.mts`
Expected: `ALL PASS` (9 checks), exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/appAuth.ts
git commit -m "feat: add stateless app-login session helpers"
```

---

### Task 2: Login + logout route handlers

**Files:**
- Create: `app/api/app-auth/login/route.ts`
- Create: `app/api/app-auth/logout/route.ts`

- [ ] **Step 1: Write the login route**

```ts
// app/api/app-auth/login/route.ts
import { NextResponse } from 'next/server';
import { signSession, constantTimeEqual, APP_AUTH } from '@/lib/appAuth';

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get('password') ?? '');

  const expected = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  // Fail closed: missing secrets ⇒ no one gets in.
  const ok = !!expected && !!secret && constantTimeEqual(password, expected);

  if (!ok) {
    return NextResponse.redirect(new URL('/login?error=1', req.url), 303);
  }

  const value = await signSession(Date.now() + APP_AUTH.SESSION_TTL_MS, secret!);
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(APP_AUTH.COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(APP_AUTH.SESSION_TTL_MS / 1000),
  });
  return res;
}
```

- [ ] **Step 2: Write the logout route**

```ts
// app/api/app-auth/logout/route.ts
import { NextResponse } from 'next/server';
import { APP_AUTH } from '@/lib/appAuth';

export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.set(APP_AUTH.COOKIE_NAME, '', {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0,
  });
  return res;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 4: Commit**

```bash
git add app/api/app-auth/login/route.ts app/api/app-auth/logout/route.ts
git commit -m "feat: add app-login login/logout routes"
```

---

### Task 3: Middleware gate (`middleware.ts`)

**Files:**
- Create: `middleware.ts` (project root)

- [ ] **Step 1: Write the middleware**

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { verifySession, isAuthDisabled, APP_AUTH } from '@/lib/appAuth';

// Reachable without a session. Everything else requires a valid cookie.
const PUBLIC_PATHS = ['/login', '/api/app-auth/login'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isAuthDisabled() || PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET ?? '';
  const ok = await verifySession(req.cookies.get(APP_AUTH.COOKIE_NAME)?.value, secret);
  if (ok) return NextResponse.next();

  // Unauthenticated API calls get a clean 401 instead of an HTML redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next static assets and the favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: gate all routes behind app-login middleware"
```

---

### Task 4: Login page (`app/login/page.tsx`)

**Files:**
- Create: `app/login/page.tsx`

- [ ] **Step 1: Write the page**

Server component; plain HTML form POSTs to the login route (no client JS). `searchParams` is async in Next 16. Wrap in `.dash` so `theme.css` tokens apply.

```tsx
// app/login/page.tsx
import { Logo } from '@/components/shared/Logo';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="dash" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', padding: 24 }}>
      <form
        method="post"
        action="/api/app-auth/login"
        style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 14, padding: 24, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><Logo /></div>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Password</label>
        <input
          type="password"
          name="password"
          autoFocus
          required
          autoComplete="current-password"
          style={{ font: 'inherit', fontSize: 13, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }}
        />
        {error && <div style={{ fontSize: 12, color: 'var(--neg)' }}>Incorrect password</div>}
        <button
          type="submit"
          style={{ font: 'inherit', fontSize: 13, fontWeight: 600, padding: '9px 11px', borderRadius: 8, border: 0, cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: add login page"
```

---

### Task 5: Log out control in Topbar

**Files:**
- Modify: `components/layout/Topbar.tsx` (add a Log out link just before the avatar `<div>…MK</div>`)

- [ ] **Step 1: Add the link**

Find the avatar element near the end of the header:

```tsx
      <div style={{ width: 31, height: 31, borderRadius: 8, background: 'var(--accent-wash)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>MK</div>
```

Insert immediately before it:

```tsx
      <a
        href="/api/app-auth/logout"
        title="Log out"
        style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', textDecoration: 'none', padding: '6px 9px', borderRadius: 7, border: '1px solid var(--border)' }}
      >
        Log out
      </a>
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint components/layout/Topbar.tsx`
Expected: tsc clean; eslint shows only the pre-existing `'Icon' is defined but never used` warning (unrelated).

- [ ] **Step 3: Commit**

```bash
git add components/layout/Topbar.tsx
git commit -m "feat: add log out control to topbar"
```

---

### Task 6: Local env + end-to-end verification

**Files:**
- Modify: `.env.local` (gitignored — add the two new keys; never committed)

- [ ] **Step 1: Add local dev secrets**

Append to `.env.local` (these are local-only dev values; the real production values are added separately on Vercel by the owner):

```
APP_PASSWORD=devpassword
AUTH_SECRET=<output of: openssl rand -base64 32>
```

Generate the secret with: `openssl rand -base64 32`

- [ ] **Step 2: Restart dev server**

The dev server must be restarted to pick up new env vars. Ask the owner to stop their running `npm run dev` and start it again (or restart via the preview tooling). New env is not hot-reloaded.

- [ ] **Step 3: Verify the gate (curl, no browser needed)**

```bash
# Unauthenticated root → redirect to /login
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
# Expected: 307/308 ... /login   (or 200 of the login page if following)

# Unauthenticated API → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/anything
# Expected: 401

# Login page itself is reachable
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
# Expected: 200

# Correct password sets a cookie
curl -s -i -X POST http://localhost:3000/api/app-auth/login \
  -F "password=devpassword" | grep -iE "set-cookie|location"
# Expected: Set-Cookie: ott_session=...; HttpOnly; ... and Location: /

# Wrong password → back to /login?error=1, no cookie
curl -s -i -X POST http://localhost:3000/api/app-auth/login \
  -F "password=wrong" | grep -iE "set-cookie|location"
# Expected: Location: /login?error=1 ; no ott_session cookie
```

- [ ] **Step 4: Verify an authenticated request passes**

```bash
# Capture cookie then reuse it
COOKIE=$(curl -s -i -X POST http://localhost:3000/api/app-auth/login -F "password=devpassword" | grep -i set-cookie | sed -E 's/set-cookie: ([^;]+);.*/\1/I')
curl -s -o /dev/null -w "%{http_code}\n" -H "Cookie: $COOKIE" http://localhost:3000/
# Expected: 200 (dashboard renders)
```

- [ ] **Step 5: Commit (no file changes; verification only)**

No commit — `.env.local` is gitignored. Record results in the response.

---

### Task 7: Production rollout (owner-assisted)

**Files:** none (Vercel dashboard / CLI by the owner)

- [ ] **Step 1: Owner adds production secrets**

The assistant does not enter secret values. Owner runs:

```bash
vercel env add APP_PASSWORD production
vercel env add AUTH_SECRET production
```

(`AUTH_SECRET` value: `openssl rand -base64 32`. Do **not** set `DISABLE_APP_AUTH` in production.)

- [ ] **Step 2: Confirm vars present**

Run: `vercel env ls production | grep -E "APP_PASSWORD|AUTH_SECRET"`
Expected: both listed for Production.

- [ ] **Step 3: Deploy**

Run: `vercel --prod`
Expected: READY, aliased to `https://options-tracker-lake-one.vercel.app`.

- [ ] **Step 4: Verify the gate is live**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://options-tracker-lake-one.vercel.app/
# Expected: redirect to /login
curl -s -o /dev/null -w "%{http_code}\n" https://options-tracker-lake-one.vercel.app/login
# Expected: 200
```

Then in a browser: load the URL → password prompt → correct password → dashboard. Confirm the Schwab connect/sync flow still works once logged in.

- [ ] **Step 5: Update context docs**

Update `context/ARCHITECTURE.md` (new `middleware.ts` gate + `/login` + `app-auth` routes + `APP_PASSWORD`/`AUTH_SECRET` env vars) and `context/DECISIONS.md` (decision: single password gate over OAuth provider). Update the `vercel-deploy` memory to note the two new required production env vars. Commit.

```bash
git add context/ARCHITECTURE.md context/DECISIONS.md
git commit -m "docs: record app-login gate in architecture + decisions"
```

---

## Notes for the implementer
- **Secrets:** never write real production secret values into committed files or `vercel env add` on the owner's behalf — `.env.local` gets dev-only values; production values are owner-entered.
- **No test framework:** the Task 1 unit test runs via `npx tsx`; do not add vitest/jest (would need owner approval per CLAUDE.md).
- **Edge runtime:** `lib/appAuth.ts` uses only Web Crypto + `process.env`, so it works unchanged in both middleware (edge) and the Node route handlers.
- **Fail-closed:** if `APP_PASSWORD`/`AUTH_SECRET` are unset in production, login can't succeed and the gate denies access — intended.
