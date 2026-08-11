#!/usr/bin/env python3
"""Publish, ungate (or withdraw) vantage.insta.host on the InstaHost estate.

Publication order is fixed and enforced: Access application -> Access policy ->
tunnel ingress -> DNS. DNS is last so that a failed identity gate can never
expose the origin. Rollback reverses that order.

    python3 scripts/publishctl.py status
    python3 scripts/publishctl.py apply --stage access
    python3 scripts/publishctl.py apply --stage network
    python3 scripts/publishctl.py apply --stage public --confirm   # free tool
    python3 scripts/publishctl.py regate                           # restore gate
    python3 scripts/publishctl.py rollback --confirm

The network stage refuses to run unless the live Access policy already matches
the intended allowlist, so routing can never be published ahead of identity.

The `public` stage removes the identity gate so the service can be used free of
charge by anyone. It fails **closed**: after the gate is removed it proves the
deployed build is actually running the public-mode guards, and restores the
Access application immediately if it is not.

The Cloudflare credential is read from ~/.config/cloudflare/env or the login
Keychain and is never printed.
"""

import argparse
import json
import os
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request

ACCOUNT = "ab479cdd65b082569c7aafaae35e971d"
TUNNEL = "40cd9ce8-5c37-4b72-afe4-698c57cd8b65"
ZONE_NAME = "insta.host"
HOSTNAME = "vantage.insta.host"
ORIGIN_PORT = 30002
ORIGIN = f"http://192.168.100.116:{ORIGIN_PORT}"
SSH_ALIAS = "nas1"
APP_NAME = "Vantage - Trust and Compliance"
SESSION_DURATION = "8h"

ENTRA_IDP = "35422e5f-ef18-4c8c-8876-2ba8c078e70f"
OTP_IDP = "69cd38c9-cd42-47f6-a945-4a255ac92d7f"
ALLOWED_EMAIL_DOMAINS = ["mytechie.com.au"]
POLICY_NAME = "Allow MyTechie staff"


def tls_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context(cafile="/etc/ssl/cert.pem")


def credential():
    path = os.path.expanduser("~/.config/cloudflare/env")
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if line.startswith("CLOUDFLARE_API_TOKEN"):
                return line.split("=", 1)[1].strip().strip("'\"")
    out = subprocess.run(["security", "find-generic-password", "-s", "Cloudflare API Token", "-w"],
                         capture_output=True, text=True, check=False).stdout.strip()
    if not out:
        raise SystemExit("no Cloudflare credential available")
    return out


def call(path, method="GET", body=None, token=None):
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4{path}", method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, context=tls_context(), timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {"success": False, "errors": [{"code": e.code}]}


def zone_id(token):
    _, d = call(f"/zones?name={ZONE_NAME}", token=token)
    result = d.get("result") or []
    if not result:
        raise SystemExit(f"zone {ZONE_NAME} not found")
    return result[0]["id"]


def find_app(token):
    _, d = call(f"/accounts/{ACCOUNT}/access/apps?per_page=100", token=token)
    for a in d.get("result") or []:
        if a.get("domain") == HOSTNAME:
            return a
    return None


def intended_include():
    return [{"email_domain": {"domain": domain}} for domain in ALLOWED_EMAIL_DOMAINS]


def policy_matches(policy):
    """True when the live policy admits exactly the intended email domains."""
    if not policy or policy.get("decision") != "allow":
        return False
    live = policy.get("include") or []
    live_domains = sorted(
        rule["email_domain"]["domain"] for rule in live
        if isinstance(rule, dict) and "email_domain" in rule)
    if len(live) != len(live_domains):
        return False
    return live_domains == sorted(ALLOWED_EMAIL_DOMAINS)


def live_policy(token, app_id):
    _, d = call(f"/accounts/{ACCOUNT}/access/apps/{app_id}/policies", token=token)
    result = d.get("result") or []
    return result[0] if result else None


def ingress_rules(token):
    _, d = call(f"/accounts/{ACCOUNT}/cfd_tunnel/{TUNNEL}/configurations", token=token)
    cfg = (d.get("result") or {}).get("config") or {}
    return cfg, cfg.get("ingress", [])


