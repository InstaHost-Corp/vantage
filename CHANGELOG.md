# Changelog

All notable changes to Vantage are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [2.2.0] - 2026-08-29

### Added

- A public marketing landing page is now shown at `/` to unauthenticated
  visitors, replacing the previous immediate redirect to `/login`. It explains
  what Vantage does, summarizes the capability areas (frameworks, controls,
  monitoring, policies, personnel/devices, vendors/risk, audit preparation,
  questionnaires, Trust Center, workspace integrations, asset inventory, risk
  register), and states that Vantage is free, MIT-licensed and open source
  with a link to the public repository and a copy of the self-host command
  (`git clone` / `npm run setup` / `npm start`).
- The Vantage logo on the Login and Signup pages now links back to the new
  landing page.

### Changed

- `/login` and `/signup` remain dedicated authentication pages; they are
  unchanged apart from the added link back to `/`. Authenticated visitors
  still see the existing dashboard at `/`.

## [2.1.0] - 2026-08-28

### Added

- Tenant administrators can configure a workspace-owned account reference for
  services in the integration catalogue. References are tenant-scoped and are
  removed on disconnect.

### Changed

- Integration configuration is explicitly documentation-only: Vantage does not
  accept credentials, call external providers, collect data, or update
  compliance status from these records.
- Removed the simulated connection and sync behavior. Existing simulated
  connections become configured references at startup and their stale sync
  timestamps are cleared.
- Only tenant administrators can add, update, or remove a service reference.

## [2.0.0] - 2026-08-28

### Breaking changes

- **Multi-tenant isolation**: every customer-owned table now carries a
  `tenant_id` column. The database schema is incompatible with pre-2.0
  databases unless the built-in migration runs (it runs automatically on
  first boot). **Back up your database before upgrading.**
- **Production mode** (`VANTAGE_ENV=production`): fails closed at startup
  unless `VANTAGE_PUBLIC_DEMO` is disabled, a 32+-character session secret is
  provided through `VANTAGE_SESSION_SECRET_FILE`, and
  `VANTAGE_ALLOW_DEMO_RESET` is disabled. Demo reset, demo seeding and the
  continuous scan timer are all disabled in production.
- Signup in production mode requires a `company` field and creates a new
  isolated tenant with the caller as owner/admin. In demo mode, signup still
  creates a contributor in the shared demo tenant.
- The `settings` table primary key changed from `(key)` to `(tenant_id, key)`.
  The `setting()`, `setSetting()` and `logActivity()` helpers now accept a
  `tenantId` parameter (defaulting to 1 for backward compatibility).
- Engine functions (`runTests`, `controlStatuses`, `frameworkReadiness`,
  `overallPosture`) now require a `tenantId` parameter.

### Added

- **`tenants` table** and `tenant_id` on all 25 customer-owned tables:
  users, sessions, frameworks, requirements, controls, control_requirements,
  tests, test_entities, resources, integrations, policies, policy_acceptances,
  personnel, devices, vendors, risks, audits, audit_requests, evidence,
  trust_documents, trust_requests, questionnaires, questionnaire_items,
  activity, settings.
- **Automatic migration** from pre-2.0 single-tenant databases: creates the
  `tenants` table, inserts a default tenant (id=1), adds `tenant_id` to all
  tables, and recreates tables that need UNIQUE constraint changes.
- **`server/tenant.js`**: centralised tenant lifecycle — `createTenant()`,
  `seedTenantFrameworks()`, `isProduction()`, `validateProductionConfig()`.
- **Production mode** (`VANTAGE_ENV=production`):
  - Fails closed at startup with clear error messages if misconfigured.
  - Demo reset disabled; demo seed skipped; continuous scan timer off.
  - Public config endpoint does not expose demo credentials.
  - CSRF protection: documented as inherent in Bearer token auth.
- **Tenant onboarding**: signup creates a new tenant with company name
  metadata. Duplicate email returns a generic error that does not reveal
  which tenant the address belongs to.
