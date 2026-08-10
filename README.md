# Vantage — Trust Management Platform

A working replica of [vanta.com](https://www.vanta.com): a compliance automation and trust
management platform. Vantage connects to the systems a company already uses, continuously tests
its security controls against live configuration, maps the results to compliance frameworks, and
turns them into audit evidence, questionnaire answers and a public Trust Center.

Everything here is functional — the monitoring engine really evaluates data, remediation really
changes state, and readiness percentages really recompute.

```
npm run setup     # install frontend build tooling and build web/dist
npm start         # http://localhost:4173
npm test          # 22 tests, no network required
```

The server has **no runtime dependencies** — it runs on Node 24+ using only
`node:` builtins, including `node:sqlite`. `npm install` at the root installs
nothing; only the frontend build needs packages.

Sign in with **ada@northwind.io / vantage123** (also `marcus@northwind.io`, `sofia@northwind.io`,
`dan@northwind.io`, and `auditor@keeling-cpa.com`). The public Trust Center is at `/trust` and needs
no account.

---

## What it does

| Area | Capability |
| --- | --- |
| **Frameworks** | 7 frameworks — SOC 2 Type II, ISO 27001:2022, HIPAA Security Rule, GDPR, PCI DSS v4.0, NIST CSF 2.0 and ISO 42001 — with 159 requirements mapped to a single shared control set. Enable or disable any framework. |
| **Controls** | 62 controls, each owned, described, mapped to every requirement it satisfies across all frameworks, and linked to the tests that evidence it. |
| **Continuous monitoring** | 49 automated tests evaluate live resource data every hour. Failing tests open a remediation task with a severity-based SLA (critical 3d, high 7d, medium 14d, low 30d). |
| **Remediation** | One-click "Fix" applies the compliant configuration to the failing entity, re-runs the test, and the control, framework readiness and Trust Center all update immediately. |
| **Policies** | 22 versioned policies with approval workflow, annual review dates, per-person acceptance tracking and reminders. |
| **Personnel** | HR-synced roster with security training, background checks, policy acceptance and offboarding access revocation. |
| **Devices** | Endpoint posture from MDM: disk encryption, screen lock, anti-malware, OS currency, check-in recency. |
| **Vendors** | Third-party inventory with risk tiering, sub-processor flags, SOC 2 / ISO 27001 assurance and recurring security reviews. |
| **Risk register** | Inherent vs residual scoring, a residual risk heat map, treatment decisions, owners and due-date tracking. |
| **Audit hub** | Audits with auditor details, observation windows, a PBC evidence-request list with statuses, and an evidence library. |
| **Questionnaires** | Security questionnaires answered automatically from your live control set and approved policies, with per-answer confidence scores and review flags. |
| **Trust Center** | A public, self-serve security page generated from live monitoring, with public and NDA-gated documents, a sub-processor list and an access-request queue. |
| **Integrations** | 20 integrations (AWS, GitHub, Okta, Kandji, Rippling, Datadog, PagerDuty, Jira, Slack, GCP, Azure, Snyk, Cloudflare…) that can be connected, synced and disconnected. |
| **Inventory** | Every discovered resource with the exact configuration attributes the tests evaluate. |

## How the monitoring engine works

Tests are **data-driven**, not hard-coded. Each test carries a JSON rule describing the population
it applies to and the condition each member must satisfy:

```jsonc
// "S3 buckets are encrypted at rest"
{ "kind": "resource", "type": "aws_s3_bucket", "field": "encryption_enabled", "op": "eq", "value": true }

// "Endpoints have disk encryption enabled"
{ "kind": "device", "field": "encrypted", "op": "eq", "value": 1 }

// "Personnel complete annual security training"
{ "kind": "personnel", "field": "security_training", "op": "eq", "value": "complete" }
```

`kind` selects the population (`resource`, `device`, `personnel`, `policy`, `policy_acceptance`,
`vendor`, `risk`) and the operators include `eq`, `neq`, `gte`, `lte`, `in`, `not_in`, `contains`,
`exists`, `before`, `after` and `within_days`.

On each run the engine evaluates every entity, records a per-entity pass/fail with a human-readable
reason, sets the test status, and assigns or clears the remediation deadline. Status then rolls up:

```
entity result → test status → control status → requirement status → framework readiness
```

Framework readiness is control-weighted — the share of a framework's mapped controls that are not
failing — which is how compliance platforms report it. A requirement is "at risk" if any control
mapped to it is failing.

Adding a new test is a single row: give it a control, a severity, an integration and a rule.

## Questionnaire auto-answering

`POST /api/questionnaires/:id/autofill` builds a knowledge base from every control and approved
policy, tokenises the question, scores each entry by term overlap and coverage, then composes an
answer from the best match plus its supporting controls — appending how many automated tests
currently back that claim. Answers scoring below 70% confidence are marked **needs review** rather
than presented as fact.

## Architecture

```
server/
  db.js               schema + helpers (node:sqlite, no native deps)
  engine.js           rule evaluation, status roll-up, readiness maths
  seed-frameworks.js  frameworks, requirements, controls, test definitions
  seed.js             demo tenant: people, devices, cloud resources, vendors, risks, audits
  index.js            REST API, auth, remediation actions, static hosting, hourly scan loop
web/
  src/ui.jsx          design system (cards, pills, donut, tables, drawers, toasts)
  src/pages/*.jsx     23 routes
```

* **Backend** — Node 22+ with Express and the built-in `node:sqlite` driver. No native modules, no
  external services, no API keys. The database is created and seeded automatically on first boot at
  `data/vantage.db`.
* **Frontend** — React 19, React Router 7, Tailwind CSS v4, Vite 7, lucide icons. The production
  build is served by the same Express process.
* **Scan loop** — every test re-runs on an interval (`VANTAGE_SCAN_MINUTES`, default 60) and on
  demand via *Run all tests*.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install everything and build the frontend |
| `npm start` | Run the app on `PORT` (default 4173) |
| `npm run dev` | Run the API with file watching |
| `npm run build` | Rebuild the frontend |
| `npm run seed` | Reset the database to the seeded demo tenant |
| `npm --prefix web run dev` | Vite dev server on 5173, proxying `/api` to 4173 |

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4173` | HTTP port |
| `VANTAGE_DB` | `data/vantage.db` | SQLite file location |
| `VANTAGE_SCAN_MINUTES` | `60` | Continuous monitoring interval |

## API sketch

```
POST   /api/auth/login                      → { token, user }
GET    /api/dashboard                       → posture, framework readiness, failing tests, activity
GET    /api/frameworks/:slug                → requirements grouped by section with control status
GET    /api/tests?status=failing            → filtered tests with facet counts
POST   /api/tests/:slug/remediate           → fix all failing entities (or one via entity_id)
POST   /api/tests/run                       → re-run the full suite
POST   /api/personnel/:id/complete_training → record training, re-run affected tests
POST   /api/vendors/:id/review              → complete a vendor security review
POST   /api/questionnaires/:id/autofill     → draft answers from controls and policies
GET    /api/public/trust                    → public Trust Center payload (no auth)
POST   /api/public/trust/request            → request a gated document (no auth)
POST   /api/demo/reset                      → restore the seeded baseline
```

## Try this

1. Sign in and note the readiness ring on the dashboard (~73%).
2. Open **Monitoring → Failing**, pick *AWS IAM users have MFA enabled*, and read the two
   non-compliant IAM users with the exact reason each failed.
3. Hit **Fix all** — the test flips to passing and the deadline clears.
4. Go back to the dashboard: passing tests and framework readiness have both moved.
5. Open **Questionnaires → Security review — renewal** and press **Auto-answer**.
6. Visit `/trust` in a private window, request the SOC 2 report, then approve it under
   **Trust Center**.
7. **Settings → Reset demo data** puts everything back.

## Deployment

Vantage runs on the InstaHost estate at **https://vantage.insta.host**.

| | |
|---|---|
| Host | `nas1.insta.host` (TrueNAS SCALE), application `vantage` |
| Port | `30002` |
| Runtime | `node:24-slim` pinned by digest, release source bind-mounted read-only at `/app` |
| Source | `/mnt/TailsPool/vantage/releases/<commit-sha>` |
| Data | `/mnt/TailsPool/vantage/data` (SQLite, the only writable path) |
| Ingress | Cloudflare tunnel `instahost-nas1` → `http://192.168.100.116:30002` |
| Identity | Cloudflare Access — Entra SSO and one-time PIN |

There is no build step on the host and no container image to build: `web/dist`
is committed, the server has no dependencies, and the release commit SHA is the
immutable artifact identity.

### Monitoring must point at the origin, not the public URL

Cloudflare Access fronts **every** path including `/healthz`, so a public probe
answers `302` to the identity provider. That is the gate working, not an
outage. Health checks run against the origin:

```sh
ssh nas1 "curl -s http://127.0.0.1:30002/healthz"   # version, release SHA, source digest
ssh nas1 "curl -s http://127.0.0.1:30002/readyz"    # database, schema, engine, build; 503 when not ready
```

`/readyz` returns `503` if the database is unreachable, the schema is not
seeded, the monitoring engine has never run, or `web/dist` is missing.

### Release process

See `RELEASE_NOTES.md` for the deployment and rollback runbook, and
`release-evidence/` for the deployment profile and the pre-freeze contract
matrix (live dependency probes with negative controls, bounded-resource
preflight and executable invariants).

```sh
node scripts/verify-invariants.mjs   # recomputes readiness, counters and dist parity
node --test tests/*.test.mjs         # unit + API contract tests
```

## Notes

This is an independent educational reimplementation of the product category. Framework requirement
titles are paraphrased summaries of publicly published standard structures; no proprietary content,
branding or assets are reproduced. All company, personnel and vendor data is fictional.

The seeded demonstration accounts use a well-known password and are safe only
because Cloudflare Access gates the service. Do not expose this application
without an Access policy in front of it.
