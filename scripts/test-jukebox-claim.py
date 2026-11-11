#!/usr/bin/env python3
"""Offline CAS tests for exact private Jukebox job lease."""
import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs

spec = importlib.util.spec_from_file_location("jukebox_claim", Path(__file__).with_name("claim-jukebox-render.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
JOB = "123e4567-e89b-42d3-a456-426614174000"
MASTER = "a" * 64


class ClaimTests(unittest.TestCase):
    def execute(self, state="queued", old_attempt=1, contest=False):
        calls = []
        def query(_opener, request):
            fields = parse_qs(urlparse(request.full_url).query)
            method = request.get_method()
            calls.append((method, fields))
            if method == "GET":
                return [{"id": JOB, "state": state, "attempts": old_attempt,
                         "master_sha256": MASTER, "format": "landscape",
                         "duration_seconds": None, "approved_at": None,
                         "published_at": None}]
            self.assertEqual(json.loads(request.data)["state"], "rendering")
            self.assertEqual(fields["attempts"], ["eq." + str(old_attempt)])
            self.assertEqual(fields["state"], ["eq.queued"])
            if contest:
                return []
            return [{"id": JOB, "state": "rendering", "attempts": old_attempt + 1,
                     "master_sha256": MASTER}]
        with (patch.object(module, "request_json", side_effect=query),
              patch.object(module.urllib.request, "build_opener", return_value=object())):
            if state != "queued" or contest or old_attempt >= 5:
                with self.assertRaisesRegex(ValueError, "eligible|concurrent"):
                    module.claim(JOB, "https://example.supabase.co", "service-role-test", True, True)
            else:
                result = module.claim(JOB, "https://example.supabase.co", "service-role-test", True, True)
                self.assertEqual(result["attempt"], old_attempt + 1)
                self.assertEqual(result["master_sha256"], MASTER)
                self.assertFalse(result["published"])
        return calls

    def test_claims_only_matching_queued_attempt(self):
        calls = self.execute()
        self.assertEqual([kind for kind, _ in calls], ["GET", "PATCH"])

    def test_fails_closed_on_active_ready_or_exhausted_jobs(self):
        for kwargs in ({"state":"rendering"}, {"state":"ready"}, {"old_attempt":5}):
            with self.subTest(**kwargs):
                self.assertEqual([kind for kind, _ in self.execute(**kwargs)], ["GET"])

    def test_concurrent_claim_cannot_reserve_twice(self):
        self.assertEqual(len(self.execute(contest=True)), 2)

    def test_disabled_render_claim_fails_before_network(self):
        with self.assertRaisesRegex(ValueError, "operator approval"):
            module.claim(JOB, "https://example.supabase.co", "test", False, True)


if __name__ == "__main__":
    unittest.main()