def dns_record(token, zid):
    _, d = call(f"/zones/{zid}/dns_records?name={HOSTNAME}", token=token)
    result = d.get("result") or []
    return result[0] if result else None


def create_access_app(token):
    """Create the Access application and its allowlist policy. Idempotent."""
    app = find_app(token)
    if not app:
        _, d = call(f"/accounts/{ACCOUNT}/access/apps", "POST", {
            "name": APP_NAME,
            "domain": HOSTNAME,
            "type": "self_hosted",
            "session_duration": SESSION_DURATION,
            "allowed_idps": [ENTRA_IDP, OTP_IDP],
            "auto_redirect_to_identity": False,
            "app_launcher_visible": True,
            "http_only_cookie_attribute": True,
            "enable_binding_cookie": False,
        }, token=token)
        if not d.get("success"):
            raise SystemExit(f"access app create failed: {json.dumps(d.get('errors'))[:300]}")
        app = d["result"]
        print(f"created Access application {app['id'][:8]}... for {HOSTNAME}")
    else:
        print(f"Access application already present ({app['id'][:8]}...)")

    if policy_matches(live_policy(token, app["id"])):
        print("Access policy already matches the intended allowlist")
    else:
        _, d = call(f"/accounts/{ACCOUNT}/access/apps/{app['id']}/policies", "POST", {
            "name": POLICY_NAME,
            "decision": "allow",
            "precedence": 1,
            "include": intended_include(),
        }, token=token)
        if not d.get("success"):
            raise SystemExit(f"access policy create failed: {json.dumps(d.get('errors'))[:300]}")
        print(f"created Access policy admitting {', '.join(ALLOWED_EMAIL_DOMAINS)}")

    if not policy_matches(live_policy(token, app["id"])):
        raise SystemExit("policy readback does not match intent; refusing to proceed")
    print("verified: live policy matches intent")
    return app


def probe_public(path, timeout=15):
    """GET https://<hostname><path> from outside the estate. Returns
    (status, headers, body-or-None) and never raises for an HTTP error.

    Uses the module's TLS context: macOS system Python ships no usable CA
    bundle, and a certificate failure here would otherwise look exactly like a
    broken service and revert a perfectly good ungate.
    """
    req = urllib.request.Request(f"https://{HOSTNAME}{path}", method="GET",
                                 headers={"User-Agent": "vantage-publishctl"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=tls_context()) as r:
            return r.status, dict(r.headers), r.read(200_000)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), None
    except Exception as e:  # noqa: BLE001 - a network failure is a probe result
        return 0, {}, str(e).encode()


def public_guards_live(expect_version=None, expect_sha=None):
    """Prove the deployed build is the ungated-safe one. Returns (ok, detail).

    Removing the identity gate is only safe if the application itself is
    enforcing the public-mode guards, so every claim here is read from the live
    service rather than assumed from the deployment. It checks, in order:
    the public config is reachable and reports public_demo; every guard it
    reports is enabled; the running version and release commit are the ones
    intended; the browser security headers are present; and an authenticated
    route still refuses an anonymous caller.
    """
    status, headers, body = probe_public("/api/public/config")
    if status != 200 or not body:
        return False, f"/api/public/config answered {status}"
    try:
        cfg = json.loads(body)
    except ValueError:
        return False, "/api/public/config did not return JSON"
    if not cfg.get("public_demo"):
        return False, "the deployed build does not report public_demo"

    guards = cfg.get("guards") or {}
    if not guards:
        return False, "the deployed build reports no guard state; it predates the public-mode release"
    for guard in ("rate_limit", "security_headers", "anonymous_writes_anonymized", "auto_reset"):
        if not guards.get(guard):
            return False, f"guard {guard} is not enabled on the deployed build"

    if expect_version and cfg.get("version") != expect_version:
        return False, f"deployed version {cfg.get('version')!r} is not the expected {expect_version!r}"
    if expect_sha and cfg.get("release_sha") != expect_sha:
        return False, f"deployed release_sha {str(cfg.get('release_sha'))[:12]!r} is not the expected {expect_sha[:12]!r}"

    lower = {k.lower(): v for k, v in headers.items()}
    for header, expected in (("x-content-type-options", "nosniff"),
                             ("x-frame-options", "DENY")):
        if lower.get(header, "").lower() != expected.lower():
            return False, f"missing security header {header}"
    if "frame-ancestors" not in lower.get("content-security-policy", ""):
        return False, "missing content-security-policy"

    # Negative control on the live service: an authenticated route must still
    # refuse an anonymous caller once the identity gate is gone.
    auth_status, _, _ = probe_public("/api/dashboard")
    if auth_status != 401:
        return False, f"/api/dashboard answered {auth_status} anonymously; expected 401"

    detail = (f"public_demo=true version={cfg.get('version')} release_sha={str(cfg.get('release_sha'))[:12]} "
              f"guards={sorted(k for k, v in guards.items() if v)} "
              f"reset_every={(cfg.get('demo') or {}).get('reset_interval_minutes')}min, "
              f"headers present, /api/dashboard 401")
    return True, detail


