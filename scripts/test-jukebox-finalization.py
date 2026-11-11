#!/usr/bin/env python3
"""Offline regression: finalizing a private MP4 requires an active matching lease."""
import hashlib
import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

SCRIPT = Path(__file__).with_name("finalize-jukebox-private-preview.py")
spec = importlib.util.spec_from_file_location("jukebox_finalize", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

JOB = "123e4567-e89b-42d3-a456-426614174000"
MASTER = "a" * 64
BLOB = b"synthetic-private-MP4-bytes"
SHA = hashlib.sha256(BLOB).hexdigest()


class Download(io.BytesIO):
    status = 200


class PrivateFinalizeTests(unittest.TestCase):
    def execute(self, state="rendering", attempt=2):
        calls = []

        def query(_opener, request, timeout=45):
            parsed = urlparse(request.full_url)
            where = parse_qs(parsed.query)
            if request.get_method() == "GET":
                calls.append(("get", where))
                return [{"id": JOB, "state": state, "attempts": 2,
                         "master_sha256": MASTER, "approved_at": None,
                         "published_at": None}]
            calls.append(("patch", where))
            self.assertEqual(json.loads(request.data)["state"], "ready")
            return [{"id": JOB}]

        class Opener:
            def open(self, request, timeout):
                calls.append(("download", request.full_url))
                return Download(BLOB)

        with (patch.object(module.private_upload.preview_gate, "verify",
                           return_value={"sha256": SHA, "bytes": len(BLOB)}),
              patch.object(module.private_upload, "endpoint",
                           return_value="https://example.storage.supabase.co/storage/v1/upload/resumable"),
              patch.object(module.urllib.request, "build_opener", return_value=Opener()),
              patch.object(module, "request_json", side_effect=query)):
            if state != "rendering" or attempt != 2:
                with self.assertRaisesRegex(ValueError, "Active render lease"):
                    module.finalize(Path("receipt.json"), Path(JOB + ".mp4"), JOB,
                                    MASTER, "https://example.supabase.co", "secret",
                                    True, True, attempt)
            else:
                result = module.finalize(Path("receipt.json"), Path(JOB + ".mp4"), JOB,
                                         MASTER, "https://example.supabase.co", "secret",
                                         True, True, attempt)
                self.assertEqual(result["status"], "ready_for_private_review")
                self.assertFalse(result["published"])
        return calls

    def test_successful_finalization_requires_rendering_attempt(self):
        calls = self.execute()
        self.assertEqual([type_ for type_, _ in calls], ["get", "download", "patch"])
        patch_where = calls[-1][1]
        self.assertEqual(patch_where["state"], ["eq.rendering"])
        self.assertEqual(patch_where["attempts"], ["eq.2"])
        self.assertEqual(patch_where["master_sha256"], ["eq." + MASTER])

    def test_queued_or_wrong_attempt_never_downloads_or_marks_ready(self):
        for kwargs in ({"state": "queued"}, {"state": "ready"}, {"attempt": 3}):
            with self.subTest(**kwargs):
                self.assertEqual([kind for kind, _ in self.execute(**kwargs)], ["get"])

    def test_missing_or_out_of_range_attempt_rejected_before_storage(self):
        for attempt in (0, 6, -1, True):
            with self.subTest(attempt=attempt):
                with self.assertRaisesRegex(ValueError, "Exact active render attempt"):
                    module.finalize(Path("receipt.json"), Path(JOB + ".mp4"), JOB,
                                    MASTER, "https://example.supabase.co", "secret",
                                    True, True, attempt)


if __name__ == "__main__":
    unittest.main()
