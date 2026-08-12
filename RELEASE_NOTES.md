# Vantage 1.2.1 - governance containment

| | |
|---|---|
| **Release** | 1.2.1 |
| **Type** | Patch - positioning, governance and access containment |
| **Service** | `vantage` |
| **Endpoint** | https://vantage.insta.host |
| **Target** | `nas1.insta.host`, application `vantage` |
| **Previous release** | 1.2.0 (`911bbfa...`) |

## What changed

- The hosted demonstration is restricted behind Cloudflare Access while the
  project's outside-work, ownership and competition position is reviewed.
- Public documentation and application copy now describe Vantage as a
  fictional compliance-readiness sandbox. Its connectors are simulated and do
  not call Microsoft 365, Purview, Azure, AWS or customer systems.
- Scope boundaries distinguish the project from Microsoft Purview Compliance
  Manager: no Microsoft-managed/shared controls, Purview templates, Microsoft
  Compliance Score, regulatory advice, certification or audit opinion.
- `SECURITY.md` no longer promises acknowledgement or fix timelines.
- `PROVENANCE.md` and `CONTRIBUTING.md` establish public source and contribution
  boundaries.
- A regression test prevents donation surfaces, support commitments, implied
  Microsoft affiliation and overstated live-product claims from returning.

## Behaviour changes

- Anonymous visitors are redirected to Cloudflare Access.
- Authorized visitors see clearer fictional/simulated wording throughout the
  sign-in, monitoring, questionnaire and Trust Center journeys.
- No API, schema, seeded data or remediation behavior changes.

## Security and privacy

- Containment preserves Git and deployment history; no evidence was deleted.
- No credential, identity-provider or customer data changes are included.
- Vulnerability reporting remains private and best effort, with no response,
  remediation, support or maintenance commitment.

## Deployment

Deploy the immutable release commit using the existing read-only source mount,
with `APP_VERSION=1.2.1`, the existing reset/session settings and the Access
application left in place.

## Rollback

Pin the application to release `911bbfa1e75cf59d992e05fc6bb12d34ad8e9d08`.
Keep Cloudflare Access in place independently of application rollback.

## Remaining external gate

This release reduces exposure and product-positioning risk. It does not resolve
Employee Agreement ownership, outside-work permission, competition, provenance
or conflict-of-interest questions. Written guidance from the appropriate
manager, AskHR/outside-work channel and CELA remains required before public
ungating, promotion, customer-specific work, compensation or support promises.

Production deployment is also blocked off-LAN: the recorded `ssh-nas1.insta.host`
tunnel ingress is healthy, but the hostname has no Cloudflare Access application
and the SSH alias timed out twice. Repairing or creating that administrative
gateway requires separate infrastructure approval.

## Known release deviation

The existing application predates the current InstaHost visual token contract.
`stylectl.py web/dist/index.html` reports the pre-existing missing theme/token
system. This patch changes wording only, not color, layout, navigation or
responsive structure. A full visual-system migration is intentionally not folded
into a governance-containment patch.
