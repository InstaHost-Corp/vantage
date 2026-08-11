# Changelog

All notable changes to Vantage are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-08-11

Vantage becomes a **free public tool with public source code**. The identity
gate in front of `https://vantage.insta.host` is removed, anyone may use the
service without an account of their own or any charge, and the repository is
published on GitHub under the MIT licence.

### What's new

- **Free, open access.** The Cloudflare Access gate is gone. Visiting
  `https://vantage.insta.host` reaches the application itself, and the seeded
  demonstration accounts published on the sign-in page are all that is needed.
  There is no signup, no trial and no cost.
- **Open source under the MIT licence.** `LICENSE` is added and the repository
  is public, so anyone can read it, fork it, self-host it or take pieces of it.
- **`GET /api/public/config`.** An unauthenticated endpoint describing the
  environment: version, whether it is the shared public demonstration, the
  demonstration accounts, the reset cadence and the source URL. The sign-in
  page and the application shell render from it.
- **Self-healing shared demonstration.** Because everyone shares one workspace,
  the tenant restores itself to the seeded baseline every six hours
  (`VANTAGE_DEMO_RESET_MINUTES`). A visitor can no longer leave the
  demonstration permanently broken for the next one.
- **In-product honesty about what this is.** A banner in the application shell
  and new copy on the sign-in page state that the workspace is shared, when it
  next resets, and where the source lives.
- **`publishctl.py apply --stage public`.** Ungating is now an executable,
  reversible operation that **fails closed**: after removing the Access
  application it proves against the live public hostname that the deployed
  build reports `public_demo` and serves the security headers, and restores the
  gate automatically if it does not. `publishctl.py regate` puts the gate back
  in one step.
- **`SECURITY.md`** with a private vulnerability-reporting route and an honest
  statement of what the hosted demonstration is and is not.

### Security

Removing the identity gate moves the whole burden of first contact onto the
application, so the guards it now needs were added in the same release. Each
has a regression test proven to fail without it:

- **Per-client rate limiting** on `/api`, keyed on the true client address from
  `CF-Connecting-IP` — and only when the deployment declares the hop in front
  trustworthy, so a client cannot forge its own rate-limit identity. Reads,
  writes, expensive operations (full scans, remediation, questionnaire
  autofill, tenant reset), sign-in and anonymous contact each get their own
  budget, under a global per-client ceiling. The counter map is bounded, so
  rotating source addresses cannot grow it without limit.
- **Browser security headers on every response**: a content security policy
  matching what the build actually emits, `frame-ancestors 'none'`,
  `X-Frame-Options: DENY`, `nosniff`, a referrer policy, a permissions policy,
  cross-origin isolation headers, and HSTS when the request arrived over TLS.
- **Bounded anonymous writes.** The Trust Center access-request form is the
  only table an anonymous visitor can write to: every field is now length-
  capped and the address validated, the pending backlog is capped, and the JSON
  body limit is reduced from 1 MB to 256 kB.
- **Sign-in throttling keyed on address and account** rather than the account
  alone, so rotating the email field no longer buys an unlimited attempt
  budget. Expired sessions are deleted whenever a new one is issued.

### Behaviour changes

- Version reported by `/healthz` and `/readyz` is `1.1.0`.
- `GET /api/me` additionally returns `public_demo`, `source_url` and
  `next_reset_at`.
- Requests exceeding a rate-limit budget receive `429` with `Retry-After`.
- On the public deployment only, **all data is periodically destroyed and
  reseeded**. A self-hosted instance defaults to no scheduled reset and no
  public-demo banner; both are opt-in through `VANTAGE_PUBLIC_DEMO`.

### Deployment

- New environment variables: `VANTAGE_PUBLIC_DEMO`, `VANTAGE_TRUST_PROXY`,
  `VANTAGE_RATE_LIMIT`, `VANTAGE_HSTS`, `VANTAGE_DEMO_RESET_MINUTES`,
  `VANTAGE_MAX_PENDING_TRUST_REQUESTS`, `VANTAGE_SOURCE_URL`.
- No schema or data migration. The application seeds itself idempotently.