- **Tenant-scoped queries**: every authenticated route reads and writes only
  `req.user.tenant_id`. All SQL queries include explicit `tenant_id` filters.
  Engine functions, settings helpers and activity logging are all scoped.
- **Rate limiting** on signup and login (carried forward from 1.x; now
  documented explicitly as part of the multi-tenant security model).
- **Integration catalogue** exported from `seed-frameworks.js` for use by
  tenant seeding.
- **11 new tests** proving:
  - Two tenants cannot read or update each other's records.
  - Production mode cannot reset or reseed demo data.
  - Signup creates an isolated tenant with admin owner.
  - Duplicate email behaviour does not enumerate tenants.
  - Schema migration adds tenant_id to all tables.

### Production limitations

- Public Trust Center routes return `404` in production until a tenant-specific
  publication model is implemented.
- No tenant deletion or data export API.
- No tenant-level billing, quotas or usage metering.
- Role management is limited to the existing admin/contributor/auditor roles;
  no tenant-level role customisation.

### Migration instructions

1. **Back up your database** before upgrading:
   `cp data/vantage.db data/vantage.db.backup`
2. Start the new version. The migration runs automatically on first boot and
   logs `[vantage] migrating database to multi-tenant schema (v2.0.0)...`.
3. Verify the migration completed: `[vantage] multi-tenant migration complete`.
4. If the migration fails, restore from backup and file an issue.

## [1.3.0] - 2026-08-28

- Opened bounded self-service contributor signup for the hosted demonstration.
- Published the repository and hosted application as an open, free service.

## [1.2.1] - 2026-08-12

- Restricted the hosted demonstration behind Cloudflare Access while the
  project's governance and outside-work position are reviewed.
- Reframed Vantage as a fictional compliance-readiness sandbox with simulated
  connectors rather than a live compliance service.
- Documented explicit boundaries from Microsoft Purview Compliance Manager,
  Microsoft-managed controls, regulatory advice, certification and compliance
  scoring.
- Removed vulnerability-response and fix-time commitments in favour of
  best-effort wording.
- Added public provenance and contribution boundaries.
- Added an executable regression test preventing donation surfaces, implied
  Microsoft affiliation, support commitments and overstated product claims.

- Repositioned Vantage as an independent, continuous internal compliance
  baselining and engagement-preparation tool.
- Clarified that Vantage does not provide certification or replace independent
  third-party SOC, ISO or similar assurance.
- Added a project notice identifying Vantage as Patrick Hamid's personal
  project and stating that it is not Microsoft-endorsed and does not constitute
  Microsoft support, a warranty, or a commitment.
- Removed product-comparison language and related seeded identifiers.

## [1.2.0] - 2026-08-11

The hosted instance is a demonstration, and this release makes it behave like
one: it resets **daily**, and it keeps nothing a visitor types.

### What's new

- **The shared demonstration resets daily** rather than every six hours
  (`VANTAGE_DEMO_RESET_MINUTES` default `1440` when `VANTAGE_PUBLIC_DEMO` is
  set). A day is long enough to explore and short enough that nobody inherits
  yesterday's mess.
- **The sign-in page is pre-filled and asks not to be remembered.** Both fields
  arrive filled with the published demonstration account, and the form *and*
  both inputs set `autocomplete` off (`new-password` on the password field)
  along with the ignore attributes 1Password, LastPass and Bitwarden honour, so
  the browser
  neither offers to save credentials against this origin nor autofills a
  visitor's real ones into it. One-click buttons switch between the seeded
  accounts, so there is no reason to type at all.
- **The session ends with the tab.** The token moved from `localStorage` to
  `sessionStorage`, so closing the tab leaves nothing behind on the visitor's
  device. `VANTAGE_SESSION_DAYS` makes the server-side lifetime configurable and
  the public deployment sets it to `1`, so a session never outlives the data it
  was issued against.

### Security