def origin_guards_live(expect_version=None, expect_sha=None):
    """Run the same guard check against the origin over SSH, before the gate is
    removed. Proving the deployed build first means the Access application is
    only ever deleted for a build already known to be safe."""
    try:
        out = subprocess.run(
            ["ssh", "-o", "ConnectTimeout=25", "-o", "BatchMode=yes", SSH_ALIAS,
             f"curl -s -m 10 http://127.0.0.1:{ORIGIN_PORT}/api/public/config"],
            capture_output=True, text=True, check=False, timeout=90)
    except Exception as e:  # noqa: BLE001 - a transport failure is a probe result
        return False, f"origin probe transport failed: {e}"
    if out.returncode != 0 or not out.stdout.strip():
        return False, f"origin probe returned no body (ssh exit {out.returncode})"
    try:
        cfg = json.loads(out.stdout)
    except ValueError:
        return False, "origin /api/public/config did not return JSON"
    if not cfg.get("public_demo"):
        return False, "the deployed build does not report public_demo at the origin"
    guards = cfg.get("guards") or {}
    missing = [g for g in ("rate_limit", "security_headers", "anonymous_writes_anonymized", "auto_reset")
               if not guards.get(g)]
    if missing:
        return False, f"origin build has guards disabled: {', '.join(missing)}"
    if expect_version and cfg.get("version") != expect_version:
        return False, f"origin version {cfg.get('version')!r} is not the expected {expect_version!r}"
    if expect_sha and cfg.get("release_sha") != expect_sha:
        return False, f"origin release_sha {str(cfg.get('release_sha'))[:12]!r} is not the expected {expect_sha[:12]!r}"
    return True, (f"origin reports public_demo=true version={cfg.get('version')} "
                  f"release_sha={str(cfg.get('release_sha'))[:12]} guards all enabled")


def restore_gate_or_die(token, reason):
    """Put the Access application back, retrying until a readback confirms it.

    Deleting the gate before verification would otherwise mean a crash, a
    credential failure or a transport error leaves the service open. This is
    the guaranteed-restoration half of that: it retries, reads the application
    and its policy back, and only gives up after exhausting its attempts — at
    which point it says exactly what an operator must do by hand.
    """
    print(f"restoring the Access application: {reason}", file=sys.stderr)
    for attempt in range(1, 7):
        try:
            create_access_app(token)
            app = find_app(token)
            if app and policy_matches(live_policy(token, app["id"])):
                print(f"gate restored and read back on attempt {attempt}", file=sys.stderr)
                return True
        except Exception as e:  # noqa: BLE001 - keep retrying through any failure
            print(f"restore attempt {attempt} failed: {str(e)[:200]}", file=sys.stderr)
        time.sleep(min(30, 3 * attempt))
    print("CRITICAL: could not restore the Access application. The service is "
          "PUBLIC and unverified. Restore it by hand immediately, or remove the "
          "tunnel ingress rule for the hostname to take it offline.", file=sys.stderr)
    return False


