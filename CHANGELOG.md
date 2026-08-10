# Changelog

All notable changes to Vantage are documented here. This project follows
[Semantic Versioning](https://semver.org/).

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
