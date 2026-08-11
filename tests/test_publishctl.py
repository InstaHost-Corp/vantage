"""Tests for the edge-publication tool, focused on the one operation that can
leave the service unprotected: removing the identity gate.

    python3 -m unittest discover -s tests -p 'test_*.py'

Every test here drives the real functions with the Cloudflare API and the
origin probe replaced, so the failure paths that matter — an API rejection, a
transport failure, an interrupt — are exercised rather than reasoned about.
"""

import importlib.util
import io
import os
import sys
import unittest
from contextlib import redirect_stderr
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("publishctl", os.path.join(ROOT, "scripts", "publishctl.py"))
publishctl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publishctl)


class RestoreGateTests(unittest.TestCase):
    """restore_gate_or_die is the last line of defence: if it gives up quietly,
    the service stays public with no gate and nobody is told."""

    def test_restores_and_reads_back(self):
        with mock.patch.object(publishctl, "create_access_app", return_value={"id": "app"}), \
             mock.patch.object(publishctl, "find_app", return_value={"id": "app"}), \
             mock.patch.object(publishctl, "live_policy", return_value={"policy": True}), \
             mock.patch.object(publishctl, "policy_matches", return_value=True), \
             mock.patch.object(publishctl.time, "sleep"):
            err = io.StringIO()
            with redirect_stderr(err):
                self.assertTrue(publishctl.restore_gate_or_die("token", "test"))
            self.assertIn("gate restored and read back", err.getvalue())

    def test_a_cloudflare_rejection_is_retried_not_fatal(self):
        """create_access_app aborts on an API rejection. That must not escape
        the retry loop — an early version raised SystemExit straight through it
        and left the service public on the first failure."""
        attempts = []

        def flaky(_token):
            attempts.append(1)
            if len(attempts) < 3:
                raise publishctl.PublishError("access app create failed: [{'code': 1001}]")
            return {"id": "app"}

        with mock.patch.object(publishctl, "create_access_app", side_effect=flaky), \
             mock.patch.object(publishctl, "find_app", return_value={"id": "app"}), \
             mock.patch.object(publishctl, "live_policy", return_value={}), \
             mock.patch.object(publishctl, "policy_matches", return_value=True), \
             mock.patch.object(publishctl.time, "sleep"):
            err = io.StringIO()
            with redirect_stderr(err):
                self.assertTrue(publishctl.restore_gate_or_die("token", "test"))
        self.assertEqual(len(attempts), 3)
        self.assertIn("restore attempt 1 failed", err.getvalue())

    def test_a_systemexit_from_a_helper_does_not_escape(self):
        raised = []

        def aborting(_token):
            raised.append(1)
            raise SystemExit("policy readback does not match intent")

        with mock.patch.object(publishctl, "create_access_app", side_effect=aborting), \
             mock.patch.object(publishctl, "find_app", return_value=None), \
             mock.patch.object(publishctl.time, "sleep"):
            err = io.StringIO()
            with redirect_stderr(err):
                self.assertFalse(publishctl.restore_gate_or_die("token", "test"))
        self.assertEqual(len(raised), 6, "every attempt must be made")
        self.assertIn("CRITICAL", err.getvalue())

    def test_a_transport_failure_ends_with_the_critical_instruction(self):
        with mock.patch.object(publishctl, "create_access_app",
                               side_effect=OSError("connection reset by peer")), \
             mock.patch.object(publishctl, "find_app", return_value=None), \
             mock.patch.object(publishctl.time, "sleep"):
            err = io.StringIO()
            with redirect_stderr(err):
                self.assertFalse(publishctl.restore_gate_or_die("token", "test"))
        output = err.getvalue()
        self.assertIn("CRITICAL", output)
        self.assertIn("PUBLIC and unverified", output)

    def test_a_readback_that_disagrees_is_not_accepted(self):
        """A create that reports success but whose policy does not match intent
        is not a restored gate."""
        with mock.patch.object(publishctl, "create_access_app", return_value={"id": "app"}), \
             mock.patch.object(publishctl, "find_app", return_value={"id": "app"}), \
             mock.patch.object(publishctl, "live_policy", return_value={"decision": "allow"}), \
             mock.patch.object(publishctl, "policy_matches", return_value=False), \
             mock.patch.object(publishctl.time, "sleep"):
            err = io.StringIO()
            with redirect_stderr(err):
                self.assertFalse(publishctl.restore_gate_or_die("token", "test"))
        self.assertIn("CRITICAL", err.getvalue())