def cmd_status(token):
    app = find_app(token)
    policy = live_policy(token, app["id"]) if app else None
    _, ingress = ingress_rules(token)
    rule = next((i for i in ingress if i.get("hostname") == HOSTNAME), None)
    record = dns_record(token, zone_id(token))
    print(f"access_application : {'present' if app else 'absent'}"
          + (f" (id {app['id'][:8]}..., idps={len(app.get('allowed_idps') or [])})" if app else ""))
    print(f"access_policy      : {'present' if policy else 'absent'}"
          + (f" (matches intent: {policy_matches(policy)})" if policy else ""))
    print(f"tunnel_ingress     : {'present' if rule else 'absent'}"
          + (f" -> {rule.get('service')}" if rule else ""))
    print(f"dns_record         : {'present' if record else 'absent'}"
          + (f" {record['type']} proxied={record.get('proxied')}" if record else ""))
    catch_all = ingress[-1].get("service") if ingress else None
    print(f"catch_all_last     : {catch_all}")
    return 0


def cmd_apply(token, stage, confirm=False, expect_version=None, expect_sha=None):
    if stage == "access":
        create_access_app(token)
        return 0

    if stage == "public":
        # Removing the identity gate is the one operation here that *reduces*
        # protection, so it is explicit, verified before and after, and
        # self-reverting.
        if not confirm:
            raise SystemExit("refusing: --stage public requires --confirm")
        _, ingress = ingress_rules(token)
        if not any(i.get("hostname") == HOSTNAME for i in ingress):
            raise SystemExit(f"refusing: no tunnel ingress rule for {HOSTNAME}")
        if not dns_record(token, zone_id(token)):
            raise SystemExit(f"refusing: no DNS record for {HOSTNAME}")

        # Prove the deployed build first, at the origin, while the gate is
        # still up. The Access application is only ever deleted for a build
        # already known to carry the guards.
        ok, detail = origin_guards_live(expect_version, expect_sha)
        if not ok:
            raise SystemExit(f"refusing: {detail}")
        print(f"origin precondition met: {detail}")

        app = find_app(token)
        if not app:
            print("Access application already absent; the service is public")
        else:
            _, d = call(f"/accounts/{ACCOUNT}/access/apps/{app['id']}", "DELETE", token=token)
            if not d.get("success"):
                raise SystemExit(f"access app delete failed: {json.dumps(d.get('errors'))[:300]}")
            print(f"deleted Access application {app['id'][:8]}... — {HOSTNAME} is now open")

        # Edge state takes a moment to propagate; poll rather than guess. Any
        # failure — including an exception or an interrupt — restores the gate.
        ok, detail = False, "not probed"
        try:
            for _ in range(20):
                ok, detail = public_guards_live(expect_version, expect_sha)
                if ok:
                    break
                time.sleep(6)
        except BaseException as e:  # noqa: BLE001 - including KeyboardInterrupt
            restore_gate_or_die(token, f"verification aborted: {str(e)[:200]}")
            raise

        if not ok:
            print(f"VERIFICATION FAILED: {detail}", file=sys.stderr)
            restore_gate_or_die(token, "public verification failed")
            raise SystemExit("ungate reverted: the deployed build did not prove its guards live")

        print(f"verified live: {detail}")
        print(f"{HOSTNAME} is publicly reachable, free to use, with no identity gate")
        return 0

    if stage == "network":
        # Identity must already be correct before any routing is published.
        app = find_app(token)
        if not app:
            raise SystemExit("refusing: no Access application exists for " + HOSTNAME)
        if not policy_matches(live_policy(token, app["id"])):
            raise SystemExit("refusing: live Access policy does not match the intended allowlist")
        print("precondition met: Access application and policy verified live")

        cfg, ingress = ingress_rules(token)
        if any(i.get("hostname") == HOSTNAME for i in ingress):
            print("tunnel ingress rule already present")
        else:
            catch_all = [i for i in ingress if not i.get("hostname")]
            named = [i for i in ingress if i.get("hostname")]
            new_ingress = named + [{"hostname": HOSTNAME, "service": ORIGIN}] + catch_all
            if not new_ingress[-1].get("service") or new_ingress[-1].get("hostname"):
                raise SystemExit("refusing: catch-all rule would not be last")
            status, d = call(f"/accounts/{ACCOUNT}/cfd_tunnel/{TUNNEL}/configurations", "PUT",
                             {"config": {**cfg, "ingress": new_ingress}}, token=token)
            if not d.get("success"):
                raise SystemExit(f"ingress update failed: {json.dumps(d.get('errors'))[:300]}")
            print(f"added ingress rule {HOSTNAME} -> {ORIGIN}")

        _, ingress = ingress_rules(token)
        if not any(i.get("hostname") == HOSTNAME for i in ingress):
            raise SystemExit("ingress readback failed")
        if ingress[-1].get("hostname"):
            raise SystemExit("catch-all is no longer last after the update")
        print("verified: ingress rule present and catch-all still last")

        zid = zone_id(token)
        record = dns_record(token, zid)
        if record:
            print("DNS record already present")
        else:
            status, d = call(f"/zones/{zid}/dns_records", "POST", {
                "type": "CNAME",
                "name": HOSTNAME,
                "content": f"{TUNNEL}.cfargotunnel.com",
                "proxied": True,
                "ttl": 1,
                "comment": "vantage 1.0.0 - Access gated",
            }, token=token)
            if not d.get("success"):
                raise SystemExit(f"dns create failed: {json.dumps(d.get('errors'))[:300]}")
            print(f"created proxied CNAME {HOSTNAME}")

        if not dns_record(token, zid):
            raise SystemExit("dns readback failed")
        print("verified: DNS record present")
        return 0

    raise SystemExit(f"unknown stage {stage}")


