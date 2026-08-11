# Vantage 1.1.0 — release notes

| | |
|---|---|
| **Release** | 1.1.0 |
| **Type** | Minor — free public access and open source, no breaking API change |
| **Service** | `vantage` |
| **Public endpoint** | https://vantage.insta.host |
| **Target** | nas1.insta.host (TrueNAS SCALE), TCP 30002 |
| **Runtime** | `node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03`, release source bind-mounted read-only |
| **Data** | `/mnt/TailsPool/vantage/data` (SQLite) |
| **Identity** | **none — the Cloudflare Access gate is removed by this release** |
| **Repository** | `phamid/vantage` — **public**, MIT licence |
| **Previous release** | 1.0.0 (`c01fbed0…`), see `CHANGELOG.md` |

## What is being released

Vantage becomes a free tool with public source code.

Until now the service ran behind Cloudflare Access, admitting only
`mytechie.com.au` identities, and the repository was private. This release
opens both: `https://vantage.insta.host` is reachable by anyone at no cost with
no account of their own, and the source is published on GitHub under the MIT
licence so anyone can read, fork or self-host it.

Nothing about the product's function changes. What changes is who may use it,
and what the application must defend against now that nothing sits in front of
it.

## What's new

- **Free public access.** No identity gate, no signup, no cost. The seeded
  demonstration accounts shown on the sign-in page are the only credentials
  needed.
- **MIT licence and a public repository**, with `SECURITY.md` describing
  private vulnerability reporting and what the hosted instance is and is not.
- **`GET /api/public/config`** — an unauthenticated description of the
  environment: version, public-demo state, demonstration accounts, reset
  cadence and source URL.
- **A shared demonstration that heals itself**, reseeding on a six-hour cadence
  so one visitor cannot leave it broken for the next.
- **In-product honesty**: a banner in the shell and sign-in copy stating that
  the workspace is shared, when it resets, and where the source lives.
- **`publishctl.py apply --stage public`** — ungating as a verified, reversible
  operation that proves the build at the origin before removing the gate and
  restores it on any failure, plus `publishctl.py regate` to put the gate back
  in one step.

## Security changes

The identity gate was doing real work: it meant an anonymous request never
reached the process. Removing it moves that burden into the application, so
this release adds the guards that make an ungated deployment defensible. Each
has a regression test that was **proven to fail** with the guard removed.