class UngateStageTests(unittest.TestCase):
    def _edge_present(self):
        return [
            mock.patch.object(publishctl, "ingress_rules",
                              return_value=({}, [{"hostname": publishctl.HOSTNAME, "service": publishctl.ORIGIN}])),
            mock.patch.object(publishctl, "zone_id", return_value="zone"),
            mock.patch.object(publishctl, "dns_record", return_value={"id": "rec"}),
        ]

    def test_release_identity_is_mandatory(self):
        """Refused before any network call, and refused for the right reason —
        a check that merely sees *some* refusal would pass even with the guard
        removed, because the next step also refuses."""
        cases = [
            ({}, "--expect-version"),
            ({"expect_version": "1.1.0"}, "--expect-sha"),
            ({"expect_version": "1.1.0", "expect_sha": "abc123"}, "--expect-sha"),
            ({"expect_version": "1.1.0", "expect_sha": "A" * 40}, "--expect-sha"),
        ]
        for kwargs, expected in cases:
            with mock.patch.object(publishctl, "call") as called, \
                 mock.patch.object(publishctl, "ingress_rules") as ingress:
                with self.assertRaises(SystemExit) as caught:
                    publishctl.cmd_apply("token", "public", confirm=True, **kwargs)
                self.assertIn(expected, str(caught.exception), f"wrong refusal for {kwargs}")
                called.assert_not_called()
                ingress.assert_not_called()

    def test_confirmation_is_mandatory(self):
        with self.assertRaises(SystemExit):
            publishctl.cmd_apply("token", "public", confirm=False,
                                 expect_version="1.1.0", expect_sha="a" * 40)

    def test_the_gate_is_not_removed_when_the_origin_build_is_wrong(self):
        deleted = []
        patches = self._edge_present() + [
            mock.patch.object(publishctl, "origin_guards_live",
                              return_value=(False, "the deployed build does not report public_demo at the origin")),
            mock.patch.object(publishctl, "call", side_effect=lambda *a, **k: deleted.append(a) or (200, {"success": True})),
        ]
        for p in patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in patches])
        with self.assertRaises(SystemExit) as caught:
            publishctl.cmd_apply("token", "public", confirm=True,
                                 expect_version="1.1.0", expect_sha="a" * 40)
        self.assertIn("does not report public_demo", str(caught.exception))
        self.assertEqual(deleted, [], "the Access application must not be touched")

    def test_a_failed_public_verification_restores_the_gate(self):
        restored = []
        patches = self._edge_present() + [
            mock.patch.object(publishctl, "origin_guards_live", return_value=(True, "origin ok")),
            mock.patch.object(publishctl, "find_app", return_value={"id": "app-id"}),
            mock.patch.object(publishctl, "call", return_value=(200, {"success": True})),
            mock.patch.object(publishctl, "public_guards_live", return_value=(False, "missing security header x-frame-options")),
            mock.patch.object(publishctl, "restore_gate_or_die", side_effect=lambda *a: restored.append(a) or True),
            mock.patch.object(publishctl.time, "sleep"),
        ]
        for p in patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in patches])
        err = io.StringIO()
        with redirect_stderr(err), self.assertRaises(SystemExit) as caught:
            publishctl.cmd_apply("token", "public", confirm=True,
                                 expect_version="1.1.0", expect_sha="a" * 40)
        self.assertIn("ungate reverted", str(caught.exception))
        self.assertEqual(len(restored), 1, "the gate must be restored exactly once")

    def test_an_interrupt_during_verification_restores_the_gate(self):
        restored = []
        patches = self._edge_present() + [
            mock.patch.object(publishctl, "origin_guards_live", return_value=(True, "origin ok")),
            mock.patch.object(publishctl, "find_app", return_value={"id": "app-id"}),
            mock.patch.object(publishctl, "call", return_value=(200, {"success": True})),
            mock.patch.object(publishctl, "public_guards_live", side_effect=KeyboardInterrupt()),
            mock.patch.object(publishctl, "restore_gate_or_die", side_effect=lambda *a: restored.append(a) or True),
            mock.patch.object(publishctl.time, "sleep"),
        ]
        for p in patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in patches])
        err = io.StringIO()
        with redirect_stderr(err), self.assertRaises(KeyboardInterrupt):
            publishctl.cmd_apply("token", "public", confirm=True,
                                 expect_version="1.1.0", expect_sha="a" * 40)
        self.assertEqual(len(restored), 1, "a Ctrl-C mid-verification must still restore the gate")