def cmd_rollback(token, confirm):
    if not confirm:
        raise SystemExit("refusing: rollback requires --confirm")
    failures = []
    zid = zone_id(token)
    # Reverse of the publication order: DNS, then ingress, then Access. Every
    # mutation is checked and read back: a rollback that silently failed while
    # reporting success is worse than one that refuses.
    record = dns_record(token, zid)
    if record:
        _, d = call(f"/zones/{zid}/dns_records/{record['id']}", "DELETE", token=token)
        if not d.get("success") or dns_record(token, zid):
            failures.append("DNS record still present")
        else:
            print("deleted DNS record")
    cfg, ingress = ingress_rules(token)
    if any(i.get("hostname") == HOSTNAME for i in ingress):
        remaining = [i for i in ingress if i.get("hostname") != HOSTNAME]
        _, d = call(f"/accounts/{ACCOUNT}/cfd_tunnel/{TUNNEL}/configurations", "PUT",
                    {"config": {**cfg, "ingress": remaining}}, token=token)
        _, readback = ingress_rules(token)
        if not d.get("success") or any(i.get("hostname") == HOSTNAME for i in readback):
            failures.append("tunnel ingress rule still present")
        else:
            print("removed ingress rule")
    app = find_app(token)
    if app:
        _, d = call(f"/accounts/{ACCOUNT}/access/apps/{app['id']}", "DELETE", token=token)
        if not d.get("success") or find_app(token):
            failures.append("Access application still present")
        else:
            print("deleted Access application and its policies")
    if failures:
        raise SystemExit("ROLLBACK INCOMPLETE — the service may still be reachable: " + "; ".join(failures))
    print("rollback complete; the origin is no longer publicly routable")
    return 0


def cmd_regate(token):
    """Put the identity gate back in front of the service in one step."""
    if not restore_gate_or_die(token, "operator requested regate"):
        raise SystemExit("regate failed; restore the Access application by hand")
    status, _, _ = probe_public("/api/public/config")
    print(f"public probe now answers {status} (a redirect to the identity provider means the gate is live)")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    apply_parser = sub.add_parser("apply")
    apply_parser.add_argument("--stage", required=True, choices=["access", "network", "public"])
    apply_parser.add_argument("--confirm", action="store_true")
    apply_parser.add_argument("--expect-version", help="version the deployed build must report before the gate is removed")
    apply_parser.add_argument("--expect-sha", help="release commit the deployed build must report before the gate is removed")
    sub.add_parser("regate")
    rollback_parser = sub.add_parser("rollback")
    rollback_parser.add_argument("--confirm", action="store_true")
    args = parser.parse_args()

    token = credential()
    if args.command == "status":
        return cmd_status(token)
    if args.command == "apply":
        return cmd_apply(token, args.stage, args.confirm,
                         getattr(args, "expect_version", None), getattr(args, "expect_sha", None))
    if args.command == "regate":
        return cmd_regate(token)
    if args.command == "rollback":
        return cmd_rollback(token, args.confirm)
    return 1


if __name__ == "__main__":
    sys.exit(main())