| Guard | What it prevents |
|---|---|
| Per-client rate limiting across five budgets under a global ceiling | One client exhausting CPU with repeated full monitoring scans, remediation or questionnaire autofill, or flooding the process |
| Client address taken from `CF-Connecting-IP` only when the deployment declares the hop trustworthy | A client forging its own rate-limit identity with a header |
| Bounded, swept counter map | Memory growth from rotating source addresses |
| CSP, `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, referrer policy, permissions policy, cross-origin isolation, HSTS over TLS | Clickjacking, MIME confusion, referrer leakage, injected third-party content |
| Length-capped, validated anonymous Trust Center requests, capped pending backlog, JSON body limit 1 MB → 256 kB | The one anonymous write path being used to grow the database without limit |
| Sign-in throttle keyed on address **and** account; expired sessions deleted on each new sign-in | An unlimited attempt budget from rotating the email field; unbounded session accumulation |
| Anonymous Trust Center submissions anonymised before storage on the public demo | A real visitor's name, email and employer being handed to everyone who signs in to the shared workspace |
| Public control status reduced to verified / not yet verified | A reader deriving the live failing-control set by subtraction from the published totals |
| `/readyz` detail restricted to origin monitoring on loopback | Publishing database paths, driver error text and row counts to anonymous callers |
| Reseeding wrapped in one transaction with deferred foreign keys | A crash or a concurrent request observing a half-wiped tenant |

### Findings fixed from the mandatory pre-deployment reviews

The independent security lane returned **BLOCK** and the principal engineering
lane **REVISE** on the first candidate. Both were re-reviewed after these
fixes; nothing was waived.

| Finding | Severity | Fix |
|---|---|---|
| SEC-1 The public Trust Center collected a real visitor's name, email and company and exposed them to anyone holding the published demo credentials | MEDIUM | On the public deployment the submission is accepted and the identifying fields are discarded; the queue records an anonymous demonstration request, and the form says so before you type |
| SEC-1b The `document` field remained caller-controlled free text, so a direct API call could smuggle an identity into the queue and activity feed through it | MEDIUM | The requested document is resolved against the published catalogue; an unrecognised value is refused with 400 |
| SEC-2 The ungate verifier accepted any build reporting `public_demo`, without checking version, release commit or whether the guards were actually enabled | MEDIUM | `/api/public/config` now reports release SHA and per-guard state; the verifier requires the expected version and commit, every guard enabled, the security headers, and `/api/dashboard` answering 401 anonymously |
| SEC-2b The identity flags were optional, so the unsafe invocation was still accepted — and still documented | MEDIUM | `--expect-version` and a full 40-character `--expect-sha` are mandatory for the `public` stage, refused before any network call; a build reporting `unversioned` is refused |
| SEC-3 The ungate deleted the Access application *before* verifying anything, so an interrupt or transport failure could leave the service open | MEDIUM | The build is proven at the origin first, while the gate is still up; post-delete verification is wrapped so that any failure, exception or interrupt triggers a retrying, read-back-confirmed restoration |
| SEC-3b The restoration loop caught `Exception`, but the helper it calls aborted with `SystemExit`, which escaped it — so the first Cloudflare rejection left the service public with no retry and no warning | MEDIUM | Helpers raise an ordinary `PublishError`; the loop catches `BaseException` so nothing short of exhausting its attempts can stop it. `tests/test_publishctl.py` proves it against API rejection, transport failure, interruption and a disagreeing readback |
| SEC-3c The failure path ignored whether restoration had actually succeeded and reported "ungate reverted" either way, so an exhausted restoration would be recorded as a clean revert while the service stayed open | MEDIUM | The return value decides the message: a failed restoration exits with `NOT REVERTED … is PUBLIC and unverified` naming the manual containment steps, and the interrupt path does the same |
| SEC-4 `/readyz` published database paths, `dist` path, raw SQLite error text and row counts anonymously | LOW | Detail is served to loopback monitoring only, or with `VANTAGE_READYZ_DETAIL=1` |
| SEC-5 Public control status had three states, so the failing set was recoverable by subtraction | LOW | Two states only: verified, or not yet verified |
| SEC-5b The published aggregate still counted *tests*, so the failing test count was recoverable from the complement | LOW | The aggregate counts controls, matching the per-control publication exactly |
| ENG-1 `seed()` wiped and refilled 25 tables outside a transaction while the reset timer could fire mid-request | NON-BLOCKING | One `BEGIN IMMEDIATE` transaction with `PRAGMA defer_foreign_keys`, rolled back on failure |
| ENG-2 `publishctl rollback` ignored the result of its own Cloudflare mutations and printed success regardless | NON-BLOCKING | Every rollback mutation is checked and read back; an incomplete rollback exits non-zero and says what is still live |
| ENG-3 Rate-limit budgets could leak between tests sharing a client address | SUGGESTION | Each rate-limit test uses its own `CF-Connecting-IP` |

Role separation from 1.0.0 is unchanged and still enforced: auditor accounts
remain read-only, and tenant reset, policy approval, framework enablement,
settings and Trust Center configuration still require an administrator.

### Accepted security debt, recorded deliberately

- **The demonstration password is public.** `vantage123` is documented on the
  sign-in page, in this repository and through `/api/public/config`. It is a
  published credential for fictional data, not a leaked one. The threat model
  is explicitly "anyone may sign in and change anything", which is why the
  workspace is shared, disposable and reset on a cadence.
- **The repository documents the estate deployment** — the origin's RFC1918
  address, the Cloudflare account, tunnel and identity-provider identifiers.
  None of these is a credential: no API call, tunnel connection or sign-in is
  possible with them alone, and Entra tenant identifiers are already publicly
  discoverable. They are retained because the deployment runbook is part of
  what makes this repository useful.
- **Rate limiting is in-process.** Exact for the single deployed instance;
  would need shared state if the service were ever scaled out.

## Behaviour changes

- `/healthz` and `/readyz` report version `1.1.0`.
- `GET /api/me` additionally returns `public_demo`, `source_url` and
  `next_reset_at`.
- Over-budget requests receive `429` with `Retry-After`.
- On the public deployment, all data is periodically destroyed and reseeded. A
  self-hosted instance defaults to **no** scheduled reset and no public-demo
  banner; both are opt-in via `VANTAGE_PUBLIC_DEMO`.

## Data and migrations

None. The schema is created and seeded idempotently on boot, exactly as in
1.0.0. The scheduled reset uses the same seeding path as the existing
**Settings → Reset demo data** action.

## Breaking changes

None. Every 1.0.0 endpoint keeps its shape; `/api/me` gains fields and no
response field was renamed or removed.

## Known issues and residual risks

- The hosted workspace is shared and mutable by design; vandalism between
  resets is expected and self-heals.
- The public deployment carries no availability commitment. It is one small
  instance on a home-lab host.
- Scheduled resets sign everybody out, because reseeding recreates the users
  table. The client detects the `401` and returns to the sign-in page.

## Deployment instructions

```sh
# 1. pre-release recursive snapshot
ssh nas1 "midclt call zfs.snapshot.create '{\"dataset\":\"TailsPool/vantage\",\"name\":\"pre-1.1.0\",\"recursive\":true}'"