class GuardVerificationTests(unittest.TestCase):
    CONFIG = {
        "version": "1.1.0",
        "release_sha": "b" * 40,
        "public_demo": True,
        "guards": {"rate_limit": True, "security_headers": True,
                   "anonymous_writes_anonymized": True, "auto_reset": True},
        "demo": {"reset_interval_minutes": 360},
    }
    HEADERS = {"x-content-type-options": "nosniff", "x-frame-options": "DENY",
               "content-security-policy": "default-src 'self'; frame-ancestors 'none'"}

    def _probe(self, config=None, headers=None, dashboard_status=401):
        import json as _json
        body = _json.dumps(config if config is not None else self.CONFIG).encode()

        def probe(path, timeout=15):
            if path == "/api/dashboard":
                return dashboard_status, {}, b""
            return 200, dict(headers if headers is not None else self.HEADERS), body
        return mock.patch.object(publishctl, "probe_public", side_effect=probe)

    def test_a_correct_build_passes(self):
        with self._probe():
            ok, detail = publishctl.public_guards_live("1.1.0", "b" * 40)
        self.assertTrue(ok, detail)

    def test_a_disabled_guard_fails(self):
        config = {**self.CONFIG, "guards": {**self.CONFIG["guards"], "rate_limit": False}}
        with self._probe(config=config):
            ok, detail = publishctl.public_guards_live("1.1.0", "b" * 40)
        self.assertFalse(ok)
        self.assertIn("rate_limit", detail)

    def test_a_build_without_guard_reporting_fails(self):
        config = {k: v for k, v in self.CONFIG.items() if k != "guards"}
        with self._probe(config=config):
            ok, detail = publishctl.public_guards_live("1.1.0", "b" * 40)
        self.assertFalse(ok)
        self.assertIn("no guard state", detail)

    def test_the_wrong_commit_fails(self):
        with self._probe():
            ok, detail = publishctl.public_guards_live("1.1.0", "c" * 40)
        self.assertFalse(ok)
        self.assertIn("release_sha", detail)

    def test_an_unlabelled_build_fails(self):
        config = {**self.CONFIG, "release_sha": "unversioned"}
        with self._probe(config=config):
            ok, detail = publishctl.public_guards_live("1.1.0", None)
        self.assertFalse(ok)
        self.assertIn("no release commit", detail)

    def test_a_missing_security_header_fails(self):
        headers = {k: v for k, v in self.HEADERS.items() if k != "x-frame-options"}
        with self._probe(headers=headers):
            ok, detail = publishctl.public_guards_live("1.1.0", "b" * 40)
        self.assertFalse(ok)
        self.assertIn("x-frame-options", detail)

    def test_an_authenticated_route_answering_anonymously_fails(self):
        with self._probe(dashboard_status=200):
            ok, detail = publishctl.public_guards_live("1.1.0", "b" * 40)
        self.assertFalse(ok)
        self.assertIn("/api/dashboard", detail)


if __name__ == "__main__":
    unittest.main()
