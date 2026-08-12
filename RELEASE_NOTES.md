# Vantage 1.2.1 - private source containment

| | |
|---|---|
| **Release** | 1.2.1 |
| **Type** | Patch - source positioning and repository containment |
| **Repository** | `phamid/vantage` |
| **Publication model** | Private GitHub repository |
| **Previous public main** | `ecc4d7157e10de697675f5d8482d4c00045f551b` |

## What changed

- Repositioned Vantage as an open-source compliance-readiness, baselining and
  educational reference implementation that complements enterprise governance
  platforms such as Microsoft Purview.
- Made the current implementation boundaries explicit: fictional seeded data,
  simulated connectors, no live Microsoft or customer integration, and no
  Microsoft-managed/shared controls or Microsoft Compliance Score.
- Removed hosted-demo promotion and deployment details from the README.
- Removed vulnerability-response and fix-time commitments.
- Added public provenance and contribution boundaries.
- Added an executable regression test preventing donation surfaces, implied
  Microsoft affiliation, support commitments and inaccurate live-system claims.

## Repository containment

The repository is made private before the remediated commits are pushed to
`main`. Existing Git history is preserved; there is no force push, commit
deletion or evidence rewriting.

After privatization:

- anonymous repository and source access must return `404`;
- authenticated metadata must report `private=true`;
- `main` must fast-forward to the reviewed evidence tip;
- the annotated `v1.2.1` tag and GitHub Release remain private.

## Validation

- 58 Node tests pass.
- 19 Python tests pass.
- The frontend build succeeds.
- All five repository invariants pass.
- The source-positioning regression guard passes.
- The candidate is a non-force fast-forward from the previous public `main`.
- GitHub administration permission, repository scope, zero forks and zero
  network members were verified before containment.

## Application deployment

No application deployment is included in this source release. The separately
hosted service remains access-gated on its existing application version.

## Rollback

Keep the repository private. If source behavior must be reverted, create normal
revert commits on private `main`; do not make the repository public, force-push
or rewrite history.

## Residual risk

Repository privatization prevents future anonymous GitHub access but cannot
recall clones, downloads, browser/search caches, archives or screenshots made
while the repository was public. Any previously exposed secret would require
rotation rather than relying on privatization; no common credential signatures
were found in the local all-ref scan.