- **The daily reset survives a restart.** The cadence was measured from process
  start and never written down, so any restart before the deadline postponed the
  reset by another full day while the page kept promising "daily". The last
  reset is now persisted, the schedule is anchored to it, and a reset that fell
  due while the service was down happens at boot. The stored marker is validated
  rather than trusted: an unparseable or future-dated value is treated as
  missing and repaired, so a corrupt marker cannot quietly re-anchor the clock
  on every restart.
- **No token is left on a visitor's device.** `sessionStorage` has no
  `localStorage` fallback — the fallback is memory — and any token left in
  `localStorage` by an earlier version is removed on load, since nothing else
  would ever have cleaned it up.
- **The sign-in throttle no longer holds what a visitor typed.** It keyed on
  `<client address>|<email>` in the clear, so a real work address entered out of
  habit sat in process memory for the length of the fifteen-minute window. It
  now keys on an HMAC of the same pair under a key generated at boot and held
  only in memory. A plain digest would have been pseudonymous rather than
  private — anyone holding this source could confirm a guessed address by
  hashing it — and a keyed one cannot be reproduced or linked across restarts.
  Entries are also swept on a timer rather than only when a later sign-in
  happens to arrive, so the fifteen-minute window is the real retention period
  even on an idle service.
- Confirmed by test rather than by inspection: nothing a visitor types at
  sign-in reaches the activity feed, the user list or any other surface a later
  visitor can read, and a successful sign-in records the account name only,
  never credential material.

### Behaviour changes

- The reset cadence shown on the sign-in page and in the application banner now
  says "daily".
- Signing in no longer persists across browser restarts. On the public
  demonstration that is the point; a self-hosted instance is unaffected in every
  other respect.

### Deployment

- New environment variable `VANTAGE_SESSION_DAYS` (default `14`; the public
  deployment sets `1`).
- `VANTAGE_DEMO_RESET_MINUTES` default changes from `360` to `1440` when
  `VANTAGE_PUBLIC_DEMO` is set. A self-hosted instance still defaults to no
  scheduled reset at all.
- No schema or data migration.

### Deployment

Deployed to `nas1.insta.host` as release `919823ea69c4fdf303872b951a671ec04a813ab1`
(job `12660 app.update SUCCESS`) with `VANTAGE_DEMO_RESET_MINUTES=1440` and
`VANTAGE_SESSION_DAYS=1`. The existing tenant was not wiped on first boot: with
no marker recorded the schedule anchors to deployment time, so the first daily
reset falls due a day later. Snapshots `pre-1.2.0` and `post-1.2.0` bracket the
change. Vantage is also now listed on https://insta.host/tools with a landing
page at https://insta.host/tools/vantage.

## [1.1.0] - 2026-08-11

Vantage becomes a **free public tool with public source code**. The identity
gate in front of `https://vantage.insta.host` is removed, anyone may use the
service without an account of their own or any charge, and the repository is
published on GitHub under the MIT licence.

### What's new

- **Free, open access.** The Cloudflare Access gate is gone. Visiting
  `https://vantage.insta.host` reaches the application itself, and the seeded
  demonstration accounts published on the sign-in page are all that is needed.
  There is no trial and no cost.
- **Open source under the MIT licence.** `LICENSE` is added and the repository
  is public, so anyone can read it, fork it, self-host it or take pieces of it.
- **`GET /api/public/config`.** An unauthenticated endpoint describing the
  environment: version, release commit, whether it is the shared public
  demonstration, which guards are enabled, the demonstration accounts, the
  reset cadence and the source URL. The sign-in page, Trust Center and
  application shell render from it, and the ungate tooling verifies against
  it.
- **Self-healing shared demonstration.** Because everyone shares one workspace,
  the tenant restores itself to the seeded baseline every six hours
  (`VANTAGE_DEMO_RESET_MINUTES`). A visitor can no longer leave the
  demonstration permanently broken for the next one.
