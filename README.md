# Vantage — Continuous Compliance Baselining

[![Licence: MIT](https://img.shields.io/badge/licence-MIT-6558f5.svg)](LICENSE)

> **Independent personal project.** Vantage is created and maintained by
> **Patrick Hamid**. It is not endorsed by, sponsored by, affiliated with, or
> supported by Microsoft. Nothing in this project constitutes Microsoft
> support, a warranty, or a commitment. See the [project notice](PROJECT_NOTICE.md).

**Open source under the MIT licence.**

Vantage is an independent, fictional compliance-readiness sandbox. It models how
controls, test results, framework mappings, evidence drafts, questionnaires and
a Trust Center can fit together. The included integrations are simulated records:
this repository does not connect to Microsoft 365, Microsoft Purview, Azure,
AWS or any other live customer environment.

Vantage is intended for internal, ongoing compliance baselining—not as a one-time compliance
claim. It helps teams maintain their posture, identify gaps and prepare evidence before a formal
engagement. Independent third-party verification is still required for SOC, ISO and similar
frameworks; Vantage does not provide certification or replace independent assurance, but gives
teams a head start before that engagement begins.

The local engine evaluates its fictional SQLite dataset, applies simulated target
states and recomputes internal readiness indicators. Those indicators are not a
Microsoft Compliance Score, certification result, audit opinion, legal assessment
or statement that an organization complies with any framework.

## Run your own

```
git clone https://github.com/phamid/vantage.git && cd vantage
npm run setup     # install frontend build tooling and build web/dist
npm start         # http://localhost:4173
npm test          # no network required
```

The server has **no runtime dependencies** — it runs on Node 24+ using only
`node:` builtins, including `node:sqlite`. `npm install` at the root installs
nothing; only the frontend build needs packages.

A local instance is private by default: no shared-sandbox banner and **no**
scheduled data reset. Change the seeded passwords in `server/seed.js` before
putting one on a network.

---

## What it does

| Area | Capability |
| --- | --- |
| **Frameworks** | 7 framework baselines — SOC 2 Type II, ISO 27001:2022, HIPAA Security Rule, GDPR, PCI DSS v4.0, NIST CSF 2.0 and ISO 42001 — with 159 requirements mapped to a single shared control set for internal gap assessment. Enable or disable any framework. |
| **Controls** | 62 controls, each owned, described, mapped to every requirement it satisfies across all frameworks, and linked to the tests that evidence it. |
| **Simulated monitoring** | 49 automated tests evaluate fictional resource records every hour. Failing tests create demonstration tasks with example target dates. |
| **Simulated remediation** | One-click "Fix" changes the fictional record to its configured target state, re-runs the test, and recomputes the internal indicator. |
| **Policies** | 22 versioned policies with approval workflow, annual review dates, per-person acceptance tracking and reminders. |
| **Personnel** | HR-synced roster with security training, background checks, policy acceptance and offboarding access revocation. |
| **Devices** | Endpoint posture from MDM: disk encryption, screen lock, anti-malware, OS currency, check-in recency. |
| **Vendors** | Third-party inventory with risk tiering, sub-processor flags, SOC 2 / ISO 27001 assurance and recurring security reviews. |
| **Risk register** | Inherent vs residual scoring, a residual risk heat map, treatment decisions, owners and due-date tracking. |
| **Engagement preparation** | Third-party engagements with verifier details, observation windows, a PBC evidence-request list with statuses, and a supporting-evidence library. |
| **Questionnaires** | Example security-questionnaire drafts generated from fictional controls and policies, always requiring human review. |
| **Trust Center** | A demonstration security page generated from fictional monitoring data, with example documents and requests. |
| **Integrations** | 20 simulated connector records used to demonstrate inventory and workflow concepts; no external API is called. |
| **Inventory** | Every discovered resource with the exact configuration attributes the tests evaluate. |

## Scope boundaries

Vantage deliberately does not:

* ingest Microsoft 365, Purview, Defender for Cloud or Azure Policy signals;
* provide Microsoft-managed or shared-responsibility control results;
* reproduce Microsoft Compliance Manager templates, guidance or scoring;
* provide regulatory, legal, certification or audit advice;
* connect to customer systems in this repository; or
* promise support, maintenance, fixes, response times, features or availability.

See [PROVENANCE.md](PROVENANCE.md) and [CONTRIBUTING.md](CONTRIBUTING.md) for
source and contribution boundaries.

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

The internal framework-readiness indicator is control-weighted — the share of a framework's mapped
controls that are not failing. It is an operational baseline for finding and tracking gaps, not a
certification result, audit opinion or statement of conformity. A requirement is "at risk" if any
control mapped to it is failing.

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
  seed.js             sandbox tenant: people, devices, cloud resources, vendors, risks, audits
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
| `npm run seed` | Reset the database to the seeded sandbox tenant |
| `npm --prefix web run dev` | Vite dev server on 5173, proxying `/api` to 4173 |

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4173` | HTTP port |
| `VANTAGE_DB` | `data/vantage.db` | SQLite file location |
| `VANTAGE_SCAN_MINUTES` | `60` | Continuous monitoring interval |
| `VANTAGE_PUBLIC_DEMO` | `0` | Enable shared-sandbox safeguards and default the reset cadence on |
| `VANTAGE_DEMO_RESET_MINUTES` | `1440` when shared mode is enabled, else `0` | Reseed the whole tenant on this cadence. **Destructive** — `0` disables it |
| `VANTAGE_RATE_LIMIT` | `1` | Per-client rate limiting on `/api` |
| `VANTAGE_TRUST_PROXY` | follows `VANTAGE_PUBLIC_DEMO` | Take the client address from `CF-Connecting-IP` / `X-Forwarded-For`. Only enable behind a proxy you control |
| `VANTAGE_HSTS` | `0` | Always send HSTS, rather than only when the request arrived over TLS |
| `VANTAGE_MAX_PENDING_TRUST_REQUESTS` | `200` | Cap on the anonymous Trust Center request backlog |
| `VANTAGE_SOURCE_URL` | this repository | "Source on GitHub" link shown in the UI |
| `VANTAGE_SESSION_DAYS` | `14` | Session lifetime. Shared mode can use `1`, so a session never outlives the data it was issued against |
| `VANTAGE_READYZ_DETAIL` | `0` | Serve full `/readyz` diagnostics to every caller. By default paths, driver errors and row counts go only to a loopback caller; everyone else gets a reason code such as `data_volume_not_writable` |
| `VANTAGE_ALLOW_DEMO_RESET` | `1` | Set to `0` to refuse tenant resets entirely |

## Shared-mode safeguards

When an operator intentionally enables shared mode, the application provides:

* **Per-client rate limits** across five budgets — reads, writes, expensive operations (full
  scans, remediation, questionnaire autofill, tenant reset), sign-in and anonymous contact — under
  a global per-client ceiling. Over-budget requests get `429` with `Retry-After`.
* **Browser security headers** on every response: a content security policy matching what the build
  emits, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions
  policies, cross-origin isolation, and HSTS over TLS.
* **Bounded unauthenticated writes.** The Trust Center access-request form is the only table an unauthenticated
  visitor can write to: fields are length-capped, the address validated, the backlog capped, and the
  JSON body limit is 256 kB.
* **No visitor identity is stored in shared mode.** Anyone with access can sign in to the shared workspace and read the
  access-request queue, so in shared-demo mode the name, email and company submitted to that
  form are discarded and an anonymous sandbox request is recorded instead. The requested
  document is resolved against the published catalogue rather than stored as typed, so no free-text
  field survives. A self-hosted instance keeps the requester it was given.
* **A sandbox Trust Center that discloses only coverage.** Control status is published as exactly two
  values — `verified` and `in_progress` — so a failing control is indistinguishable from an untested
  one, and the published aggregate counts controls rather than tests so its complement cannot be
  subtracted back into a live failing count.
* **Role separation.** Auditor accounts are read-only; tenant reset, policy approval, framework
  enablement, settings and Trust Center configuration require an administrator.
* **A self-healing tenant.** The shared workspace reseeds daily — measured from the last reset and
  persisted, so a restart cannot quietly postpone it — and an overdue reset runs at boot.
* **Nothing a visitor types is kept.** The sign-in page pre-fills the sandbox account and asks
  the browser not to save or autofill credentials against it; the session token lives in
  `sessionStorage` and dies with the tab; and the sign-in throttle keys on an HMAC under a
  process-random key, so a real address typed by habit is neither held in the clear nor
  confirmable by guessing.

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
GET    /api/public/config                   → version, sandbox accounts, reset cadence (no auth)
POST   /api/demo/reset                      → restore the seeded baseline
```

## Try this

1. Sign in and note the readiness ring on the dashboard (~73%).
2. Open **Monitoring → Failing**, pick *AWS IAM users have MFA enabled*, and read the two
   IAM users that do not meet the configured MFA rule, with the exact reason each failed.
3. Hit **Fix all** — the test flips to passing and the deadline clears.
4. Go back to the dashboard: the passing-test count has moved, but framework readiness has **not**.
   That is the control weighting working, not a bug: readiness counts controls, and *AC-02
   Multi-factor authentication enforced* still has a second failing test — *Identity provider
   accounts enforce MFA* — so the control is still failing.
5. Fix that one too and readiness moves. Or try *Endpoints have disk encryption enabled*, the only
   test on its control, where a single fix moves readiness immediately.
6. Open **Questionnaires → Security review — renewal** and press **Auto-answer**.
7. Visit `/trust`, request the example SOC 2 report, then approve it under
   **Trust Center**.
8. **Settings → Reset sandbox data** puts everything back.

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

The seeded sandbox accounts use a published password. They protect only
fictional local data and are **not** safe for any instance holding real
information. Change the passwords in `server/seed.js` and add appropriate
identity controls before putting an instance on a network.