### Known issues and residual risks

- The hosted workspace is shared and mutable by design. Vandalism between
  scheduled resets is expected and self-heals; an administrator can also reset
  it immediately from **Settings → Reset demo data**.
- Rate limiting is per process and in memory. A single instance is deployed, so
  this is exact today, but it would need shared state if the service were ever
  scaled out.

## [1.0.0] - 2026-08-10

First release. Vantage is deployed to the InstaHost estate at
`https://vantage.insta.host`.

### What's new

- **Continuous control monitoring.** A data-driven engine evaluates 49
  automated tests against live resource data on a schedule and on demand. Each
  test carries a JSON rule describing its population and condition, so adding a
  test is a data change rather than a code change.
- **Seven compliance frameworks.** SOC 2 Type II, ISO/IEC 27001:2022, HIPAA
  Security Rule, GDPR, PCI DSS v4.0, NIST CSF 2.0 and ISO/IEC 42001:2023 —
  159 requirements mapped onto one shared set of 62 controls.
- **One-click remediation.** Failing entities can be corrected from the UI; the
  test re-runs immediately and control status, framework readiness and the
  Trust Center all recompute.
- **Policy library.** 22 versioned policies with approval workflow, annual
  review dates, per-person acceptance tracking and reminders.
- **Personnel and device compliance.** Security training, background checks,
  policy acceptance, offboarding access revocation, and endpoint posture
  (encryption, screen lock, anti-malware, OS currency, check-in recency).
- **Vendor risk management** with risk tiering, sub-processor flags, assurance
  reports on file and recurring security reviews.
- **Risk register** with inherent and residual scoring, a residual heat map,
  treatment decisions, owners and due-date tracking.
- **Audit hub** with auditor details, observation windows, a PBC evidence
  request list and an evidence library.
- **Questionnaire auto-answering** that drafts responses from the live control
  set and approved policies, scores confidence, and flags anything below 70%
  for human review instead of asserting it.
- **Public Trust Center** generated from live monitoring, with public and
  NDA-gated documents, a sub-processor list and an access-request queue.
- **Health and readiness endpoints.** `/healthz` reports the deployed version,
  release commit and source digest; `/readyz` reports database, schema, engine,
  writability and frontend-build checks and answers 503 when not ready.

### Behaviour and UX

- The application shell is responsive. Below the `lg` breakpoint the navigation
  collapses into an off-canvas drawer, verified free of horizontal overflow at
  390px, 768px and 1440px on both the public and authenticated surfaces.

### Security

Five findings from the mandatory pre-deployment security and engineering
reviews were fixed before deployment, each with a regression test proven to
fail without the fix:

- **Role enforcement.** The application defined `admin`, `contributor` and
  `auditor` roles but enforced none of them, so the seeded external auditor
  account could reset the tenant, approve the policies it was auditing and
  remediate controls. Auditor accounts are now read-only, and tenant reset,
  policy approval, framework enablement, settings and Trust Center
  configuration require an administrator. `/api/demo/reset` additionally
  honours `VANTAGE_ALLOW_DEMO_RESET=0`.
- **Session tokens are no longer accepted from the query string**, only from
  the `Authorization` header. A token in a URL leaks into access logs, browser
  history and `Referer` headers.
- **Readiness now proves the data volume accepts writes** by inserting,
  reading back and deleting a probe row. The previous check was a read, which
  cannot detect a full or read-only volume — the exact failure `/readyz` exists
  to catch, since it is the only monitoring signal for this service.
- **Sign-in attempts are throttled** (10 failures per account per 15 minutes)
  so the shared demonstration password cannot be brute-forced from behind the
  identity gate.
- **The public Trust Center payload no longer discloses which specific controls
  are failing.** Status is published coarsely as verified, in progress or
  documented.
- Remediation writes are restricted to an allow-list of column names per rule
  kind, so a future editable-rule feature cannot become column-name injection.
- The `/api` guard matches whole path segments rather than bare prefixes, and
  request paths are decoded then re-normalised so the guard and the router
  cannot disagree about a percent-encoded path.