- **In-product honesty about what this is.** A banner in the application shell
  and new copy on the sign-in page state that the workspace is shared, when it
  next resets, and where the source lives.
- **`publishctl.py apply --stage public`.** Ungating is now an executable,
  reversible operation that fails closed. It proves the deployed build at the
  **origin first**, while the gate is still up — public-demo mode on, every
  guard enabled, and the expected version and release commit — so the Access
  application is only ever deleted for a build already known to be safe. It
  then re-proves the same claims through the public hostname, including that
  `/api/dashboard` still answers 401 anonymously, and any failure, exception or
  interrupt triggers a retrying, read-back-confirmed restoration of the gate.
  The expected version and release commit are **required**, not optional, and
  a build reporting no release commit is refused. `publishctl.py regate` puts
  the gate back in one step, and `rollback` now verifies each of its own
  mutations instead of reporting success blindly, and a restoration that
  exhausts its attempts is reported as *still public* rather than as a clean
  revert. `tests/test_publishctl.py` covers the restoration path against API
  rejection, transport failure, interruption, a disagreeing readback and a
  restoration that never succeeds.
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
- **No visitor identity is stored on the public demonstration.** The Trust
  Center access-request form previously kept the name, email and company it was
  given — and anyone can sign in to the shared workspace and read that queue.
  On the public deployment the submission is now accepted, the identifying
  fields discarded, and an anonymous demonstration request recorded instead.
  The requested document is resolved against the published catalogue rather
  than stored as typed, so the last free-text field cannot smuggle an identity
  into the queue either. The form says so before you type. A self-hosted
  instance is a real workflow and keeps the requester it was given.
- **The public Trust Center no longer lets a reader derive what is failing.**
  Control status is published as *verified* or *not yet verified* only, so a
  failing control is indistinguishable from one with no automated test behind
  it; previously the third state made the failing set recoverable by
  subtraction. The published aggregate now counts controls rather than tests,
  so its complement is that same merged bucket rather than the live failing
  count.
- **Readiness detail is no longer public.** `/readyz` is now reachable without
  an identity gate, so database paths, driver error text and row counts are
  served only to a loopback caller, or with `VANTAGE_READYZ_DETAIL=1`. Every
  other caller gets a stable reason code per component —
  `data_volume_not_writable`, `schema_not_seeded`, `frontend_build_missing` and
  so on — which keeps the endpoint diagnosable without publishing filesystem
  paths. This matters operationally as well as publicly: the container is
  reached through a published port, so even a probe run on the deployment host
  arrives from the bridge gateway rather than loopback.
- **Reseeding is atomic.** The scheduled reset wipes and refills 25 tables
  while requests are in flight, so it now runs in a single transaction with
  deferred foreign keys: a crash or a concurrent read can never observe a
  half-wiped tenant.

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
  `VANTAGE_MAX_PENDING_TRUST_REQUESTS`, `VANTAGE_SOURCE_URL`,
  `VANTAGE_READYZ_DETAIL`.
- No schema or data migration. The application seeds itself idempotently.

### Known issues and residual risks

- The hosted workspace is shared and mutable by design. Vandalism between
  scheduled resets is expected and self-heals; an administrator can also reset
  it immediately from **Settings → Reset demo data**.
- Rate limiting is per process and in memory. A single instance is deployed, so
  this is exact today, but it would need shared state if the service were ever
  scaled out.

### Deployment

Deployed to `nas1.insta.host` as release `a624d802a7a63b1117a8dd5177877af215b72e97`
(job `12498 app.update SUCCESS`), running `node:24-slim@sha256:3638d9a6…` with
the release source bind-mounted read-only. The Cloudflare Access application was
then deleted, so **https://vantage.insta.host is now reachable by anyone with no
identity gate**, and `phamid/vantage` was made public under the MIT licence.
Snapshots `pre-1.1.0` and `post-1.1.0` bracket the change. See
`RELEASE_NOTES.md` for the full evidence table.

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