# 2. stage the exact release commit, then compare per-file SHA-256 manifests
rsync -a --delete --exclude '.git' --exclude 'node_modules' --exclude 'tests' \
      --exclude 'release-evidence' -e ssh ./ nas1:/mnt/TailsPool/vantage/releases/<sha>/

# 3. update the application onto the new release directory and the new env
ssh nas1 "midclt call -j app.update <payload>"

# 4. verify on the origin before touching the edge
ssh nas1 "curl -s http://127.0.0.1:30002/healthz; curl -s http://127.0.0.1:30002/readyz"
ssh nas1 "curl -s http://127.0.0.1:30002/api/public/config"

# 5. remove the identity gate (fails closed and self-reverts if the deployed
#    build is not the public-mode build)
python3 scripts/publishctl.py apply --stage public --confirm \
        --expect-version 1.1.0 --expect-sha <release-sha>
```

## Rollback

Two independent axes, each reversible on its own:

1. **Re-gate the service** — `python3 scripts/publishctl.py regate` recreates
   the Access application and the `mytechie.com.au` policy. Ingress and DNS are
   untouched, so this is the fastest containment for any abuse of the open
   endpoint and takes effect at the edge immediately.
2. **Roll the application back to 1.0.0** — `midclt call -j app.update`
   pinning `/mnt/TailsPool/vantage/releases/c01fbed090274a8b9629e68bd1b7dfe68f112b69`
   and the 1.0.0 environment, then
   `midclt call zfs.rollback '{"id":"TailsPool/vantage@pre-1.1.0"}'` if data
   must be restored. 1.0.0 carries no known defect, so rollback is safe.
3. **Re-privatise the repository** — `PATCH /repos/phamid/vantage` with
   `{"private": true}`. Anything cloned or forked while public cannot be
   recalled; that is inherent to publishing and accepted.

The rollback path was confirmed reachable over the same transport used for the
deployment before any mutation was made.

## Deployment evidence

<!-- Replaced with measured values after deployment. -->

| Item | Value |
|---|---|
| Release commit | _pending deployment_ |
| Tag | `v1.1.0` |
| Repository | `phamid/vantage` — **public**, MIT licence |
| Source artifact | release commit tree excluding `.git`, `node_modules`, `tests`, `release-evidence` |
| Staged source digest (post-transfer, hash-sorted manifest) | _pending deployment_ |
| Image (configured and active) | `node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03` |
| Deployment jobs | _pending deployment_ |
| Runtime identity | _pending deployment_ |
| Migration result | not applicable — schema created and seeded idempotently on boot |
| Pre-release snapshot | `TailsPool/vantage@pre-1.1.0` |
| Post-release snapshot | _pending deployment_ |
| Origin health | _pending deployment_ |
| Origin readiness | _pending deployment_ |
| Public edge | _pending deployment_ |
| Ungate verification | _pending deployment_ |
| Pre-deployment QA | _pending_ |
| `GO_DEPLOY` | _pending_ |
| Live QA | _pending_ |
| `GO_PUBLISH` | _pending_ |

Full machine-readable evidence: `release-evidence/release-evidence.json`,
`edge-verification.json`, `cleanup-manifest.json`, `verdicts.json`,
`pre-freeze-contract-matrix.json` and `deployment-profile.json`.

Release notes for 1.0.0 remain in `CHANGELOG.md` and in this file's history.
