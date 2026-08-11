# Vantage — Trust Management Platform

[![Licence: MIT](https://img.shields.io/badge/licence-MIT-6558f5.svg)](LICENSE)

**Free, open source, and live at [vantage.insta.host](https://vantage.insta.host) — no signup, no cost.**

A working replica of [vanta.com](https://www.vanta.com): a compliance automation and trust
management platform. Vantage connects to the systems a company already uses, continuously tests
its security controls against live configuration, maps the results to compliance frameworks, and
turns them into audit evidence, questionnaire answers and a public Trust Center.

Everything here is functional — the monitoring engine really evaluates data, remediation really
changes state, and readiness percentages really recompute.

## Try it, free

Open **<https://vantage.insta.host>** and sign in with **ada@northwind.io / vantage123** (also
`marcus@northwind.io`, `sofia@northwind.io`, `dan@northwind.io`, and `auditor@keeling-cpa.com` for
a read-only external-auditor view). The public Trust Center is at
[`/trust`](https://vantage.insta.host/trust) and needs no account at all.

That instance is a **shared** demonstration containing entirely fictional data. Anything you change
is visible to everyone else, and the whole workspace is restored to its seeded baseline every six
hours. Do not put anything real into it.

## Run your own

```
git clone https://github.com/phamid/vantage.git && cd vantage
npm run setup     # install frontend build tooling and build web/dist
npm start         # http://localhost:4173
npm test          # 49 tests, no network required
```

The server has **no runtime dependencies** — it runs on Node 24+ using only
`node:` builtins, including `node:sqlite`. `npm install` at the root installs
nothing; only the frontend build needs packages.

A self-hosted instance is private by default: no public-demo banner and **no**
scheduled data reset. Change the seeded passwords in `server/seed.js` before
putting one on a network.

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

* **Backend** — Node 24+ with the built-in `node:sqlite` driver and a hand-written, Express-shaped
  HTTP layer (`server/http.js`) rather than Express itself: the production deployment bind-mounts the
  release source read-only into a stock node image, so there is nowhere to run `npm install`. No
  runtime dependencies, no native modules, no external services, no API keys. The database is
  created and seeded automatically on first boot at `data/vantage.db`.
* **Frontend** — React 19, React Router 7, Tailwind CSS v4, Vite 7, lucide icons. The production
  build is served by the same node process.
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
| `VANTAGE_PUBLIC_DEMO` | `0` | Announce a free shared demonstration in the UI and default the reset cadence on |
| `VANTAGE_DEMO_RESET_MINUTES` | `360` when public, else `0` | Reseed the whole tenant on this cadence. **Destructive** — `0` disables it |
| `VANTAGE_RATE_LIMIT` | `1` | Per-client rate limiting on `/api` |
| `VANTAGE_TRUST_PROXY` | follows `VANTAGE_PUBLIC_DEMO` | Take the client address from `CF-Connecting-IP` / `X-Forwarded-For`. Only enable behind a proxy you control |
| `VANTAGE_HSTS` | `0` | Always send HSTS, rather than only when the request arrived over TLS |
| `VANTAGE_MAX_PENDING_TRUST_REQUESTS` | `200` | Cap on the anonymous Trust Center request backlog |
| `VANTAGE_SOURCE_URL` | this repository | "Source on GitHub" link shown in the UI |
| `VANTAGE_READYZ_DETAIL` | `0` | Serve full `/readyz` diagnostics to every caller. By default paths, driver errors and row counts go only to loopback monitoring |
| `VANTAGE_ALLOW_DEMO_RESET` | `1` | Set to `0` to refuse tenant resets entirely |

## Public access and abuse resistance

Nothing sits in front of the hosted instance, so the application defends itself:

* **Per-client rate limits** across five budgets — reads, writes, expensive operations (full
  scans, remediation, questionnaire autofill, tenant reset), sign-in and anonymous contact — under
  a global per-client ceiling. Over-budget requests get `429` with `Retry-After`.
* **Browser security headers** on every response: a content security policy matching what the build
  emits, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions
  policies, cross-origin isolation, and HSTS over TLS.
* **Bounded anonymous writes.** The Trust Center access-request form is the only table an anonymous
  visitor can write to: fields are length-capped, the address validated, the backlog capped, and the
  JSON body limit is 256 kB.
* **No visitor identity is stored.** Anyone can sign in to the shared workspace and read the
  access-request queue, so on the public demonstration the name, email and company submitted to that
  form are discarded and an anonymous demonstration request is recorded instead. The requested
  document is resolved against the published catalogue rather than stored as typed, so no free-text
  field survives. A self-hosted instance keeps the requester it was given.
* **A public Trust Center that discloses only coverage.** Control status is published as exactly two
  values — `verified` and `in_progress` — so a failing control is indistinguishable from an untested
  one, and the published aggregate counts controls rather than tests so its complement cannot be
  subtracted back into a live failing count.
* **Role separation.** Auditor accounts are read-only; tenant reset, policy approval, framework
  enablement, settings and Trust Center configuration require an administrator.
* **A self-healing tenant.** The shared workspace reseeds every six hours, so no visitor can leave
  it permanently broken.

Report a vulnerability privately — see [SECURITY.md](SECURITY.md).

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
GET    /api/public/config                   → version, demo accounts, reset cadence (no auth)
POST   /api/demo/reset                      → restore the seeded baseline
```

## Try this

1. Sign in and note the readiness ring on the dashboard (~73%).
2. Open **Monitoring → Failing**, pick *AWS IAM users have MFA enabled*, and read the two
   non-compliant IAM users with the exact reason each failed.
3. Hit **Fix all** — the test flips to passing and the deadline clears.
4. Go back to the dashboard: the passing-test count has moved, but framework readiness has **not**.
   That is the control weighting working, not a bug: readiness counts controls, and *AC-02
   Multi-factor authentication enforced* still has a second failing test — *Identity provider
   accounts enforce MFA* — so the control is still failing.
5. Fix that one too and readiness moves. Or try *Endpoints have disk encryption enabled*, the only
   test on its control, where a single fix moves readiness immediately.
6. Open **Questionnaires → Security review — renewal** and press **Auto-answer**.
7. Visit `/trust` in a private window, request the SOC 2 report, then approve it under
   **Trust Center**. On the hosted demonstration the details you type are discarded — the queue
   records an anonymous request.
8. **Settings → Reset demo data** puts everything back.

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
| Identity | **None.** The service is deliberately open so it is free to use |

There is no build step on the host and no container image to build: `web/dist`
is committed, the server has no dependencies, and the release commit SHA is the
immutable artifact identity.

### Health and readiness

Since 1.1.0 there is no identity gate, so health can be read from the public
hostname as well as the origin:

```sh
curl -s https://vantage.insta.host/healthz          # version, release SHA, source digest
curl -s https://vantage.insta.host/readyz           # per-component ready/not ready; 503 when not ready
ssh nas1 "curl -s http://127.0.0.1:30002/readyz"    # the same plus full diagnostics, from the origin
```

`/readyz` returns `503` if the database is unreachable, the schema is not
seeded, the monitoring engine has never run, or `web/dist` is missing.

### Publishing and un-publishing

`scripts/publishctl.py` owns the edge state, in a fixed order — Access
application → policy → tunnel ingress → DNS — so identity can never lag behind
routing:

```sh
python3 scripts/publishctl.py status
python3 scripts/publishctl.py apply --stage public --confirm \
        --expect-version 1.1.0 --expect-sha <release-sha>     # remove the identity gate
python3 scripts/publishctl.py regate                           # put it back
```

The `public` stage fails **closed**. It proves the deployed build at the origin
first, while the gate is still up — public-demo mode on, every guard enabled,
and the expected version and release commit — so the Access application is only
ever deleted for a build already known to be safe. It then re-proves the same
claims through the public hostname, including that `/api/dashboard` still
answers 401 anonymously, and any failure, exception or interrupt triggers a
retrying, read-back-confirmed restoration of the gate.

### Release process

See `RELEASE_NOTES.md` for the deployment and rollback runbook, and
`release-evidence/` for the deployment profile and the pre-freeze contract
matrix (live dependency probes with negative controls, bounded-resource
preflight and executable invariants).

```sh
node scripts/verify-invariants.mjs                    # readiness, counters and dist parity
node --test tests/*.test.mjs                          # unit + API contract tests
python3 -m unittest discover -s tests -p 'test_*.py'  # edge-publication tool
```

## Contributing

Issues and pull requests are welcome. Keep the two rules that shape this
codebase: the **server takes no runtime dependencies** (only `node:` builtins),
and `web/dist` is committed, so run `npm run build` and include the rebuilt
bundle with any frontend change. `node --test tests/*.test.mjs` and
`node scripts/verify-invariants.mjs` must both pass.

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, host it, take pieces of it.

## Notes

This is an independent educational reimplementation of the product category. Framework requirement
titles are paraphrased summaries of publicly published standard structures; no proprietary content,
branding or assets are reproduced. All company, personnel and vendor data is fictional.

The seeded demonstration accounts use a published password. That is deliberate
on the hosted demonstration, whose data is fictional, shared and reset every six
hours. It is **not** safe anywhere else: change the passwords in
`server/seed.js`, or put your own identity gate in front, before running an
instance that holds anything real.
