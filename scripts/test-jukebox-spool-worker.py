#!/usr/bin/env python3
"""Offline checks for private, bounded Jukebox spool scheduling."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location("jukebox_spool",
    Path(__file__).with_name("run-jukebox-spool-worker.py"))
spool=importlib.util.module_from_spec(spec)
spec.loader.exec_module(spool)

A="123e4567-e89b-42d3-a456-426614174000"
B="123e4567-e89b-42d3-a456-426614174001"


class SpoolTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root=Path(temp.name)
        self.called=[]

    def stage(self, job=A):
        folder=self.root/job
        folder.mkdir()
        (folder/"job.json").write_text(json.dumps({
            "jobId":job,"audio":"master.wav","jukebox":"cabinet.mp4"
        }),encoding="utf-8")
        (folder/"clip-export.json").write_text("{}",encoding="utf-8")
        (folder/"master.wav").write_bytes(b"audio")
        (folder/"cabinet.mp4").write_bytes(b"video")
        return folder

    def fake(self, export,audio,jukebox,work,out,job,*flags):
        self.called.append(job)
        self.assertEqual(export.parent.name,job)
        self.assertEqual(out.name,job+".mp4")
        self.assertEqual(flags[:3],(True,False,"https://example.supabase.co"))
        return {"state":"rendered_private"}

    def test_stages_one_job_without_publishing(self):
        self.stage(A);self.stage(B)
        result=spool.once(self.root,enabled=True,
            origin="https://example.supabase.co",key="not-real",limit=1,
            runner=self.fake)
        self.assertEqual(self.called,[A])
        self.assertEqual(result,[{"job_id":A,"ok":True,"state":"rendered_private",
                                  "youtube_published":False}])

    def test_disabled_or_missing_credentials_never_calls_runner(self):
        self.stage()
        for params in ({"enabled":False,"origin":"https://example.supabase.co","key":"test"},
                       {"enabled":True,"origin":"","key":"test"}):
            with self.assertRaises(ValueError):
                spool.once(self.root,runner=self.fake,**params)
        self.assertEqual(self.called,[])

    def test_rejects_traversal_and_unapproved_file_types(self):
        folder=self.stage()
        for audio in ("../master.wav","https://external.example/music.wav",
                      "master.exe"):
            (folder/"job.json").write_text(json.dumps({
                "jobId":A,"audio":audio,"jukebox":"cabinet.mp4"
            }),encoding="utf-8")
            result=spool.once(self.root,enabled=True,
                origin="https://example.supabase.co",key="test",runner=self.fake)
            self.assertFalse(result[0]["ok"])
            self.assertTrue(result[0]["requires_manual_reconciliation"])
        self.assertEqual(self.called,[])

    def test_does_not_rerun_existing_work(self):
        folder=self.stage()
        (folder/"render-work").mkdir()
        result=spool.once(self.root,enabled=True,
            origin="https://example.supabase.co",key="test",runner=self.fake)
        self.assertFalse(result[0]["ok"])
        self.assertEqual(self.called,[])

    def test_does_not_retry_failed_unknown_claim(self):
        self.stage()
        def fail(*a):
            self.called.append("once")
            raise RuntimeError("unknown job outcome")
        result=spool.once(self.root,enabled=True,
            origin="https://example.supabase.co",key="test",runner=fail)
        self.assertEqual(self.called,["once"])
        self.assertTrue(result[0]["requires_manual_reconciliation"])

    def test_rejects_symlink_and_duplicate_output(self):
        folder=self.stage()
        (folder/"master.wav").unlink()
        (folder/"master.wav").symlink_to(folder/"cabinet.mp4")
        result=spool.once(self.root,enabled=True,
            origin="https://example.supabase.co",key="test",runner=self.fake)
        self.assertFalse(result[0]["ok"])
        self.assertEqual(self.called,[])


if __name__=="__main__":
    unittest.main()