- Static file streaming handles read errors, and the process logs rather than
  exits on an unhandled rejection, so a single bad request cannot take the
  service down.

- The service is fronted by Cloudflare Access; every public path, including
  `/healthz`, answers a redirect to the identity provider until the visitor has
  authenticated. Health and readiness are therefore monitored on the origin.
- The application holds no secrets and calls no external services. Nothing is
  read from the Keychain and nothing is mounted into the container.
- Seeded demonstration accounts use a well-known password (`vantage123`) and
  fictional data. This is acceptable only because Cloudflare Access gates the
  service; it is recorded as a residual risk in the release notes and the
  service must not be exposed without Access.
- Static asset responses are content-hash keyed and served `immutable`; HTML is
  served with a short max-age so a new release is picked up promptly.
- Directory traversal above the static root is refused, with a regression test.

### Architecture

- **Removed the Express dependency.** The HTTP layer is now `server/http.js`, a
  zero-dependency router with an Express-compatible surface built on
  `node:http`. The estate deployment pattern bind-mounts release source
  read-only into a stock image with no install step, so a runtime dependency
  would have required vendoring `node_modules` into the artifact. The release
  now has **no runtime dependencies at all**, enforced by an executable
  invariant.
- `web/dist` is committed so the deployed artifact is exactly the release
  commit, and an invariant check proves it is reproducible from `web/src`.

### Bugs fixed

- **Sign-in appeared to do nothing.** After a successful login the application
  returned to the login screen. `App` computed its authentication state once
  per mount and did not re-render on navigation, so the post-login redirect was
  bounced straight back by the route guard. `App` now subscribes to the router
  location. Found by end-to-end browser testing.
- **Resetting the demo signed the operator out.** Reseeding clears the
  `sessions` and `users` tables, invalidating the caller's own token. The reset
  endpoint now re-issues a session for the calling user and the client stores
  it.
- **`/api/me` and sign-out returned 404 on the new HTTP layer.** The first
  version of the router accepted only a single handler per route, silently
  dropping the handler in `app.get('/api/me', requireAuth, handler)`. Routes now
  run a handler chain. Caught by a regression test that was proven to fail
  without the fix.
- **The authenticated shell overflowed on mobile** by 47px at 390px because the
  fixed 240px sidebar was always in flow.
- **Framework readiness was computed all-or-nothing per requirement**, which
  reported single-digit readiness for a tenant with a normal mid-audit posture.
  Readiness is now control-weighted, the way compliance platforms report it.
- **Requirement ordering was alphabetical**, so SOC 2 listed the Availability
  criteria before the Common Criteria. Requirements now retain framework order.
- **`hr-policy-acceptance` counted draft policies**, so every person failed the
  test. Only approved policies are counted.
- **GitHub member tests had an empty population** and passed vacuously; the
  organisation roster is now part of the monitored inventory.

### Data and migrations

- No migration. The application creates its schema and seeds the demonstration
  tenant idempotently on first boot, and takes no action when data already
  exists. The SQLite database lives on a persistent volume at
  `/mnt/TailsPool/vantage/data`.

### Deployment

Deployed 2026-08-10 to `https://vantage.insta.host` (nas1, TCP 30002) at commit
`c01fbed090274a8b9629e68bd1b7dfe68f112b69`, image
`node:24-slim@sha256:3638d9a6…`, jobs `8774` and `8896` both successful.
Snapshots `pre-1.0.0` and `post-1.0.0` retained. Origin health and readiness
green; every public path returns the Cloudflare Access redirect. Live QA
`PASS_LIVE`.

### Operator actions

- None beyond deployment. Health and readiness must be monitored on the origin
  (`http://127.0.0.1:30002/healthz`), not the public URL, because Access gates
  the public path.

### Known issues and residual risks

- Cloudflare service-token permissions are not available to the release
  credential, so the automated smoke test of an authenticated public request is
  performed through a loopback forward to the origin rather than through the
  edge with a service token.
- The dataset holds a demonstration tenant. Because the seed is idempotent,
  redeploying preserves data; a deliberate reset is available in Settings.
