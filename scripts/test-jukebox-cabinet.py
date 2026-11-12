#!/usr/bin/env python3
"""Offline private cabinet staging safeguards."""
import hashlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("cabinet_stage",
    Path(__file__).with_name("stage-jukebox-cabinet.py"))
cabinet=importlib.util.module_from_spec(spec)
spec.loader.exec_module(cabinet)
ORIGIN="https://ereapsfcsqtdmzosgnnn.supabase.co"
OBJECT="jukebox/approved/rockola-cabinet.mp4"
BLOB=b"\x00\x00\x00\x18ftypisom"+b"0"*22000
SHA=hashlib.sha256(BLOB).hexdigest()


class Response(io.BytesIO):
    status=200
    headers={"Content-Type":"video/mp4"}
    def __enter__(self): return self
    def __exit__(self,*_): self.close()


class CabinetTests(unittest.TestCase):
    def test_pinned_cabinet_downloads_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            class Opener:
                def open(self,request,timeout):
                    self_url=request.full_url
                    self.assertTrue(self_url.startswith(ORIGIN+"/storage/v1/object/public/assets/jukebox/"))
                    return Response(BLOB)
            opener=Opener()
            opener.assertTrue=self.assertTrue
            with patch.object(cabinet.urllib.request,"build_opener",return_value=opener):
                result=cabinet.stage_cabinet(OBJECT,SHA,ORIGIN,folder)
            self.assertEqual(result["sha256"],SHA)
            self.assertEqual((folder/"cabinet.mp4").read_bytes(),BLOB)
            self.assertFalse(result["published"])
            with self.assertRaisesRegex(ValueError,"Existing cabinet"):
                cabinet.stage_cabinet(OBJECT,SHA,ORIGIN,folder)

    def test_blocks_unapproved_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            for path in ("../other.mp4","neural-beat/clip.mp4",
                         "jukebox/approved/../../private.mp4",
                         "https://external.example/movie.mp4","jukebox/approved/not-video.jpg"):
                with self.subTest(path=path):
                    with self.assertRaisesRegex(ValueError,"approved cabinet path"):
                        cabinet.stage_cabinet(path,SHA,ORIGIN,Path(tmp))

    def test_fails_closed_and_cleans_changed_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            class Opener:
                def open(self,request,timeout): return Response(BLOB)
            with patch.object(cabinet.urllib.request,"build_opener",return_value=Opener()):
                with self.assertRaisesRegex(ValueError,"digest mismatch"):
                    cabinet.stage_cabinet(OBJECT,"0"*64,ORIGIN,folder)
            self.assertFalse((folder/"cabinet.mp4").exists())


if __name__=="__main__":
    unittest.main()
