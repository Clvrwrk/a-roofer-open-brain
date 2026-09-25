#!/usr/bin/env python3
"""Unit tests for PostgREST fetch resilience in build_pack.py (PEC-415)."""
from __future__ import annotations

import unittest
from unittest import mock

# Import from sibling module (scripts/analytics is not a package).
import build_pack as bp


class PostgrestTransientTest(unittest.TestCase):
    def test_http_500_is_transient(self) -> None:
        self.assertTrue(bp._postgrest_error_transient(500, "{}"))

    def test_statement_timeout_body_is_transient(self) -> None:
        body = '{"code":"57014","message":"canceling statement due to statement timeout"}'
        self.assertTrue(bp._postgrest_error_transient(500, body))

    def test_404_not_transient(self) -> None:
        self.assertFalse(bp._postgrest_error_transient(404, "not found"))


class SbGetPageRetryTest(unittest.TestCase):
    def test_retries_then_succeeds(self) -> None:
        ok_body = b'[{"id":1}]'
        err = mock.Mock()
        err.code = 500
        err.read.return_value = b'{"message":"timeout"}'

        calls = {"n": 0}

        def fake_urlopen(_req, timeout=180):  # noqa: ARG001
            calls["n"] += 1
            if calls["n"] == 1:
                err = bp.urllib.error.HTTPError(
                    url="http://x", code=500, msg="err", hdrs=None, fp=None
                )
                err.read = lambda: b'{"message":"timeout"}'  # type: ignore[method-assign]
                raise err
            resp = mock.Mock()
            resp.read.return_value = ok_body
            resp.__enter__ = mock.Mock(return_value=resp)
            resp.__exit__ = mock.Mock(return_value=False)
            return resp

        with mock.patch.object(bp.urllib.request, "urlopen", side_effect=fake_urlopen):
            with mock.patch.object(bp.time, "sleep"):
                chunk = bp.sb_get_page(
                    "https://rnhmvcpsvtqjlffpsayu.supabase.co",
                    "key",
                    "crm_pipeline",
                    "id",
                    range_start=0,
                    range_end=999,
                )
        self.assertEqual(chunk, [{"id": 1}])
        self.assertEqual(calls["n"], 2)


if __name__ == "__main__":
    unittest.main()
